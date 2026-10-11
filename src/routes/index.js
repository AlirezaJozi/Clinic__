const express = require('express');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const { success, failure } = require('../utils/api-response');
const { upload, processImage, uploadRoot, isPdf } = require('../middleware/upload');
const { sendSms } = require('../services/sms');
const authController = require('../controllers/auth-controller');
const catalog = require('../controllers/catalog-controller');
const appointment = require('../controllers/appointment-controller');
const admin = require('../controllers/admin-controller');
const { audit } = require('../middleware/audit');
const { paginateQuery } = require('../utils/db-pagination');

const router = express.Router();
const admins = authorize('admin', 'superadmin');
const appointmentStaff = authorize('admin', 'superadmin', 'operator', 'secretary');
const adminOtpLimit = rateLimit({
  windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => failure(res, 'تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید', 429)
});
const otpSchema = Joi.object({ phone: Joi.string().required() });
const idSchema = Joi.object({ id: Joi.number().integer().positive().required() });
const authFields = {
  otpRequest: validate(otpSchema),
  otpVerify: validate(Joi.object({ phone: Joi.string().required(), code: Joi.string().pattern(/^\d{5}$/).required() })),
  refresh: validate(Joi.object({ refreshToken: Joi.string().min(30).required() })),
  password: validate(Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(8).required() }))
};

router.get('/health', (req, res) => success(res, { status: 'ok' }, 'سرویس فعال است'));

router.post('/auth/otp/request', adminOtpLimit, authFields.otpRequest, asyncHandler(authController.requestOtp));
router.post('/auth/otp/verify', adminOtpLimit, authFields.otpVerify, asyncHandler(authController.verifyOtp));
router.post('/auth/refresh', authFields.refresh, asyncHandler(authController.refresh));
router.post('/auth/logout', authenticate, authFields.refresh, asyncHandler(authController.logout));
router.post('/auth/admin/password', adminOtpLimit, authFields.password, asyncHandler(authController.passwordLogin));
router.get('/auth/me', authenticate, asyncHandler(async (req, res) => {
  const user = await db('users').select('id', 'phone', 'email', 'first_name', 'last_name', 'role')
    .where({ id: req.auth.sub }).whereNull('deleted_at').first();
  if (!user) return failure(res, 'کاربر مورد نظر پیدا نشد', 404);
  return success(res, user, 'اطلاعات حساب کاربری دریافت شد');
}));
router.patch('/auth/profile', authenticate, validate(Joi.object({
  first_name: Joi.string().max(100), last_name: Joi.string().max(100), email: Joi.string().email().max(190).allow(null, '')
}).min(1)), asyncHandler(authController.profile));

router.get('/settings/public', asyncHandler(catalog.publicSettings));
router.get('/services', asyncHandler(catalog.services));
router.get('/services/:slug', asyncHandler(catalog.service));
router.get('/service-categories', asyncHandler(catalog.categories));
router.get('/doctors', asyncHandler(catalog.doctors));
router.get('/doctors/:id', validate(Joi.object({ id: Joi.number().integer().positive().required() }), 'params'), asyncHandler(catalog.doctor));
router.get('/portfolio', asyncHandler(catalog.portfolio));
router.get('/gallery', asyncHandler(catalog.gallery));
router.get('/reviews', asyncHandler(catalog.reviews));
router.get('/articles', asyncHandler(catalog.articles));
router.get('/articles/:slug', asyncHandler(catalog.article));
router.get('/pages/:slug', asyncHandler(catalog.page));

router.get('/appointments/slots', validate(Joi.object({
  serviceId: Joi.number().integer().positive().required(),
  doctorId: Joi.number().integer().positive().required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required()
}), 'query'), asyncHandler(appointment.slots));
router.post('/appointments', authenticate, validate(Joi.object({
  serviceId: Joi.number().integer().positive().required(),
  doctorId: Joi.number().integer().positive().required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  startTime: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(),
  note: Joi.string().max(2000).allow('', null)
})), asyncHandler(appointment.create));
router.get('/appointments/mine', authenticate, asyncHandler(appointment.mine));
router.patch('/appointments/:id/reschedule', authenticate, validate(idSchema, 'params'),
  validate(Joi.object({
    serviceId: Joi.number().integer().positive().required(),
    doctorId: Joi.number().integer().positive().required(),
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    startTime: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(),
    note: Joi.string().max(2000).allow('', null)
  })), asyncHandler(async (req, res) => {
    const item = await require('../services/appointment-service').rescheduleAppointment(
      Number(req.params.id), req.auth.sub, req.body
    );
    return success(res, item, 'نوبت با موفقیت جابه‌جا شد');
  }));
