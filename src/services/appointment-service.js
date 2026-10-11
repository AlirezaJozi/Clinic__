const db = require('../config/database');
const settingsService = require('./settings-service');
const { sendSms } = require('./sms');
const jalaali = require('jalaali-js');

function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

function tehranDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TEHRAN_TIMEZONE || 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

async function getAvailableSlots(serviceId, doctorId, date) {
  if (!validDate(date)) throw Object.assign(new Error('تاریخ انتخاب‌شده معتبر نیست'), { status: 422 });
  const now = tehranDateTime();
  if (date < now.date) throw Object.assign(new Error('امکان مشاهده ساعت‌های تاریخ گذشته وجود ندارد'), { status: 422 });
  const service = await db('services').where({ id: serviceId, is_active: true }).whereNull('deleted_at').first();
  if (!service) throw Object.assign(new Error('خدمت مورد نظر پیدا نشد'), { status: 404 });
  const relation = await db('doctor_services').where({ doctor_id: doctorId, service_id: serviceId }).first();
  const doctor = await db('doctors').where({ id: doctorId, is_active: true }).whereNull('deleted_at').first();
  if (!relation || !doctor) throw Object.assign(new Error('این پزشک خدمت انتخاب‌شده را ارائه نمی‌کند'), { status: 422 });
  const holiday = await db('holidays').where({ holiday_date: date }).first();
  if (holiday) return [];
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const schedules = await db('doctor_schedules').where({ doctor_id: doctorId, weekday, is_active: true });
  const existing = await db('appointments').where({ doctor_id: doctorId, appointment_date: date })
    .whereIn('status', ['pending', 'confirmed']).select('start_time', 'end_time');
  const slots = [];
  for (const schedule of schedules) {
    let cursor = toMinutes(schedule.start_time);
    const end = toMinutes(schedule.end_time);
    while (cursor + service.duration_minutes <= end) {
      const slotEnd = cursor + service.duration_minutes;
      const overlaps = existing.some((item) => cursor < toMinutes(item.end_time) && slotEnd > toMinutes(item.start_time));
      const isPastToday = date === now.date && cursor <= toMinutes(`${now.time}:00`);
      if (!overlaps && !isPastToday) slots.push({ startTime: toTime(cursor), endTime: toTime(slotEnd) });
      cursor += 15;
    }
  }
  return slots;
}

async function createAppointment(userId, input, options = {}) {
  const settings = await settingsService.getAll();
  if (!options.adminOverride && settings.online_booking_enabled === false) {
    throw Object.assign(new Error('رزرو آنلاین در حال حاضر غیرفعال است'), { status: 403 });
  }
  if (!validDate(input.date)) throw Object.assign(new Error('تاریخ انتخاب‌شده معتبر نیست'), { status: 422 });
  const created = await db.transaction(async (trx) => {
    const doctor = await trx('doctors').where({ id: input.doctorId, is_active: true })
      .whereNull('deleted_at').forUpdate().first();
    const service = await trx('services').where({ id: input.serviceId, is_active: true })
      .whereNull('deleted_at').first();
    const relation = await trx('doctor_services').where({ doctor_id: input.doctorId, service_id: input.serviceId }).first();
    if (!doctor || !service || !relation) throw Object.assign(new Error('پزشک یا خدمت انتخاب‌شده معتبر نیست'), { status: 422 });
    const now = tehranDateTime();
    if (input.date < now.date || (input.date === now.date && input.startTime.slice(0, 5) <= now.time)) {
      throw Object.assign(new Error('امکان رزرو در زمان گذشته وجود ندارد'), { status: 422 });
    }
    const holiday = await trx('holidays').where({ holiday_date: input.date }).first();
    if (holiday) throw Object.assign(new Error('این روز تعطیل است'), { status: 422 });
    const weekday = new Date(`${input.date}T00:00:00Z`).getUTCDay();
    const time = input.startTime.slice(0, 5);
    const startsAt = toMinutes(time);
    const endsAt = startsAt + service.duration_minutes;
    const schedules = await trx('doctor_schedules').where({ doctor_id: input.doctorId, weekday, is_active: true });
    const insideSchedule = schedules.some((schedule) =>
      startsAt >= toMinutes(schedule.start_time) && endsAt <= toMinutes(schedule.end_time) &&
      (startsAt - toMinutes(schedule.start_time)) % 15 === 0);
    if (!insideSchedule) throw Object.assign(new Error('ساعت انتخاب‌شده در برنامه کاری پزشک نیست'), { status: 422 });
    const conflict = await trx('appointments').where({ doctor_id: input.doctorId, appointment_date: input.date })
      .whereIn('status', ['pending', 'confirmed'])
      .where('start_time', '<', toTime(endsAt)).where('end_time', '>', toTime(startsAt)).forUpdate().first();
    if (conflict) throw Object.assign(new Error('این ساعت قبلاً رزرو شده است'), { status: 409 });
    const [id] = await trx('appointments').insert({
      user_id: userId, service_id: input.serviceId, doctor_id: input.doctorId,
      appointment_date: input.date, start_time: toTime(startsAt), end_time: toTime(endsAt),
      status: settings.booking_auto_confirm ? 'confirmed' : 'pending',
      user_note: input.note || null
    });
    return trx('appointments').where({ id }).first();
  });
  try {
    const user = await db('users').where({ id: userId }).first();
    await sendSms(user.phone, 'appointment_created', { date: created.appointment_date, time: created.start_time });
  } catch (error) {
    require('../config/logger').error({ err: error, appointmentId: created.id }, 'Appointment SMS failed');
  }
  return presentAppointment(created);
}

