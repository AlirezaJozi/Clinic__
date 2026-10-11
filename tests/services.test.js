jest.mock('../src/config/database', () => {
  const createQuery = (table) => {
    const query = {
      table, filters: [], countMode: false,
      where(...args) { this.filters.push(args); return this; },
      andWhere(...args) { this.filters.push(args); return this; },
      whereNull(...args) { this.filters.push(args); return this; },
      orderBy() { return this; },
      forUpdate() { return this; },
      count() { this.countMode = true; return this; },
      async first() {
        if (this.table === 'otp_codes' && this.countMode) return { count: 0 };
        if (this.table === 'otp_codes') return global.__clinicTestState.otp || null;
        if (this.table === 'users') return global.__clinicTestState.user || null;
        if (this.table === 'services') return global.__clinicTestState.service || null;
        if (this.table === 'doctors') return global.__clinicTestState.doctor || null;
        if (this.table === 'doctor_services') return global.__clinicTestState.doctorServices[0] || null;
        if (this.table === 'appointments') return global.__clinicTestState.appointmentConflict || null;
        if (this.table === 'appointments' && this.countMode) return { count: 0 };
        return null;
      },
      insert(row) {
        global.__clinicTestState.inserts.push({ table: this.table, row });
        if (this.table === 'users') global.__clinicTestState.user = { id: 10, role: 'user', ...row };
        return Promise.resolve([this.table === 'users' ? 10 : 1]);
      },
      update() { return Promise.resolve(1); },
      increment(field, amount) {
        global.__clinicTestState.incremented = { field, amount };
        return Promise.resolve(1);
      },
      whereIn() { return this; },
      select() { return this; },
      then(resolve, reject) {
        let rows = [];
        const state = global.__clinicTestState;
        if (this.table === 'doctor_services') rows = state.doctorServices;
        if (this.table === 'holidays') rows = state.holidays;
        if (this.table === 'doctor_schedules') rows = state.schedules;
        if (this.table === 'appointments') rows = state.appointments;
        if (this.table === 'services' && state.service) rows = [state.service];
        if (this.table === 'doctors' && state.doctor) rows = [state.doctor];
        return Promise.resolve(rows).then(resolve, reject);
      }
    };
    return query;
  };
  const db = (table) => createQuery(table);
  db.fn = { now: () => new Date() };
  db.transaction = (callback) => callback(db);
  return db;
});

jest.mock('../src/services/sms', () => ({
  sendSms: (...args) => global.__sendClinicTestSms(...args)
}));

process.env.LOG_LEVEL = 'silent';
const crypto = require('crypto');
const auth = require('../src/services/auth-service');
const appointment = require('../src/services/appointment-service');
const catalog = require('../src/services/catalog-service');
const settings = require('../src/services/settings-service');
const { normalizeIranianPhone } = require('../src/utils/phone');
const sanitizeInput = require('../src/middleware/sanitize');
const request = require('supertest');
const app = require('../src/app');

function otpHash(phone, code) {
  return crypto.createHmac('sha256', process.env.OTP_HASH_SECRET).update(`${phone}:${code}`).digest('hex');
}

beforeEach(() => {
  process.env.OTP_HASH_SECRET = 'test-otp-hash-secret-with-at-least-32-characters';
  process.env.JWT_ACCESS_SECRET = 'test-jwt-secret-with-at-least-32-characters';
  process.env.OTP_DAILY_PHONE_LIMIT = '10';
  process.env.OTP_DAILY_IP_LIMIT = '50';
  global.__clinicTestState = {
    inserts: [], otp: null, user: { id: 10, phone: '09123456789', role: 'user', is_blocked: false },
    service: { id: 1, duration_minutes: 30, is_active: true },
    doctor: { id: 2, is_active: true },
    doctorServices: [{ doctor_id: 2, service_id: 1 }],
    holidays: [], schedules: [{ weekday: 0, start_time: '09:00:00', end_time: '11:00:00' }],
    appointments: [{ start_time: '09:30:00', end_time: '10:00:00' }]
  };
  global.__sendClinicTestSms = jest.fn().mockResolvedValue({ accepted: true });
});