router.post('/appointments/:id/cancel', authenticate, validate(idSchema, 'params'), asyncHandler(appointment.cancel));
router.post('/reviews', authenticate, validate(Joi.object({
  service_id: Joi.number().integer().positive().allow(null),
  rating: Joi.number().integer().min(1).max(5).required(),
  body: Joi.string().min(3).max(5000).required()
})), asyncHandler(async (req, res) => {
  const [id] = await db('reviews').insert({ ...req.body, user_id: req.auth.sub, is_approved: false });
  return success(res, { id }, 'نظر شما برای بررسی ثبت شد', null, 201);
}));

router.post('/consultations', authenticate, validate(Joi.object({
  name: Joi.string().min(2).max(180).required(),
  message: Joi.string().max(3000).allow('', null)
})), asyncHandler(async (req, res) => {
  const user = await db('users').where({ id: req.auth.sub }).first();
  const [id] = await db('consultation_requests').insert({
    user_id: user.id, name: req.body.name, phone: user.phone, message: req.body.message || null
  });
  return success(res, { id }, 'درخواست مشاوره شما ثبت شد', null, 201);
}));

router.post('/tickets', authenticate, validate(Joi.object({
  subject: Joi.string().min(3).max(220).required(),
  body: Joi.string().min(1).max(5000).required()
})), asyncHandler(async (req, res) => {
  const result = await db.transaction(async (trx) => {
    const [ticketId] = await trx('tickets').insert({ user_id: req.auth.sub, subject: req.body.subject });
    const [messageId] = await trx('ticket_messages').insert({
      ticket_id: ticketId, sender_id: req.auth.sub, body: req.body.body, is_admin_reply: false
    });
    return { id: ticketId, messageId };
  });
  return success(res, result, 'تیکت شما ثبت شد', null, 201);
}));
router.get('/tickets', authenticate, asyncHandler(async (req, res) => {
  let builder = db('tickets').where({ user_id: req.auth.sub }).whereNull('deleted_at');
  if (req.query.status) builder = builder.where({ status: req.query.status });
  const result = await paginateQuery(builder, req.query);
  return success(res, result.rows, 'فهرست تیکت‌های شما دریافت شد', result.meta);
}));
router.get('/tickets/:id/messages', authenticate, validate(idSchema, 'params'), asyncHandler(async (req, res) => {
  const ticket = await db('tickets').where({ id: req.params.id }).first();
  if (!ticket || (ticket.user_id !== req.auth.sub && !['admin', 'superadmin'].includes(req.auth.role))) {
    return failure(res, 'تیکت مورد نظر پیدا نشد', 404);
  }
  const result = await paginateQuery(db('ticket_messages').where({ ticket_id: ticket.id }), req.query, 'created_at', 'asc');
  return success(res, result.rows, 'گفت‌وگوی تیکت دریافت شد', result.meta);
}));
router.post('/tickets/:id/messages', authenticate, validate(idSchema, 'params'),
  validate(Joi.object({ body: Joi.string().min(1).max(5000).required() })),
  asyncHandler(async (req, res) => {
    const ticket = await db('tickets').where({ id: req.params.id }).first();
    if (!ticket || ticket.user_id !== req.auth.sub || ticket.status === 'closed') {
      return failure(res, 'امکان ارسال پیام برای این تیکت وجود ندارد', 404);
    }
    const [id] = await db('ticket_messages').insert({
      ticket_id: ticket.id, sender_id: req.auth.sub, body: req.body.body, is_admin_reply: false
    });
    return success(res, { id }, 'پیام شما ثبت شد', null, 201);
  }));

