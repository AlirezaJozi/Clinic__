const catalog = require('../services/catalog-service');
const settings = require('../services/settings-service');
const db = require('../config/database');
const { success, failure } = require('../utils/api-response');
const { pagination, pageMeta } = require('../utils/pagination');

async function services(req, res) {
  const result = await catalog.listServices(req.query, false);
  return success(res, result.rows, 'فهرست خدمات دریافت شد', result.meta);
}

async function service(req, res) {
  const result = await catalog.getServiceBySlug(req.params.slug, false);
  if (!result) return failure(res, 'خدمت مورد نظر پیدا نشد', 404);
  return success(res, result, 'اطلاعات خدمت دریافت شد');
}

async function doctors(req, res) {
  const result = await catalog.listDoctors(req.query, false);
  return success(res, result.rows, 'فهرست پزشکان دریافت شد', result.meta);
}

async function doctor(req, res) {
  const result = await catalog.getDoctor(Number(req.params.id));
  if (!result) return failure(res, 'پزشک مورد نظر پیدا نشد', 404);
  return success(res, result, 'اطلاعات پزشک دریافت شد');
}

async function categories(req, res) {
  const result = await catalog.listCategories(req.query);
  return success(res, result.rows, 'دسته‌بندی خدمات دریافت شد', result.meta);
}

async function publicSettings(req, res) {
  return success(res, await settings.getPublic(), 'تنظیمات عمومی دریافت شد');
}

async function publicRows(table, filters, req, res) {
  const { page, limit, offset } = pagination(req.query);
  let builder = db(table).whereNull('deleted_at');
  for (const [key, value] of Object.entries(filters)) builder = builder.where(key, value);
  const filterColumns = {
    gallery_items: ['category'],
    portfolio_items: ['service_id', 'doctor_id'],
    reviews: ['service_id'],
    articles: []
  };
  for (const field of filterColumns[table] || []) {
    if (req.query[field]) builder = builder.where(field, req.query[field]);
  }
  if (req.query.search && table === 'articles') {
    builder = builder.where('title', 'like', `%${req.query.search}%`);
  }
  const total = Number((await builder.clone().count({ total: '*' }).first()).total);
  const rows = await builder.clone().limit(limit).offset(offset).orderBy('created_at', 'desc');
  return success(res, rows, 'اطلاعات دریافت شد', pageMeta(page, limit, total));
}

async function portfolio(req, res) {
  return publicRows('portfolio_items', { is_published: true, consent_obtained: true }, req, res);
}

async function gallery(req, res) {
  return publicRows('gallery_items', { is_published: true }, req, res);
}

async function reviews(req, res) {
  return publicRows('reviews', { is_approved: true }, req, res);
}

async function articles(req, res) {
  return publicRows('articles', { is_published: true }, req, res);
}

async function article(req, res) {
  const item = await db('articles').where({ slug: req.params.slug, is_published: true }).whereNull('deleted_at').first();
  if (!item) return failure(res, 'مقاله مورد نظر پیدا نشد', 404);
  return success(res, item, 'مقاله دریافت شد');
}

async function page(req, res) {
  const item = await db('pages').where({ slug: req.params.slug }).whereNull('deleted_at').first();
  if (!item) return failure(res, 'صفحه مورد نظر پیدا نشد', 404);
  return success(res, item, 'صفحه دریافت شد');
}

module.exports = { services, service, doctors, doctor, categories, publicSettings, portfolio, gallery, reviews, articles, article, page };
