# Beauty Clinic REST API

Backend-only clinic API built with Node.js, Express, MySQL 8, Knex, and `mysql2`.
Source code, identifiers, and comments are English; messages returned to users are Persian.

## Project layout

```text
src/
  app.js, server.js
  config/                 database, logger, OpenAPI
  database/migrations/    normalized MySQL schema
  database/seeds/         initial services, settings, superadmin
  routes/                 versioned REST routes
  controllers/            HTTP handlers
  services/               auth, SMS, catalog, booking, settings
  repositories/           Knex-backed settings and catalog persistence
  middleware/             auth, validation, uploads, audit, errors
  jobs/                   SMS reminders and retry worker
  utils/                  phone normalization, response, pagination
tests/
```

## Requirements and local setup

- Node.js 20+ (use the current Node.js LTS release) and npm
- MySQL 8+ with a dedicated database created using `utf8mb4`

```sql
CREATE DATABASE beauty_clinic_api CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'clinic_app'@'127.0.0.1' IDENTIFIED BY 'USE_A_NEW_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON beauty_clinic_api.* TO 'clinic_app'@'127.0.0.1';
```

Run the SQL as a MySQL administrator. If `clinic_app` already exists, use `ALTER USER 'clinic_app'@'127.0.0.1' IDENTIFIED BY 'USE_A_NEW_STRONG_PASSWORD';` instead of `CREATE USER`. Do not run the migration against another application's database: Knex migrations create the tables and must own a dedicated schema.

```powershell
Copy-Item .env.example .env
notepad .env
npm install
npm run migrate
npm run seed
npm run dev
```

In `.env`, keep `DB_NAME=beauty_clinic_api`, set `DB_USER=clinic_app`, and put the same new password in `DB_PASSWORD`. Never commit or share `.env`.

Set unique, randomly generated values for `JWT_ACCESS_SECRET` and `OTP_HASH_SECRET` before running. The API refuses to start if either is shorter than 32 characters. Set `ADMIN_SEED_PHONE`, `ADMIN_SEED_EMAIL`, and a unique `ADMIN_SEED_PASSWORD` of at least 12 characters before seeding; the seed refuses to create a known-default admin account. The seed is idempotent for that superadmin, services, doctors, and settings.

The development SMS driver is `mock`; it logs OTP payloads to the server log only. Set `SMS_DRIVER=kavenegar`, `KAVENEGAR_API_KEY`, and `KAVENEGAR_OTP_TEMPLATE` to use the Kavenegar lookup API. Other SMS templates must be configured on the provider side to match the identifiers sent by the API. Failed sends are recorded and retried up to three times.

## Database relationships

- `users` owns refresh tokens, appointments, reviews, tickets, and consultation requests.
- `services` belongs to an optional `service_categories`; `doctors` and `services` have a many-to-many relationship through `doctor_services`.
- `doctors` own weekly `doctor_schedules` and `doctor_documents`; `holidays` close the clinic globally.
- `appointments` references a user, service, and doctor. A transaction locks the doctor row before checking overlapping pending/confirmed visits and inserting/rescheduling. A reminder row is unique per appointment/reminder interval.
- `portfolio_items` may reference a service and doctor and are public only when both consent and publication flags are true.
- `reviews` are user-submitted and hidden until approval. `articles`, `pages`, and `gallery_items` are published as separate content records.
- `tickets` own `ticket_messages`; `settings` stores JSON-typed values; `sms_logs` and `admin_audit_logs` keep operational records.
- Important entities have soft-delete timestamps; OTP records are retained for rate-limit/audit windows. All tables use InnoDB defaults and the connection uses `utf8mb4`.

## API and response convention

Base path: `/api/v1`. Except for CSV downloads and framework-level transport failures, JSON responses use:

```json
{ "success": true, "data": {}, "message": "پیام فارسی", "meta": null }
```

Interactive OpenAPI documentation is at `/docs`; machine-readable spec is at `/openapi.json`.

### Public routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/settings/public` | Display-safe settings |
| GET | `/services`, `/services/:slug` | Active services and service details |
| GET | `/service-categories` | Active service categories |
| GET | `/doctors`, `/doctors/:id` | Active doctors/operators and profile, services, documents, and weekly schedule |
| GET | `/portfolio`, `/gallery`, `/reviews` | Published content; portfolio requires consent |
| GET | `/articles`, `/articles/:slug`, `/pages/:slug` | Published editorial and static pages |
| GET | `/appointments/slots?serviceId=&doctorId=&date=YYYY-MM-DD` | Available appointment start times |

### Authentication and customer routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | Request five-digit OTP |
| POST | `/auth/otp/verify` | Verify OTP, create account if needed, return access/refresh tokens |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke refresh token |
| POST | `/auth/admin/password` | Staff email/password login |
| GET/PATCH | `/auth/me`, `/auth/profile` | Read/update own account |
| POST/GET | `/appointments`, `/appointments/mine` | Book and list own visits |
| PATCH/POST | `/appointments/:id/reschedule`, `/appointments/:id/cancel` | Move/cancel own visit |
| POST | `/reviews` | Submit a review for admin moderation |
| POST | `/consultations` | Create a consultation request for the signed-in user |
| POST/GET | `/tickets`, `/tickets/:id/messages` | Create a ticket and view/reply to its conversation |

