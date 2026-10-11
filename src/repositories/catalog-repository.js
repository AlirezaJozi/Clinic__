const db = require('../config/database');
const { pagination } = require('../utils/pagination');

async function listServices(query, admin) {
  const { limit, offset } = pagination(query);
  let builder = db('services').whereNull('services.deleted_at');
  if (!admin) builder = builder.where('services.is_active', true);
  if (query.search) builder = builder.where((filter) => filter.where('services.title', 'like', `%${query.search}%`)
    .orWhere('services.short_description', 'like', `%${query.search}%`));
  if (query.category_id) builder = builder.where('services.category_id', query.category_id);
  const total = Number((await builder.clone().count({ total: '*' }).first()).total);
  const rows = await builder.clone().select('services.*', 'service_categories.name as category_name')
    .leftJoin('service_categories', 'services.category_id', 'service_categories.id')
    .orderBy('services.sort_order').orderBy('services.id').limit(limit).offset(offset);
  return { rows, total };
}

async function findServiceBySlug(slug, admin) {
  let query = db('services').where({ slug }).whereNull('deleted_at');
  if (!admin) query = query.where({ is_active: true });
  return query.first();
}

async function listDoctors(query, admin) {
  const { limit, offset } = pagination(query);
  let builder = db('doctors').whereNull('deleted_at');
  if (!admin) builder = builder.where({ is_active: true });
  if (query.search) builder = builder.where((filter) => filter.where('name', 'like', `%${query.search}%`)
    .orWhere('specialty', 'like', `%${query.search}%`));
  if (query.service_id) builder = builder.whereIn('doctors.id',
    db('doctor_services').select('doctor_id').where('service_id', query.service_id));
  const total = Number((await builder.clone().count({ total: '*' }).first()).total);
  const rows = await builder.clone().limit(limit).offset(offset).orderBy('sort_order').orderBy('id');
  return { rows, total };
}

async function listCategories(query) {
  const { limit, offset } = pagination(query);
  let builder = db('service_categories').where({ is_active: true }).whereNull('deleted_at');
  if (query.search) builder = builder.where('name', 'like', `%${query.search}%`);
  const total = Number((await builder.clone().count({ total: '*' }).first()).total);
  const rows = await builder.clone().orderBy('sort_order').orderBy('id').limit(limit).offset(offset);
  return { rows, total };
}

async function findDoctorById(id) {
  return db('doctors').where({ id, is_active: true }).whereNull('deleted_at').first();
}

async function getDoctorServices(id) {
  return db('doctor_services').join('services', 'doctor_services.service_id', 'services.id')
    .where('doctor_services.doctor_id', id).where('services.is_active', true)
    .select('services.id', 'services.title', 'services.slug', 'services.duration_minutes');
}

async function getDoctorDocuments(id) {
  return db('doctor_documents').where({ doctor_id: id }).whereNull('deleted_at')
    .select('title', 'file_url', 'document_year');
}

async function getDoctorSchedules(id) {
  return db('doctor_schedules').where({ doctor_id: id, is_active: true }).whereNull('deleted_at')
    .select('weekday', 'start_time', 'end_time').orderBy('weekday');
}

module.exports = {
  listServices, findServiceBySlug, listDoctors, listCategories,
  findDoctorById, getDoctorServices, getDoctorDocuments, getDoctorSchedules
};