describe('OTP authentication', () => {
  test('normalizes Iranian mobile formats and Persian/Arabic digits', () => {
    expect(normalizeIranianPhone('09123456789')).toBe('09123456789');
    expect(normalizeIranianPhone('+989123456789')).toBe('09123456789');
    expect(normalizeIranianPhone('۰۰۹۸۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
  });

  test('stores only an HMAC of the OTP and delivers a five-digit code', async () => {
    await auth.requestOtp('09123456789', '127.0.0.1');
    const storedOtp = global.__clinicTestState.inserts.find((item) => item.table === 'otp_codes').row;
    const sms = global.__sendClinicTestSms.mock.calls[0];
    expect(sms[0]).toBe('09123456789');
    expect(sms[2].token).toMatch(/^\d{5}$/);
    expect(storedOtp.code_hash).toBe(otpHash('09123456789', sms[2].token));
    expect(storedOtp.code_hash).not.toBe(sms[2].token);
    expect(storedOtp.expires_at.getTime() - storedOtp.last_sent_at.getTime()).toBe(120_000);
  });

  test('OTP request endpoint returns the standard Persian API response', async () => {
    const response = await request(app).post('/api/v1/auth/otp/request')
      .send({ phone: '۰۹۱۲۳۴۵۶۷۸۹' }).expect(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'کد تأیید برای شما ارسال شد'
    });
    expect(response.body.data).not.toHaveProperty('code');
  });

  test('persists failed verification attempts', async () => {
    global.__clinicTestState.otp = {
      id: 4, phone: '09123456789', code_hash: otpHash('09123456789', '12345'),
      expires_at: new Date(Date.now() + 60_000), attempts: 0
    };
    await expect(auth.verifyOtp('09123456789', '00000')).rejects.toMatchObject({ status: 400 });
    expect(global.__clinicTestState.incremented).toEqual({ field: 'attempts', amount: 1 });
  });

  test('creates a user and a hashed refresh token on successful OTP verification', async () => {
    global.__clinicTestState.user = null;
    global.__clinicTestState.otp = {
      id: 5, phone: '09123456789', code_hash: otpHash('09123456789', '12345'),
      expires_at: new Date(Date.now() + 60_000), attempts: 0
    };
    const session = await auth.verifyOtp('09123456789', '12345');
    const savedToken = global.__clinicTestState.inserts.find((item) => item.table === 'refresh_tokens').row.token_hash;
    expect(session.user.phone).toBe('09123456789');
    expect(session.accessToken).toBeTruthy();
    expect(savedToken).toMatch(/^[a-f0-9]{64}$/);
    expect(savedToken).not.toBe(session.refreshToken);
  });
});

describe('Appointment availability', () => {
  test('omits slots that overlap existing bookings', async () => {
    const slots = await appointment.getAvailableSlots(1, 2, '2026-10-18');
    expect(slots).toEqual([
      { startTime: '09:00:00', endTime: '09:30:00' },
      { startTime: '10:00:00', endTime: '10:30:00' },
      { startTime: '10:15:00', endTime: '10:45:00' },
      { startTime: '10:30:00', endTime: '11:00:00' }
    ]);
  });

  test('available-slots API responds with collision-free slots', async () => {
    const response = await request(app).get('/api/v1/appointments/slots')
      .query({ serviceId: 1, doctorId: 2, date: '2026-10-18' }).expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toContainEqual({ startTime: '09:00:00', endTime: '09:30:00' });
    expect(response.body.data).not.toContainEqual({ startTime: '09:15:00', endTime: '09:45:00' });
  });

  test('booking rejects an already occupied interval', async () => {
    global.__clinicTestState.appointmentConflict = { id: 12 };
    await expect(appointment.createAppointment(10, {
      serviceId: 1, doctorId: 2, date: '2026-10-18', startTime: '09:00'
    })).rejects.toMatchObject({ status: 409 });
    expect(global.__clinicTestState.inserts.some((item) => item.table === 'appointments')).toBe(false);
  });

  test('does not expose a service price when global or per-service visibility is off', () => {
    const service = { id: 1, price: '1200000.00', show_price: 1, price_label: 'استعلام قیمت' };
    const hiddenGlobally = catalog.publicService(service, { show_prices: false });
    const hiddenPerService = catalog.publicService({ ...service, show_price: 0 }, { show_prices: true });
    const visible = catalog.publicService(service, { show_prices: true });
    expect(hiddenGlobally).not.toHaveProperty('price');
    expect(hiddenPerService).not.toHaveProperty('price');
    expect(hiddenGlobally.price_label).toBe('استعلام قیمت');
    expect(visible.price).toBe('1200000.00');
  });

  test('removes address and map coordinates from public settings when hidden', () => {
    const result = settings.filterPublicSettings({
      show_address: false,
      address: 'تهران',
      latitude: 35.7,
      longitude: 51.4,
      map_provider: 'neshan',
      map_links: { neshan: 'https://example.test/map' },
      maintenance_mode: false,
      booking_auto_confirm: true,
      clinic_name: 'کلینیک'
    });
    expect(result).toEqual({ show_address: false, clinic_name: 'کلینیک' });
  });

  test('sanitizes HTML in user-controlled strings', () => {
    const req = { body: { content: '<script>alert(1)</script><b>متن امن</b>' } };
    const next = jest.fn();
    sanitizeInput(req, {}, next);
    expect(req.body.content).not.toContain('<script>');
    expect(req.body.content).toContain('<b>متن امن</b>');
    expect(next).toHaveBeenCalled();
  });
});
