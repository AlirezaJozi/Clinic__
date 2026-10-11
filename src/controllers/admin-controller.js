const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { success, failure } = require('../utils/api-response');
const { pagination, pageMeta } = require('../utils/pagination');
const settingsService = require('../services/settings-service');

const CRUD = {
  'service-categories': {
    table: 'service_categories',
    fields: ['name', 'slug', 'is_active', 'sort_order'],
    requiredFields: ['name', 'slug'],
    schema: require('joi').object({
      name: require('joi').string().min(1).max(150),
      slug: require('joi').string().min(1).max(180),
      is_active: require('joi').boolean(),
      sort_order: require('joi').number().integer()
    }).min(1)
  },
  services: {
    table: 'services',
    requiredFields: ['title', 'slug'],
    fields: ['category_id', 'title', 'slug', 'short_description', 'description', 'image_url', 'price', 'price_label',
      'show_price', 'duration_minutes', 'treatment_process', 'benefits', 'possible_side_effects', 'before_care',
      'after_care', 'faq', 'meta_title', 'meta_description', 'is_active', 'sort_order'],
    schema: require('joi').object({
      category_id: require('joi').number().integer().positive().allow(null),
      title: require('joi').string().min(1).max(180),
      slug: require('joi').string().min(1).max(200),
      short_description: require('joi').string().allow('', null),
      description: require('joi').string().allow('', null),
      image_url: require('joi').string().max(500).allow('', null),
      price: require('joi').number().min(0).allow(null),
      price_label: require('joi').string().max(120).allow('', null),
      show_price: require('joi').boolean(),
      duration_minutes: require('joi').number().integer().min(1),
      treatment_process: require('joi').string().allow('', null),
      benefits: require('joi').string().allow('', null),
      possible_side_effects: require('joi').string().allow('', null),
      before_care: require('joi').string().allow('', null),
      after_care: require('joi').string().allow('', null),
      faq: require('joi').array().items(require('joi').object()).allow(null),
      meta_title: require('joi').string().max(180).allow('', null),
      meta_description: require('joi').string().max(320).allow('', null),
      is_active: require('joi').boolean(),
      sort_order: require('joi').number().integer()
    }).min(1)
  },
  doctors: {
    table: 'doctors',
    requiredFields: ['name'],
    fields: ['name', 'specialty', 'photo_url', 'biography', 'education', 'work_history', 'medical_license_number',
      'licenses', 'role', 'is_active', 'sort_order']
  },
  articles: {
    table: 'articles',
    requiredFields: ['title', 'slug', 'body'],
    fields: ['title', 'slug', 'excerpt', 'body', 'image_url', 'meta_title', 'meta_description', 'is_published', 'published_at']
  },
  pages: {
    table: 'pages', requiredFields: ['slug', 'title', 'body'],
    fields: ['slug', 'title', 'body', 'meta_title', 'meta_description']
  },
  gallery: {
    table: 'gallery_items', requiredFields: ['category', 'image_url'],
    fields: ['category', 'image_url', 'title', 'is_published', 'sort_order']
  },
  portfolio: {
    table: 'portfolio_items',
    requiredFields: ['before_image_url', 'after_image_url', 'consent_obtained'],
    fields: ['service_id', 'doctor_id', 'before_image_url', 'after_image_url', 'description', 'consent_obtained', 'is_published']
  },
  holidays: { table: 'holidays', requiredFields: ['holiday_date'], fields: ['holiday_date', 'title'] }
};

CRUD.doctors.schema = require('joi').object({
  name: require('joi').string().min(1).max(180),
  specialty: require('joi').string().max(180).allow('', null),
  photo_url: require('joi').string().max(500).allow('', null),
  biography: require('joi').string().allow('', null),
  education: require('joi').array().items(require('joi').object()).allow(null),
  work_history: require('joi').array().items(require('joi').object()).allow(null),
  medical_license_number: require('joi').string().max(100).allow('', null),
  licenses: require('joi').array().items(require('joi').object()).allow(null),
  role: require('joi').string().valid('doctor', 'operator'),
  is_active: require('joi').boolean(),
  sort_order: require('joi').number().integer()
}).min(1);
CRUD.articles.schema = require('joi').object({
  title: require('joi').string().min(1).max(220),
  slug: require('joi').string().min(1).max(240),
  excerpt: require('joi').string().allow('', null),
  body: require('joi').string().min(1),
  image_url: require('joi').string().max(500).allow('', null),
  meta_title: require('joi').string().max(180).allow('', null),
  meta_description: require('joi').string().max(320).allow('', null),
  is_published: require('joi').boolean(),
  published_at: require('joi').date().allow(null)
}).min(1);
CRUD.pages.schema = require('joi').object({
  slug: require('joi').string().min(1).max(160),
  title: require('joi').string().min(1).max(180),
  body: require('joi').string().min(1),
  meta_title: require('joi').string().max(180).allow('', null),
  meta_description: require('joi').string().max(320).allow('', null)
}).min(1);
CRUD.gallery.schema = require('joi').object({
  category: require('joi').string().min(1).max(100),
  image_url: require('joi').string().max(500).required(),
  title: require('joi').string().max(180).allow('', null),
  is_published: require('joi').boolean(),
  sort_order: require('joi').number().integer()
}).min(1);
CRUD.portfolio.schema = require('joi').object({
  service_id: require('joi').number().integer().positive().allow(null),
  doctor_id: require('joi').number().integer().positive().allow(null),
  before_image_url: require('joi').string().max(500),
  after_image_url: require('joi').string().max(500),
  description: require('joi').string().allow('', null),
  consent_obtained: require('joi').boolean().required(),
  is_published: require('joi').boolean()
}).min(1);
CRUD.holidays.schema = require('joi').object({
  holiday_date: require('joi').string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  title: require('joi').string().max(180).allow('', null)
}).min(1);

