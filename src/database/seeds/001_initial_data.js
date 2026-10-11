const bcrypt = require('bcryptjs');
const { normalizeIranianPhone } = require('../../utils/phone');

exports.seed = async (knex) => {
  const phone = normalizeIranianPhone(process.env.ADMIN_SEED_PHONE || '');
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD || '';
  if (!phone) throw new Error('Set ADMIN_SEED_PHONE to a valid Iranian mobile number before seeding');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set ADMIN_SEED_EMAIL to a valid email address before seeding');
  }
  if (password.length < 12) throw new Error('Set ADMIN_SEED_PASSWORD to at least 12 characters before seeding');
  const existing = await knex('users').where({ phone }).first();
  if (!existing) {
    await knex('users').insert({
      phone,
      email,
      password_hash: await bcrypt.hash(password, 12),
      first_name: 'مدیر',
      last_name: 'سیستم',
      role: 'superadmin'
    });
  }

  const services = [
    { title: 'لیزر موهای زائد', slug: 'laser-hair-removal', short_description: 'کاهش موهای زائد با دستگاه‌های تخصصی', duration_minutes: 45, price_label: 'تماس بگیرید' },
    { title: 'هایفوتراپی', slug: 'hifu', short_description: 'جوانسازی و لیفت غیرتهاجمی پوست', duration_minutes: 60, price_label: 'تماس بگیرید' },
    { title: 'فیشیال', slug: 'facial', short_description: 'پاکسازی و مراقبت تخصصی پوست', duration_minutes: 60, price_label: 'تماس بگیرید' }
  ];
  for (const item of services) {
    const found = await knex('services').where({ slug: item.slug }).first();
    if (!found) await knex('services').insert(item);
  }

  let category = await knex('service_categories').where({ slug: 'beauty-rejuvenation' }).first();
  if (!category) {
    const [categoryId] = await knex('service_categories').insert({
      name: 'زیبایی و جوانسازی', slug: 'beauty-rejuvenation', sort_order: 1
    });
    category = { id: categoryId };
  }
  await knex('services').whereIn('slug', services.map((item) => item.slug))
    .update({ category_id: category.id });

  const doctors = [
    {
      name: 'دکتر نازنین احمدی', specialty: 'پوست و مو',
      medical_license_number: 'SAMPLE-1001', role: 'doctor', is_active: true, sort_order: 1,
      services: ['laser-hair-removal', 'facial']
    },
    {
      name: 'دکتر علی رضایی', specialty: 'زیبایی و جوانسازی',
      medical_license_number: 'SAMPLE-1002', role: 'doctor', is_active: true, sort_order: 2,
      services: ['hifu', 'facial']
    }
  ];
  for (const entry of doctors) {
    const { services: serviceSlugs, ...doctorData } = entry;
    let doctor = await knex('doctors').where({ medical_license_number: entry.medical_license_number }).first();
    if (!doctor) {
      const [doctorId] = await knex('doctors').insert(doctorData);
      doctor = { id: doctorId };
    }
    const serviceRows = await knex('services').whereIn('slug', serviceSlugs).select('id');
    for (const service of serviceRows) {
      await knex('doctor_services').insert({ doctor_id: doctor.id, service_id: service.id })
        .onConflict(['doctor_id', 'service_id']).ignore();
    }
    for (const weekday of [0, 1, 2, 3, 6]) {
      await knex('doctor_schedules').insert({
        doctor_id: doctor.id, weekday, start_time: '09:00:00', end_time: '17:00:00', is_active: true
      }).onConflict(['doctor_id', 'weekday', 'start_time']).ignore();
    }
  }

  const defaults = {
    show_prices: [false, 'boolean'], show_address: [false, 'boolean'],
    address: ['', 'string'], latitude: [null, 'number'], longitude: [null, 'number'],
    map_provider: ['neshan', 'string'], map_links: [{}, 'object'],
    contact_phones: [[], 'array'], whatsapp_number: ['', 'string'], email: ['', 'string'],
    instagram_url: ['', 'string'], social_links: [[], 'array'], weekly_working_hours: [{}, 'object'],
    holidays: [[], 'array'], clinic_name: ['کلینیک زیبایی', 'string'], slogan: ['', 'string'],
    logo_url: ['', 'string'], favicon_url: ['', 'string'], homepage_hero: [{}, 'object'],
    default_seo: [{}, 'object'], online_booking_enabled: [true, 'boolean'],
    booking_auto_confirm: [process.env.BOOKING_AUTO_CONFIRM === 'true', 'boolean'],
    cancellation_deadline_hours: [12, 'number'], reminder_hours: [[24, 2], 'array'],
    sms_ticket_replies_enabled: [true, 'boolean'], show_reviews: [true, 'boolean'],
    show_blog: [true, 'boolean'], show_portfolio: [true, 'boolean'],
    show_gallery: [true, 'boolean'], maintenance_mode: [false, 'boolean']
  };
  const privateSettings = new Set([
    'booking_auto_confirm', 'cancellation_deadline_hours',
    'sms_ticket_replies_enabled', 'maintenance_mode'
  ]);
  for (const [key, definition] of Object.entries(defaults)) {
    const [value, type] = Array.isArray(definition) ? definition : [definition, 'array'];
    await knex('settings').insert({
      key, value: JSON.stringify(value), type, is_public: !privateSettings.has(key)
    })
      .onConflict('key').ignore();
  }
};