const CRUD = admin.CRUD;
for (const [entity, config] of Object.entries(CRUD)) {
  const handlers = admin.crudHandlers(entity);
  const prefix = `/admin/${entity}`;
  router.get(prefix, authenticate, admins, asyncHandler(handlers.list));
  router.post(prefix, authenticate, admins,
    validate(config.schema.fork(config.requiredFields, (schema) => schema.required())),
    audit('create', entity), asyncHandler(handlers.create));
  router.get(`${prefix}/:id`, authenticate, admins, validate(idSchema, 'params'), asyncHandler(handlers.get));
  router.patch(`${prefix}/:id`, authenticate, admins, validate(idSchema, 'params'), validate(config.schema),
    audit('update', entity), asyncHandler(handlers.update));
  router.delete(`${prefix}/:id`, authenticate, admins, validate(idSchema, 'params'), audit('delete', entity), asyncHandler(handlers.remove));
}

router.get('/admin/settings', authenticate, admins, asyncHandler(async (req, res) =>
  success(res, await require('../services/settings-service').getAll(), 'تنظیمات دریافت شد')));
router.patch('/admin/settings', authenticate, authorize('superadmin'), validate(Joi.object().min(1)), audit('update', 'settings'),
  asyncHandler(admin.updateSettings));
router.get('/admin/dashboard', authenticate, admins, asyncHandler(admin.dashboard));
router.get('/admin/users', authenticate, admins, asyncHandler(admin.users));
router.patch('/admin/users/:id/block', authenticate, admins, validate(idSchema, 'params'),
  validate(Joi.object({ isBlocked: Joi.boolean().required() })), audit('update', 'user'), asyncHandler(admin.blockUser));
router.patch('/admin/users/:id/role', authenticate, authorize('superadmin'), validate(idSchema, 'params'),
  validate(Joi.object({ role: Joi.string().valid('user', 'admin', 'superadmin', 'operator', 'secretary').required() })),
  audit('update_role', 'user'), asyncHandler(admin.updateUserRole));
router.patch('/admin/users/:id/password', authenticate, authorize('superadmin'), validate(idSchema, 'params'),
  validate(Joi.object({
    email: Joi.string().email().max(190).allow(null, ''),
    password: Joi.string().min(12).max(128).required()
  })), audit('set_staff_password', 'user'), asyncHandler(admin.setStaffPassword));
router.get('/admin/appointments', authenticate, appointmentStaff, asyncHandler(appointment.adminList));
router.post('/admin/appointments', authenticate, appointmentStaff, validate(Joi.object({
  userId: Joi.number().integer().positive(),
  phone: Joi.string(),
  serviceId: Joi.number().integer().positive().required(),
  doctorId: Joi.number().integer().positive().required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  startTime: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(),
  note: Joi.string().max(2000).allow('', null)
}).xor('userId', 'phone')), asyncHandler(appointment.adminCreate));
router.patch('/admin/appointments/:id/status', authenticate, appointmentStaff, validate(idSchema, 'params'),
  validate(Joi.object({ status: Joi.string().valid('pending', 'confirmed', 'cancelled', 'completed', 'no_show').required(), adminNote: Joi.string().max(2000).allow('', null) })),
  audit('update_status', 'appointment'), asyncHandler(appointment.updateStatus));
router.get('/admin/appointments/export.csv', authenticate, appointmentStaff, asyncHandler(admin.exportAppointments));

router.post('/admin/doctors/:doctorId/services', authenticate, admins,
  validate(Joi.object({ doctorId: Joi.number().integer().positive().required() }), 'params'),
  validate(Joi.object({ serviceIds: Joi.array().items(Joi.number().integer().positive()).unique().required() })),
  asyncHandler(async (req, res) => {
    const doctor = await db('doctors').where({ id: req.params.doctorId }).whereNull('deleted_at').first();
    if (!doctor) return failure(res, 'پزشک مورد نظر پیدا نشد', 404);
    await db.transaction(async (trx) => {
      await trx('doctor_services').where({ doctor_id: doctor.id }).del();
      if (req.body.serviceIds.length) {
        await trx('doctor_services').insert(req.body.serviceIds.map((serviceId) => ({ doctor_id: doctor.id, service_id: serviceId })));
      }
    });
    return success(res, req.body.serviceIds, 'خدمات پزشک به‌روزرسانی شد');
  }));

