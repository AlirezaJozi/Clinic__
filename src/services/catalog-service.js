const repository = require('../repositories/catalog-repository');
const settingsService = require('./settings-service');
const { pagination, pageMeta } = require('../utils/pagination');

async function listServices(query, admin = false) {
  const { page, limit } = pagination(query);
  const { rows, total } = await repository.listServices(query, admin);
  if (!admin) {
    const settings = await settingsService.getAll();
    return {
      rows: rows.map((row) => publicService(row, settings)),
      meta: pageMeta(page, limit, total)
    };
  }
  return { rows, meta: pageMeta(page, limit, total) };
}

async function getServiceBySlug(slug, admin = false) {
  const service = await repository.findServiceBySlug(slug, admin);
  if (!service) return null;
  const settings = await settingsService.getAll();
  return admin ? service : publicService(service, settings);
}

function publicService(service, settings) {
  const { price, show_price, ...visible } = service;
  if (settings.show_prices === true && (show_price === 1 || show_price === true)) visible.price = price;
  else visible.price_label = service.price_label || 'برای اطلاع از قیمت تماس بگیرید';
  return visible;
}

async function listDoctors(query, admin = false) {
  const { page, limit } = pagination(query);
  const { rows, total } = await repository.listDoctors(query, admin);
  return { rows, meta: pageMeta(page, limit, total) };
}

async function listCategories(query) {
  const { page, limit } = pagination(query);
  const { rows, total } = await repository.listCategories(query);
  return { rows, meta: pageMeta(page, limit, total) };
}

async function getDoctor(id) {
  const doctor = await repository.findDoctorById(id);
  if (!doctor) return null;
  const [services, documents, schedules] = await Promise.all([
    repository.getDoctorServices(id),
    repository.getDoctorDocuments(id),
    repository.getDoctorSchedules(id)
  ]);
  return { ...doctor, services, documents, schedules };
}

module.exports = { listServices, getServiceBySlug, listDoctors, listCategories, getDoctor, publicService };