Send access tokens as `Authorization: Bearer <accessToken>`. Iranian phone formats `09...`, `+989...`, and `00989...` are accepted; Persian and Arabic digits are normalized to `09...`. OTP defaults are 2-minute expiry, five failed attempts, 60-second resend cooldown, and per-phone/IP daily limits.

### Admin/staff routes

Admin CRUD resources use `/admin/{services,service-categories,doctors,articles,pages,gallery,portfolio,holidays}` with GET/POST/PATCH/DELETE. Delete uses soft deletion. The admin API also includes:

- `/admin/settings` (superadmin write access) and `/settings/public`
- `/admin/dashboard`, `/admin/users`, `/admin/users/:id/block`, `/admin/users/:id/role`, `/admin/users/:id/password` (staff provisioning is superadmin-only)
- `/admin/appointments`, `/admin/appointments` (POST manual booking), `/admin/appointments/:id/status`, `/admin/appointments/export.csv`
- `/admin/doctors/:doctorId/services`, `/admin/doctors/:doctorId/schedules`, `/admin/doctors/:doctorId/documents`
- `/admin/uploads` (multipart field `file`; image optimization/thumbnail or PDF storage)
- `/admin/reviews`, `/admin/consultations`, `/admin/tickets`, `/admin/tickets/:id/messages`, `/admin/audit-logs`

User/admin output for sensitive records should only be accessed through an authenticated role. Administrative actions are logged in `admin_audit_logs`.

## Settings behavior

The seed inserts defaults for price/address visibility, contact and map data, social links, schedules, clinic branding/SEO, booking behavior, reminder hours, section visibility, and maintenance mode. `PATCH /api/v1/admin/settings` accepts a JSON object of setting key/value pairs. The public endpoint only returns records marked public. When `show_address` is false it excludes address, coordinates, map provider, and map links. Public service responses remove `price` unless both `show_prices` and service-level `show_price` are enabled; hidden prices return `price_label` instead.

## Booking and time assumptions

- Appointment dates use ISO Gregorian `YYYY-MM-DD`; stored `DATE` and `TIME` are clinic wall-clock values. Responses include Gregorian `appointmentDate` and a Jalaali `{ jy, jm, jd }` value. Scheduler jobs use `Asia/Tehran`.
- Weekly schedules use JavaScript weekday numbering (`0` Sunday through `6` Saturday); starts are offered in 15-minute steps.
- Pending appointments hold a slot just like confirmed appointments. The database transaction locks the doctor row to serialize competing bookings for that doctor.
- Online booking is controlled by `online_booking_enabled`; new visits are pending by default unless `booking_auto_confirm` is true. User cancellation/rescheduling defaults to a 12-hour deadline.
- Reminder intervals default to 24 and 2 hours. The scheduler only considers `confirmed` appointments.
- The implementation uses a basic cron scheduler and MySQL, not Redis/BullMQ. In clustered PM2 mode, run only one scheduler instance to avoid duplicate job execution.

## Tests

```powershell
npm test
```

Jest tests cover phone/OTP normalization and hashing/attempt recording, available appointment slot overlap behavior, and public price hiding. The service-level tests use a mocked repository boundary and do not require a running MySQL instance. For deployment validation, also run migrations and exercise the APIs against a disposable MySQL 8 database.

## Deploy on an Iranian VPS or cPanel

1. Provision Node.js LTS and MySQL 8; create the database with `utf8mb4`.
2. Upload the project, install production dependencies with `npm ci --omit=dev`, create `.env` from `.env.example`, and set production secrets and database/SMS credentials.
3. Run `npm run migrate` and `npm run seed` once. Set a strong seed password before seeding.
4. On a VPS, install PM2 and run:

   ```powershell
   npm install --global pm2
   pm2 start ecosystem.config.js --env production
   pm2 save
   pm2 startup
   ```

   Configure Nginx/Apache as a TLS reverse proxy to `127.0.0.1:3000`, and restrict direct access to the Node port.
5. On cPanel, use **Setup Node.js App** (Passenger), select the project root and `src/server.js` startup file, set environment variables in the panel, install dependencies, and run migrations through the cPanel terminal. Configure the domain's HTTPS proxy/application mapping in cPanel.
6. Persist `storage/uploads` across deployments, restrict filesystem permissions, configure backups, and monitor logs. Avoid multiple scheduler instances until a distributed lock/queue is configured.

Assumptions: there is one clinic-wide holiday calendar; settings are JSON values and new unknown keys are public only if `isPublicSetting` allows them; staff accounts are provisioned by the superadmin; lookup SMS templates beyond OTP need provider-side setup; the API exposes the operational modules without any frontend.