router.get('/admin/doctors/:doctorId/schedules', authenticate, admins, asyncHandler(async (req, res) => {
  const rows = await db('doctor_schedules').where({ doctor_id: req.params.doctorId }).whereNull('deleted_at').orderBy('weekday');
  return success(res, rows, 'برنامه کاری پزشک دریافت شد');
}));
router.put('/admin/doctors/:doctorId/schedules', authenticate, admins,
  validate(Joi.object({ doctorId: Joi.number().integer().positive().required() }), 'params'),
  validate(Joi.object({ schedules: Joi.array().items(Joi.object({
    weekday: Joi.number().integer().min(0).max(6).required(),
    start_time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
    end_time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
    is_active: Joi.boolean().default(true)
  }).required()).required() })), asyncHandler(async (req, res) => {
    const doctor = await db('doctors').where({ id: req.params.doctorId }).first();
    if (!doctor) return failure(res, 'پزشک مورد نظر پیدا نشد', 404);
    await db.transaction(async (trx) => {
      await trx('doctor_schedules').where({ doctor_id: doctor.id }).del();
      if (req.body.schedules.length) await trx('doctor_schedules').insert(req.body.schedules.map((item) => ({ ...item, doctor_id: doctor.id })));
    });
    return success(res, req.body.schedules, 'برنامه کاری پزشک به‌روزرسانی شد');
  }));

router.post('/admin/uploads', authenticate, admins, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return failure(res, 'فایلی برای بارگذاری انتخاب نشده است', 422);
  let result;
  if (req.file.mimetype === 'application/pdf') {
    if (!isPdf(req.file)) return failure(res, 'فایل PDF معتبر نیست', 422);
    const filename = `document-${Date.now()}-${crypto.randomUUID()}.pdf`;
    await fs.writeFile(path.join(uploadRoot, filename), req.file.buffer, { flag: 'wx' });
    result = { url: `/uploads/${filename}` };
  } else {
    result = await processImage(req.file);
  }
  return success(res, result, 'فایل با موفقیت بارگذاری شد', null, 201);
}));

router.post('/admin/doctors/:doctorId/documents', authenticate, admins,
  validate(Joi.object({ doctorId: Joi.number().integer().positive().required() }), 'params'),
  validate(Joi.object({ title: Joi.string().min(1).max(180).required(), file_url: Joi.string().uri({ relativeOnly: true }).required(), document_year: Joi.number().integer().min(1900).max(2200) })),
  asyncHandler(async (req, res) => {
    const [id] = await db('doctor_documents').insert({ ...req.body, doctor_id: req.params.doctorId });
    return success(res, await db('doctor_documents').where({ id }).first(), 'مدرک پزشک ثبت شد', null, 201);
  }));
router.get('/admin/doctors/:doctorId/documents', authenticate, admins, asyncHandler(async (req, res) => {
  const result = await paginateQuery(
    db('doctor_documents').where({ doctor_id: req.params.doctorId }).whereNull('deleted_at'),
    req.query
  );
  return success(res, result.rows, 'مدارک پزشک دریافت شد', result.meta);
}));
router.patch('/admin/doctors/:doctorId/documents/:documentId', authenticate, admins,
  validate(Joi.object({ doctorId: Joi.number().integer().positive().required(), documentId: Joi.number().integer().positive().required() }), 'params'),
  validate(Joi.object({
    title: Joi.string().min(1).max(180),
    file_url: Joi.string().uri({ relativeOnly: true }),
    document_year: Joi.number().integer().min(1900).max(2200).allow(null)
  }).min(1)), asyncHandler(async (req, res) => {
    const changed = await db('doctor_documents').where({ id: req.params.documentId, doctor_id: req.params.doctorId })
      .whereNull('deleted_at').update({ ...req.body, updated_at: db.fn.now() });
    if (!changed) return failure(res, 'مدرک پزشک پیدا نشد', 404);
    return success(res, await db('doctor_documents').where({ id: req.params.documentId }).first(), 'مدرک پزشک به‌روزرسانی شد');
  }));