function pick(input, fields) {
  return Object.fromEntries(Object.entries(input).filter(([key]) => fields.includes(key)));
}

function crudHandlers(entity) {
  const config = CRUD[entity];
  return {
    async list(req, res) {
      const { page, limit, offset } = pagination(req.query);
      let builder = db(config.table).whereNull('deleted_at');
      if (req.query.search && ['services', 'service-categories', 'doctors', 'articles', 'pages'].includes(entity)) {
        const searchField = entity === 'services' || entity === 'articles' || entity === 'pages'
          ? 'title' : entity === 'doctors' ? 'name' : 'name';
        builder = builder.where(searchField, 'like', `%${req.query.search}%`);
      }
      for (const field of config.fields) {
        if (req.query[field] === undefined) continue;
        const value = ['true', 'false'].includes(req.query[field])
          ? req.query[field] === 'true'
          : req.query[field];
        builder = builder.where(field, value);
      }
      const total = Number((await builder.clone().count({ total: '*' }).first()).total);
      const rows = await builder.clone().orderBy('created_at', 'desc').limit(limit).offset(offset);
      return success(res, rows, 'فهرست دریافت شد', pageMeta(page, limit, total));
    },
    async get(req, res) {
      const row = await db(config.table).where({ id: req.params.id }).whereNull('deleted_at').first();
      if (!row) return failure(res, 'مورد مورد نظر پیدا نشد', 404);
      return success(res, row, 'اطلاعات دریافت شد');
    },
    async create(req, res) {
      const body = pick(req.body, config.fields);
      if (entity === 'portfolio' && body.is_published && !body.consent_obtained) {
        return failure(res, 'انتشار نمونه‌کار بدون رضایت‌نامه مراجع مجاز نیست', 422);
      }
      const [id] = await db(config.table).insert(body);
      const row = await db(config.table).where({ id }).first();
      return success(res, row, 'مورد با موفقیت ایجاد شد', null, 201);
    },
    async update(req, res) {
      const body = pick(req.body, config.fields);
      if (entity === 'portfolio') {
        const current = await db(config.table).where({ id: req.params.id }).first();
        if (!current) return failure(res, 'مورد مورد نظر پیدا نشد', 404);
        if ((body.is_published ?? current.is_published) && !(body.consent_obtained ?? current.consent_obtained)) {
          return failure(res, 'انتشار نمونه‌کار بدون رضایت‌نامه مراجع مجاز نیست', 422);
        }
      }
      const changed = await db(config.table).where({ id: req.params.id }).whereNull('deleted_at')
        .update({ ...body, updated_at: db.fn.now() });
      if (!changed) return failure(res, 'مورد مورد نظر پیدا نشد', 404);
      return success(res, await db(config.table).where({ id: req.params.id }).first(), 'مورد با موفقیت به‌روزرسانی شد');
    },
    async remove(req, res) {
      const changed = await db(config.table).where({ id: req.params.id }).whereNull('deleted_at')
        .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
      if (!changed) return failure(res, 'مورد مورد نظر پیدا نشد', 404);
      return success(res, null, 'مورد با موفقیت حذف شد');
    }
  };
}

async function updateSettings(req, res) {
  const result = await settingsService.updateMany(req.body);
  return success(res, result, 'تنظیمات با موفقیت به‌روزرسانی شد');
}

