exports.up = async (knex) => {
  const timestamps = (table) => {
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();
  };
  await knex.schema
    .createTable('users', (table) => {
      table.increments('id').primary();
      table.string('phone', 11).notNullable().unique();
      table.string('email', 190).nullable().unique();
      table.string('password_hash', 255).nullable();
      table.string('first_name', 100).nullable();
      table.string('last_name', 100).nullable();
      table.enu('role', ['user', 'admin', 'superadmin', 'operator', 'secretary']).notNullable().defaultTo('user');
      table.boolean('is_blocked').notNullable().defaultTo(false);
      timestamps(table);
      table.index(['role', 'is_blocked']);
    })
    .createTable('otp_codes', (table) => {
      table.increments('id').primary();
      table.string('phone', 11).notNullable().index();
      table.string('ip_address', 45).notNullable().index();
      table.string('code_hash', 64).notNullable();
      table.timestamp('expires_at').notNullable();
      table.timestamp('last_sent_at').notNullable();
      table.integer('attempts').unsigned().notNullable().defaultTo(0);
      table.timestamp('consumed_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.index(['phone', 'created_at']);
      table.index(['ip_address', 'created_at']);
    })
    .createTable('refresh_tokens', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('token_hash', 64).notNullable().unique();
      table.timestamp('expires_at').notNullable();
      table.timestamp('revoked_at').nullable();
      table.string('replaced_by_hash', 64).nullable();
      timestamps(table);
      table.index(['user_id', 'revoked_at']);
    })
    .createTable('service_categories', (table) => {
      table.increments('id').primary();
      table.string('name', 150).notNullable();
      table.string('slug', 180).notNullable().unique();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('sort_order').notNullable().defaultTo(0);
      timestamps(table);
    })
    .createTable('services', (table) => {
      table.increments('id').primary();
      table.integer('category_id').unsigned().nullable().references('id').inTable('service_categories').onDelete('SET NULL');
      table.string('title', 180).notNullable();
      table.string('slug', 200).notNullable().unique();
      table.text('short_description').nullable();
      table.text('description').nullable();
      table.string('image_url', 500).nullable();
      table.decimal('price', 12, 2).nullable();
      table.string('price_label', 120).nullable();
      table.boolean('show_price').notNullable().defaultTo(true);
      table.integer('duration_minutes').unsigned().notNullable().defaultTo(30);
      table.text('treatment_process').nullable();
      table.text('benefits').nullable();
      table.text('possible_side_effects').nullable();
      table.text('before_care').nullable();
      table.text('after_care').nullable();
      table.json('faq').nullable();
      table.string('meta_title', 180).nullable();
      table.string('meta_description', 320).nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('sort_order').notNullable().defaultTo(0);
      timestamps(table);
      table.index(['is_active', 'sort_order']);
    })
    .createTable('doctors', (table) => {
      table.increments('id').primary();
      table.string('name', 180).notNullable();
      table.string('specialty', 180).nullable();
      table.string('photo_url', 500).nullable();
      table.text('biography').nullable();
      table.json('education').nullable();
      table.json('work_history').nullable();
      table.string('medical_license_number', 100).nullable();
      table.json('licenses').nullable();
      table.enu('role', ['doctor', 'operator']).notNullable().defaultTo('doctor');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('sort_order').notNullable().defaultTo(0);
      timestamps(table);
      table.index(['is_active', 'role']);
    })
    .createTable('doctor_services', (table) => {
      table.integer('doctor_id').unsigned().notNullable().references('id').inTable('doctors').onDelete('CASCADE');
      table.integer('service_id').unsigned().notNullable().references('id').inTable('services').onDelete('CASCADE');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.primary(['doctor_id', 'service_id']);
    })
    .createTable('doctor_documents', (table) => {
      table.increments('id').primary();
      table.integer('doctor_id').unsigned().notNullable().references('id').inTable('doctors').onDelete('CASCADE');
      table.string('title', 180).notNullable();
      table.string('file_url', 500).notNullable();
      table.integer('document_year').unsigned().nullable();
      timestamps(table);
    })
    .createTable('doctor_schedules', (table) => {
      table.increments('id').primary();
      table.integer('doctor_id').unsigned().notNullable().references('id').inTable('doctors').onDelete('CASCADE');
      table.integer('weekday').unsigned().notNullable();
      table.time('start_time').notNullable();
      table.time('end_time').notNullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      timestamps(table);
      table.unique(['doctor_id', 'weekday', 'start_time']);
    })
    .createTable('holidays', (table) => {
      table.increments('id').primary();
      table.date('holiday_date').notNullable().unique();
      table.string('title', 180).nullable();
      timestamps(table);
    })
    .createTable('portfolio_items', (table) => {
      table.increments('id').primary();
      table.integer('service_id').unsigned().nullable().references('id').inTable('services').onDelete('SET NULL');
      table.integer('doctor_id').unsigned().nullable().references('id').inTable('doctors').onDelete('SET NULL');
      table.string('before_image_url', 500).notNullable();
      table.string('after_image_url', 500).notNullable();
      table.text('description').nullable();
      table.boolean('consent_obtained').notNullable().defaultTo(false);
      table.boolean('is_published').notNullable().defaultTo(false);
      timestamps(table);
      table.index(['is_published', 'created_at']);
    })
    .createTable('gallery_items', (table) => {
      table.increments('id').primary();
      table.string('category', 100).notNullable();
      table.string('image_url', 500).notNullable();
      table.string('title', 180).nullable();
      table.boolean('is_published').notNullable().defaultTo(false);
      table.integer('sort_order').notNullable().defaultTo(0);
      timestamps(table);
    })
    .createTable('reviews', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('service_id').unsigned().nullable().references('id').inTable('services').onDelete('SET NULL');
      table.tinyint('rating').unsigned().notNullable();
      table.text('body').notNullable();
      table.boolean('is_approved').notNullable().defaultTo(false);
      timestamps(table);
      table.index(['is_approved', 'created_at']);
    })
    .createTable('articles', (table) => {
      table.increments('id').primary();
      table.string('title', 220).notNullable();
      table.string('slug', 240).notNullable().unique();
      table.text('excerpt').nullable();
      table.longText('body').notNullable();
      table.string('image_url', 500).nullable();
      table.string('meta_title', 180).nullable();
      table.string('meta_description', 320).nullable();
      table.boolean('is_published').notNullable().defaultTo(false);
      table.timestamp('published_at').nullable();
      timestamps(table);
      table.index(['is_published', 'published_at']);
    })
    .createTable('pages', (table) => {
      table.increments('id').primary();
      table.string('slug', 160).notNullable().unique();
      table.string('title', 180).notNullable();
      table.longText('body').notNullable();
      table.string('meta_title', 180).nullable();
      table.string('meta_description', 320).nullable();
      timestamps(table);
    })
    .createTable('appointments', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('RESTRICT');
      table.integer('service_id').unsigned().notNullable().references('id').inTable('services').onDelete('RESTRICT');
      table.integer('doctor_id').unsigned().notNullable().references('id').inTable('doctors').onDelete('RESTRICT');
      table.date('appointment_date').notNullable();
      table.time('start_time').notNullable();
      table.time('end_time').notNullable();
      table.enu('status', ['pending', 'confirmed', 'cancelled', 'completed', 'no_show']).notNullable().defaultTo('pending');
      table.text('user_note').nullable();
      table.text('admin_note').nullable();
      table.timestamp('cancelled_at').nullable();
      timestamps(table);
      table.index(['doctor_id', 'appointment_date', 'status'], 'appointments_doctor_date_status_idx');
      table.index(['user_id', 'appointment_date']);
      table.index(['status', 'appointment_date']);
    })
    .createTable('consultation_requests', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('name', 180).notNullable();
      table.string('phone', 11).notNullable();
      table.text('message').nullable();
      table.enu('status', ['new', 'contacted', 'closed']).notNullable().defaultTo('new');
      timestamps(table);
      table.index(['status', 'created_at']);
    })
    .createTable('tickets', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('subject', 220).notNullable();
      table.enu('status', ['open', 'in_progress', 'closed']).notNullable().defaultTo('open');
      timestamps(table);
      table.index(['status', 'created_at']);
    })
    .createTable('ticket_messages', (table) => {
      table.increments('id').primary();
      table.integer('ticket_id').unsigned().notNullable().references('id').inTable('tickets').onDelete('CASCADE');
      table.integer('sender_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      table.text('body').notNullable();
      table.boolean('is_admin_reply').notNullable().defaultTo(false);
      timestamps(table);
      table.index(['ticket_id', 'created_at']);
    })
    .createTable('settings', (table) => {
      table.string('key', 120).primary();
      table.json('value').notNullable();
      table.enu('type', ['string', 'number', 'boolean', 'array', 'object']).notNullable();
      table.boolean('is_public').notNullable().defaultTo(false);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    })
    .createTable('sms_logs', (table) => {
      table.increments('id').primary();
      table.string('phone', 11).notNullable();
      table.string('template', 120).notNullable();
      table.json('payload').nullable();
      table.enu('status', ['queued', 'sent', 'failed']).notNullable().defaultTo('queued');
      table.integer('attempts').unsigned().notNullable().defaultTo(0);
      table.text('provider_response').nullable();
      table.timestamp('sent_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.index(['status', 'created_at']);
    })
    .createTable('appointment_reminders', (table) => {
      table.increments('id').primary();
      table.integer('appointment_id').unsigned().notNullable().references('id').inTable('appointments').onDelete('CASCADE');
      table.integer('reminder_hours').unsigned().notNullable();
      table.timestamp('sent_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['appointment_id', 'reminder_hours']);
    })
    .createTable('admin_audit_logs', (table) => {
      table.increments('id').primary();
      table.integer('admin_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('action', 120).notNullable();
      table.string('entity_type', 100).nullable();
      table.string('entity_id', 80).nullable();
      table.json('details').nullable();
      table.string('ip_address', 45).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.index(['admin_id', 'created_at']);
    });
};

exports.down = async (knex) => {
  const tables = [
    'admin_audit_logs', 'appointment_reminders', 'sms_logs', 'settings', 'ticket_messages', 'tickets',
    'consultation_requests', 'appointments', 'pages', 'articles', 'reviews',
    'gallery_items', 'portfolio_items', 'holidays', 'doctor_schedules',
    'doctor_documents', 'doctor_services', 'doctors', 'services',
    'service_categories', 'refresh_tokens', 'otp_codes', 'users'
  ];
  for (const table of tables) await knex.schema.dropTableIfExists(table);
};