async function listUserAppointments(userId, query) {
  const { pagination, pageMeta } = require('../utils/pagination');
  const { page, limit, offset } = pagination(query);
  let builder = db('appointments').where({ 'appointments.user_id': userId }).whereNull('appointments.deleted_at')
    .join('services', 'appointments.service_id', 'services.id').join('doctors', 'appointments.doctor_id', 'doctors.id');
  if (query.status) builder = builder.where('appointments.status', query.status);
  const total = Number((await builder.clone().count({ total: '*' }).first()).total);
  const rows = await builder.clone().select('appointments.*', 'services.title as service_title', 'doctors.name as doctor_name')
    .orderBy('appointment_date', 'desc').orderBy('start_time', 'desc').limit(limit).offset(offset);
  return { rows: rows.map(presentAppointment), meta: pageMeta(page, limit, total) };
}

async function cancelAppointment(id, userId, isAdmin = false) {
  const settings = await settingsService.getAll();
  const appointment = await db('appointments').where({ id }).first();
  if (!appointment || (!isAdmin && appointment.user_id !== userId)) {
    throw Object.assign(new Error('نوبت مورد نظر پیدا نشد'), { status: 404 });
  }

  if (!['pending', 'confirmed'].includes(appointment.status)) {
    throw Object.assign(new Error('وضعیت این نوبت قابل لغو نیست'), { status: 409 });
  }
  const start = new Date(`${appointment.appointment_date}T${appointment.start_time}+03:30`);
  const hoursLeft = (start.getTime() - Date.now()) / 3600000;
  const deadline = Number(settings.cancellation_deadline_hours || 12);
  if (!isAdmin && hoursLeft < deadline) {
    throw Object.assign(new Error(`لغو نوبت فقط تا ${deadline} ساعت قبل امکان‌پذیر است`), { status: 409 });
  }
  await db('appointments').where({ id }).update({ status: 'cancelled', cancelled_at: db.fn.now(), updated_at: db.fn.now() });
  try {
    const user = await db('users').where({ id: appointment.user_id }).first();
    await sendSms(user.phone, 'appointment_cancelled', { date: appointment.appointment_date, time: appointment.start_time });
  } catch (error) {
    require('../config/logger').error({ err: error, appointmentId: id }, 'Cancellation SMS failed');
  }
  return db('appointments').where({ id }).first().then(presentAppointment);
}

