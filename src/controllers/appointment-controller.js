const appointments = require('../services/appointment-service');
const db = require('../config/database');
const { success, failure } = require('../utils/api-response');
const { pagination, pageMeta } = require('../utils/pagination');

async function slots(req, res) {
  const result = await appointments.getAvailableSlots(Number(req.query.serviceId), Number(req.query.doctorId), req.query.date);
  return success(res, result, 'ساعت‌های خالی دریافت شد');
}

async function create(req, res) {
  const result = await appointments.createAppointment(req.auth.sub, req.body);
  return success(res, result, 'درخواست نوبت شما ثبت شد', null, 201);
}

async function mine(req, res) {
  const result = await appointments.listUserAppointments(req.auth.sub, req.query);
  return success(res, result.rows, 'نوبت‌های شما دریافت شد', result.meta);
}

async function cancel(req, res) {
  const result = await appointments.cancelAppointment(Number(req.params.id), req.auth.sub);
  return success(res, result, 'نوبت با موفقیت لغو شد');
}

async function adminList(req, res) {
  const { page, limit, offset } = pagination(req.query);
  let builder = db('appointments').whereNull('appointments.deleted_at')
    .join('users', 'appointments.user_id', 'users.id')
    .join('services', 'appointments.service_id', 'services.id')
    .join('doctors', 'appointments.doctor_id', 'doctors.id');
  for (const field of ['status', 'doctor_id', 'service_id', 'appointment_date']) {
    if (req.query[field]) builder = builder.where(`appointments.${field}`, req.query[field]);
  }
  if (req.query.search) builder = builder.where('users.phone', 'like', `%${req.query.search}%`);
  const total = Number((await builder.clone().count({ total: '*' }).first()).total);
  const rows = await builder.clone().select('appointments.*', 'users.phone', 'users.first_name', 'users.last_name',
    'services.title as service_title', 'doctors.name as doctor_name')
    .orderBy('appointment_date', 'desc').orderBy('start_time').limit(limit).offset(offset);
  return success(res, rows.map(appointments.presentAppointment), 'فهرست نوبت‌ها دریافت شد', pageMeta(page, limit, total));
}

async function adminCreate(req, res) {
  const user = req.body.phone
    ? await db('users').where({ phone: require('../utils/phone').normalizeIranianPhone(req.body.phone) }).first()
    : await db('users').where({ id: req.body.userId }).first();
  if (!user) return failure(res, 'کاربر مورد نظر پیدا نشد', 404);
  const data = await appointments.createAppointment(user.id, req.body, { adminOverride: true });
  return success(res, data, 'نوبت با موفقیت ثبت شد', null, 201);
}

async function updateStatus(req, res) {
  const allowed = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
  if (!allowed.includes(req.body.status)) return failure(res, 'وضعیت نوبت معتبر نیست', 422);
  const row = await db('appointments').where({ id: req.params.id }).first();
  if (!row) return failure(res, 'نوبت مورد نظر پیدا نشد', 404);
  await db('appointments').where({ id: row.id }).update({
    status: req.body.status, admin_note: req.body.adminNote || null, updated_at: db.fn.now()
  });
  if (row.status !== req.body.status && ['confirmed', 'cancelled'].includes(req.body.status)) {
    try {
      const user = await db('users').where({ id: row.user_id }).first();
      const template = req.body.status === 'confirmed' ? 'appointment_confirmed' : 'appointment_cancelled';
      await require('../services/sms').sendSms(user.phone, template, {
        date: row.appointment_date, time: row.start_time
      });
    } catch (error) {
      require('../config/logger').error({ err: error, appointmentId: row.id }, 'Appointment status SMS failed');
    }
  }
  return success(res, await db('appointments').where({ id: row.id }).first(), 'وضعیت نوبت به‌روزرسانی شد');
}

module.exports = { slots, create, mine, cancel, adminList, adminCreate, updateStatus };