async function dashboard(req, res) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TEHRAN_TIMEZONE || 'Asia/Tehran' }).format(new Date());
  const startOfWeek = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TEHRAN_TIMEZONE || 'Asia/Tehran' })
    .format(new Date(Date.now() - 6 * 86400000));
  const [todayCount, weekCount, pendingCount, newUsers, openTickets, popularServices, cancelled, total] = await Promise.all([
    db('appointments').where({ appointment_date: today }).whereIn('status', ['pending', 'confirmed']).count({ count: '*' }).first(),
    db('appointments').whereBetween('appointment_date', [startOfWeek, today]).count({ count: '*' }).first(),
    db('appointments').where({ status: 'pending' }).count({ count: '*' }).first(),
    db('users').where('created_at', '>=', new Date(Date.now() - 7 * 86400000)).count({ count: '*' }).first(),
    db('tickets').whereIn('status', ['open', 'in_progress']).count({ count: '*' }).first(),
    db('appointments').join('services', 'appointments.service_id', 'services.id')
      .select('services.id', 'services.title').count({ count: '*' }).groupBy('services.id', 'services.title').orderBy('count', 'desc').limit(5),
    db('appointments').where({ status: 'cancelled' }).count({ count: '*' }).first(),
    db('appointments').count({ count: '*' }).first()
  ]);
  return success(res, {
    todayAppointments: Number(todayCount.count), weekAppointments: Number(weekCount.count),
    pendingAppointments: Number(pendingCount.count), newUsersLast7Days: Number(newUsers.count),
    openTickets: Number(openTickets.count), popularServices,
    cancellationRate: Number(total.count) ? Number((Number(cancelled.count) / Number(total.count) * 100).toFixed(2)) : 0
  }, 'آمار داشبورد دریافت شد');
}

async function users(req, res) {
  const { page, limit, offset } = pagination(req.query);
  let builder = db('users').whereNull('deleted_at');
  if (req.query.search) builder = builder.where((query) => query.where('phone', 'like', `%${req.query.search}%`)
    .orWhere('first_name', 'like', `%${req.query.search}%`).orWhere('last_name', 'like', `%${req.query.search}%`));
  const total = Number((await builder.clone().count({ total: '*' }).first()).total);
  const rows = await builder.clone().select('id', 'phone', 'email', 'first_name', 'last_name', 'role', 'is_blocked', 'created_at')
    .orderBy('created_at', 'desc').limit(limit).offset(offset);
  return success(res, rows, 'فهرست کاربران دریافت شد', pageMeta(page, limit, total));
}

async function blockUser(req, res) {
  if (Number(req.params.id) === Number(req.auth.sub)) return failure(res, 'امکان مسدود کردن حساب خودتان وجود ندارد', 422);
  const changed = await db('users').where({ id: req.params.id }).whereNull('deleted_at')
    .update({ is_blocked: Boolean(req.body.isBlocked), updated_at: db.fn.now() });
  if (!changed) return failure(res, 'کاربر مورد نظر پیدا نشد', 404);
  return success(res, null, req.body.isBlocked ? 'کاربر مسدود شد' : 'مسدودیت کاربر برداشته شد');
}

async function updateUserRole(req, res) {
  if (Number(req.params.id) === Number(req.auth.sub)) return failure(res, 'امکان تغییر نقش حساب خودتان وجود ندارد', 422);
  const changed = await db('users').where({ id: req.params.id }).whereNull('deleted_at')
    .update({ role: req.body.role, updated_at: db.fn.now() });
  if (!changed) return failure(res, 'کاربر مورد نظر پیدا نشد', 404);
  return success(res, null, 'نقش کاربر به‌روزرسانی شد');
}

async function setStaffPassword(req, res) {
  const user = await db('users').where({ id: req.params.id }).whereNull('deleted_at').first();
  if (!user || !['admin', 'superadmin', 'operator', 'secretary'].includes(user.role)) {
    return failure(res, 'حساب کارمند مورد نظر پیدا نشد', 404);
  }
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  await db('users').where({ id: user.id }).update({
    email: req.body.email || user.email, password_hash: passwordHash, updated_at: db.fn.now()
  });
  return success(res, null, 'اطلاعات ورود کارمند به‌روزرسانی شد');
}

async function exportAppointments(req, res) {
  let builder = db('appointments').join('users', 'appointments.user_id', 'users.id')
    .join('services', 'appointments.service_id', 'services.id').join('doctors', 'appointments.doctor_id', 'doctors.id');
  if (req.query.from) builder = builder.where('appointment_date', '>=', req.query.from);
  if (req.query.to) builder = builder.where('appointment_date', '<=', req.query.to);
  const rows = await builder.select('appointments.id', 'users.phone', 'users.first_name', 'users.last_name',
    'services.title as service', 'doctors.name as doctor', 'appointment_date', 'start_time', 'end_time', 'status')
    .orderBy('appointment_date');
  const columns = ['id', 'phone', 'first_name', 'last_name', 'service', 'doctor', 'appointment_date', 'start_time', 'end_time', 'status'];
  const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => {
    let value = String(row[column] ?? '');
    if (/^[\t\r=+\-@]/.test(value)) value = `'${value}`;
    return `"${value.replace(/"/g, '""')}"`;
  }).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="appointments.csv"');
  return res.send(`\uFEFF${csv}`);
}

module.exports = {
  CRUD, crudHandlers, updateSettings, dashboard, users, blockUser,
  updateUserRole, setStaffPassword, exportAppointments
};