router.delete('/admin/doctors/:doctorId/documents/:documentId', authenticate, admins,
  validate(Joi.object({ doctorId: Joi.number().integer().positive().required(), documentId: Joi.number().integer().positive().required() }), 'params'),
  asyncHandler(async (req, res) => {
    const changed = await db('doctor_documents').where({ id: req.params.documentId, doctor_id: req.params.doctorId })
      .whereNull('deleted_at').update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
    if (!changed) return failure(res, 'مدرک پزشک پیدا نشد', 404);
    return success(res, null, 'مدرک پزشک حذف شد');
  }));

router.get('/admin/reviews', authenticate, admins, asyncHandler(async (req, res) => {
  let builder = db('reviews');
  if (req.query.is_approved !== undefined) builder = builder.where({ is_approved: req.query.is_approved === 'true' });
  if (req.query.service_id) builder = builder.where({ service_id: req.query.service_id });
  const result = await paginateQuery(builder, req.query);
  return success(res, result.rows, 'نظرات دریافت شد', result.meta);
}));
router.patch('/admin/reviews/:id/approval', authenticate, admins, validate(idSchema, 'params'),
  validate(Joi.object({ is_approved: Joi.boolean().required() })),
  asyncHandler(async (req, res) => {
    const changed = await db('reviews').where({ id: req.params.id }).update({ is_approved: req.body.is_approved, updated_at: db.fn.now() });
    if (!changed) return failure(res, 'نظر مورد نظر پیدا نشد', 404);
    return success(res, null, 'وضعیت انتشار نظر به‌روزرسانی شد');
  }));
router.get('/admin/consultations', authenticate, admins, asyncHandler(async (req, res) => {
  let builder = db('consultation_requests');
  if (req.query.status) builder = builder.where({ status: req.query.status });
  const result = await paginateQuery(builder, req.query);
  return success(res, result.rows, 'درخواست‌های مشاوره دریافت شد', result.meta);
}));
router.patch('/admin/consultations/:id/status', authenticate, admins, validate(idSchema, 'params'),
  validate(Joi.object({ status: Joi.string().valid('new', 'contacted', 'closed').required() })),
  asyncHandler(async (req, res) => {
    const changed = await db('consultation_requests').where({ id: req.params.id }).update({ status: req.body.status, updated_at: db.fn.now() });
    if (!changed) return failure(res, 'درخواست مشاوره پیدا نشد', 404);
    return success(res, null, 'وضعیت درخواست مشاوره به‌روزرسانی شد');
  }));
router.get('/admin/tickets', authenticate, admins, asyncHandler(async (req, res) => {
  let builder = db('tickets');
  if (req.query.status) builder = builder.where({ status: req.query.status });
  const result = await paginateQuery(builder, req.query);
  return success(res, result.rows, 'تیکت‌ها دریافت شد', result.meta);
}));
router.post('/admin/tickets/:id/messages', authenticate, admins, validate(idSchema, 'params'),
  validate(Joi.object({ body: Joi.string().min(1).max(5000).required(), status: Joi.string().valid('open', 'in_progress', 'closed') })),
  asyncHandler(async (req, res) => {
    const ticket = await db('tickets').where({ id: req.params.id }).first();
    if (!ticket) return failure(res, 'تیکت مورد نظر پیدا نشد', 404);
    const [id] = await db('ticket_messages').insert({
      ticket_id: ticket.id, sender_id: req.auth.sub, body: req.body.body, is_admin_reply: true
    });
    await db('tickets').where({ id: ticket.id }).update({ status: req.body.status || 'in_progress', updated_at: db.fn.now() });
    const setting = await db('settings').where({ key: 'sms_ticket_replies_enabled' }).first();
    const enabled = setting ? JSON.parse(setting.value) : true;
    if (enabled && ticket.user_id) {
      const user = await db('users').where({ id: ticket.user_id }).first();
      try { await sendSms(user.phone, 'ticket_reply', { token: String(ticket.id) }); }
      catch (error) { require('../config/logger').error({ err: error, ticketId: ticket.id }, 'Ticket notification SMS failed'); }
    }
    return success(res, { id }, 'پاسخ تیکت ثبت شد', null, 201);
  }));
router.get('/admin/audit-logs', authenticate, authorize('superadmin'), asyncHandler(async (req, res) => {
  const result = await paginateQuery(db('admin_audit_logs'), req.query);
  return success(res, result.rows, 'گزارش فعالیت مدیران دریافت شد', result.meta);
}));

module.exports = router;
