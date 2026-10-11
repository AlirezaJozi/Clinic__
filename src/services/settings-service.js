const repository = require('../repositories/settings-repository');

const PUBLIC_KEYS = new Set([
  'show_prices', 'show_address', 'address', 'latitude', 'longitude', 'map_provider', 'map_links',
  'contact_phones', 'whatsapp_number', 'email', 'instagram_url', 'social_links', 'weekly_working_hours',
  'holidays', 'clinic_name', 'slogan', 'logo_url', 'favicon_url', 'homepage_hero', 'default_seo',
  'online_booking_enabled', 'reminder_hours', 'show_reviews', 'show_blog', 'show_portfolio', 'show_gallery'
]);
const PRIVATE_KEYS = new Set([
  'booking_auto_confirm', 'cancellation_deadline_hours', 'sms_ticket_replies_enabled', 'maintenance_mode'
]);
let maintenanceCache = null;
let maintenanceCacheExpires = 0;

async function getAll() {
  const rows = await repository.list();
  return Object.fromEntries(rows.map((row) => [row.key, parseValue(row.value)]));
}

async function getPublic() {
  const rows = await repository.list(true);
  return filterPublicSettings(Object.fromEntries(rows.map((row) => [row.key, parseValue(row.value)])));
}

function filterPublicSettings(settings) {
  for (const key of PRIVATE_KEYS) delete settings[key];
  if (!settings.show_address) {
    delete settings.address;
    delete settings.latitude;
    delete settings.longitude;
    delete settings.map_provider;
    delete settings.map_links;
  }
  return settings;
}

async function updateMany(values) {
  const prepared = [];
  for (const [key, value] of Object.entries(values)) {
    if (!PUBLIC_KEYS.has(key) && !PRIVATE_KEYS.has(key)) {
      throw Object.assign(new Error(`کلید تنظیمات «${key}» مجاز نیست`), { status: 422 });
    }
    const existing = await repository.find(key);
    const type = existing ? existing.type : inferType(value);
    if (!matchesType(value, type)) {
      throw Object.assign(new Error(`نوع مقدار تنظیم «${key}» معتبر نیست`), { status: 422 });
    }
    if (key === 'map_provider' && !['google', 'neshan', 'balad'].includes(value)) {
      throw Object.assign(new Error('سرویس نقشه انتخاب‌شده معتبر نیست'), { status: 422 });
    }
    if (key === 'cancellation_deadline_hours' && (!Number.isInteger(value) || value < 0 || value > 168)) {
      throw Object.assign(new Error('مهلت لغو نوبت باید عددی بین صفر تا ۱۶۸ ساعت باشد'), { status: 422 });
    }
    if (key === 'reminder_hours' &&
        (!Array.isArray(value) || value.length > 4 || value.some((hour) => !Number.isInteger(hour) || hour < 1 || hour > 168))) {
      throw Object.assign(new Error('زمان یادآوری باید شامل حداکثر چهار مقدار بین ۱ تا ۱۶۸ ساعت باشد'), { status: 422 });
    }
    prepared.push({ key, value: JSON.stringify(value), type, is_public: PUBLIC_KEYS.has(key) });
  }
  await repository.upsertMany(prepared);
  if (Object.hasOwn(values, 'maintenance_mode')) {
    maintenanceCache = values.maintenance_mode;
    maintenanceCacheExpires = Date.now() + 5000;
  }
  return getAll();
}

async function isMaintenanceMode() {
  if (maintenanceCache !== null && Date.now() < maintenanceCacheExpires) return maintenanceCache;
  const row = await repository.find('maintenance_mode');
  maintenanceCache = row ? parseValue(row.value) === true : false;
  maintenanceCacheExpires = Date.now() + 5000;
  return maintenanceCache;
}

function parseValue(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function inferType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null || typeof value === 'object') return 'object';
  return typeof value;
}

function matchesType(value, type) {
  if (value === null) return type === 'number' || type === 'string';
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

module.exports = { getAll, getPublic, updateMany, isMaintenanceMode, filterPublicSettings };