async function rescheduleAppointment(id, userId, input) {
  const settings = await settingsService.getAll();
  const deadline = Number(settings.cancellation_deadline_hours || 12);
  const updated = await db.transaction(async (trx) => {
    const current = await trx('appointments').where({ id }).forUpdate().first();
    if (!current || current.user_id !== userId) throw Object.assign(new Error('نوبت مورد نظر پیدا نشد'), { status: 404 });
    if (!['pending', 'confirmed'].includes(current.status)) throw Object.assign(new Error('این نوبت قابل جابه‌جایی نیست'), { status: 409 });
    const oldStart = new Date(`${current.appointment_date}T${current.start_time}+03:30`);
    if ((oldStart.getTime() - Date.now()) / 3600000 < deadline) {
      throw Object.assign(new Error(`جابجایی نوبت فقط تا ${deadline} ساعت قبل امکان‌پذیر است`), { status: 409 });
    }
    const doctor = await trx('doctors').where({ id: input.doctorId, is_active: true }).whereNull('deleted_at').forUpdate().first();
    const service = await trx('services').where({ id: input.serviceId, is_active: true }).whereNull('deleted_at').first();
    const relation = await trx('doctor_services').where({ doctor_id: input.doctorId, service_id: input.serviceId }).first();
    if (!doctor || !service || !relation || !validDate(input.date)) {
      throw Object.assign(new Error('پزشک، خدمت یا تاریخ انتخاب‌شده معتبر نیست'), { status: 422 });
    }
    const date = input.date;
    const now = tehranDateTime();
    if (date < now.date || (date === now.date && input.startTime.slice(0, 5) <= now.time)) {
      throw Object.assign(new Error('امکان رزرو در زمان گذشته وجود ندارد'), { status: 422 });
    }
    if (await trx('holidays').where({ holiday_date: date }).first()) throw Object.assign(new Error('این روز تعطیل است'), { status: 422 });
    const start = toMinutes(input.startTime.slice(0, 5));
    const end = start + service.duration_minutes;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const schedules = await trx('doctor_schedules').where({ doctor_id: input.doctorId, weekday, is_active: true });
    const fits = schedules.some((schedule) =>
      start >= toMinutes(schedule.start_time) && end <= toMinutes(schedule.end_time) &&
      (start - toMinutes(schedule.start_time)) % 15 === 0);
    if (!fits) throw Object.assign(new Error('ساعت انتخاب‌شده در برنامه کاری پزشک نیست'), { status: 422 });
    const conflict = await trx('appointments').where({ doctor_id: input.doctorId, appointment_date: date })
      .whereNot({ id }).whereIn('status', ['pending', 'confirmed'])
      .where('start_time', '<', toTime(end)).where('end_time', '>', toTime(start)).forUpdate().first();
    if (conflict) throw Object.assign(new Error('این ساعت قبلاً رزرو شده است'), { status: 409 });
    const status = settings.booking_auto_confirm ? 'confirmed' : 'pending';
    await trx('appointments').where({ id }).update({
      doctor_id: input.doctorId, service_id: input.serviceId, appointment_date: date,
      start_time: toTime(start), end_time: toTime(end), status, user_note: input.note || current.user_note,
      updated_at: trx.fn.now()
    });
    return trx('appointments').where({ id }).first();
  });
  try {
    const user = await db('users').where({ id: userId }).first();
    await sendSms(user.phone, 'appointment_rescheduled', {
      date: updated.appointment_date, time: updated.start_time
    });
  } catch (error) {
    require('../config/logger').error({ err: error, appointmentId: id }, 'Reschedule SMS failed');
  }
  return presentAppointment(updated);
}

function presentAppointment(item) {
  if (!item) return item;
  const date = item.appointment_date instanceof Date
  ? item.appointment_date.toISOString().slice(0, 10)
  : String(item.appointment_date).slice(0, 10);
  const [year, month, day] = date.split('-').map(Number);
  return { ...item, appointmentDate: date, jalaliDate: jalaali.toJalaali(year, month, day) };
}

function toMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
}

module.exports = { getAvailableSlots, createAppointment, listUserAppointments, cancelAppointment, rescheduleAppointment, presentAppointment };
