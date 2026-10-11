const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { normalizeIranianPhone } = require('../utils/phone');
const { sendSms } = require('./sms');

function hashSecret(value) {
  return crypto.createHmac('sha256', process.env.OTP_HASH_SECRET).update(value).digest('hex');
}

function tokenHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function databaseTimestampMilliseconds(value) {
  if (value instanceof Date) return value.getTime();
  return new Date(`${String(value).replace(' ', 'T')}Z`).getTime();
}

async function requestOtp(rawPhone, ipAddress) {
  const phone = normalizeIranianPhone(rawPhone);
  if (!phone) throw Object.assign(new Error('شماره موبایل ایران معتبر نیست'), { status: 422 });
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [phoneCount, ipCount, latest] = await Promise.all([
    db('otp_codes').where('phone', phone).andWhere('created_at', '>=', dayStart).count({ count: '*' }).first(),
    db('otp_codes').where('ip_address', ipAddress).andWhere('created_at', '>=', dayStart).count({ count: '*' }).first(),
    db('otp_codes').where({ phone }).orderBy('created_at', 'desc')
      .select('id', 'last_sent_at').first()
  ]);
  if (Number(phoneCount.count) >= Number(process.env.OTP_DAILY_PHONE_LIMIT || 10) ||
      Number(ipCount.count) >= Number(process.env.OTP_DAILY_IP_LIMIT || 50)) {
    throw Object.assign(new Error('تعداد درخواست‌های امروز بیش از حد مجاز است'), { status: 429 });
  }
  const cooldown = Number(process.env.OTP_RESEND_SECONDS || 60) * 1000;
  if (latest && now.getTime() - databaseTimestampMilliseconds(latest.last_sent_at) < cooldown) {
    throw Object.assign(new Error('برای دریافت کد جدید کمی صبر کنید'), { status: 429 });
  }
  const code = crypto.randomInt(0, 100000).toString().padStart(5, '0');
  const ttl = Number(process.env.OTP_TTL_SECONDS || 120);
  await db('otp_codes').insert({
    phone, ip_address: ipAddress || 'unknown', code_hash: hashSecret(`${phone}:${code}`),
    expires_at: new Date(now.getTime() + ttl * 1000), last_sent_at: now
  });
  try {
    await sendSms(phone, 'otp', { token: code });
  } catch (error) {
    throw Object.assign(new Error('ارسال پیامک با خطا مواجه شد'), { status: 503, cause: error });
  }
  return { phone, expiresIn: ttl, resendAfter: Number(process.env.OTP_RESEND_SECONDS || 60) };
}

async function verifyOtp(rawPhone, code) {
  const phone = normalizeIranianPhone(rawPhone);
  if (!phone) throw Object.assign(new Error('شماره موبایل ایران معتبر نیست'), { status: 422 });
  const result = await db.transaction(async (trx) => {
    const otp = await trx('otp_codes').where({ phone }).whereNull('consumed_at')
      .orderBy('created_at', 'desc').forUpdate().first();
    if (!otp || databaseTimestampMilliseconds(otp.expires_at) <= Date.now()) {
      throw Object.assign(new Error('کد تأیید منقضی شده است یا وجود ندارد'), { status: 400 });
    }
    const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS || 5);
    if (otp.attempts >= maxAttempts) throw Object.assign(new Error('تعداد تلاش‌های ناموفق بیش از حد مجاز است'), { status: 429 });
    const expected = Buffer.from(otp.code_hash, 'hex');
    const actual = Buffer.from(hashSecret(`${phone}:${code}`), 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      await trx('otp_codes').where({ id: otp.id }).increment('attempts', 1);
      await trx('otp_codes').where({ id: otp.id }).update({ updated_at: trx.fn.now() });
      return { error: 'کد تأیید اشتباه است', status: 400 };
    }
    await trx('otp_codes').where({ id: otp.id }).update({ consumed_at: trx.fn.now(), updated_at: trx.fn.now() });
    let user = await trx('users').where({ phone }).whereNull('deleted_at').first();
    if (!user) {
      const [userId] = await trx('users').insert({ phone });
      user = await trx('users').where({ id: userId }).first();
    }
    if (user.is_blocked) throw Object.assign(new Error('حساب کاربری شما مسدود شده است'), { status: 403 });
    return createSession(trx, user);
  });
  if (result.error) throw Object.assign(new Error(result.error), { status: result.status });
  return result;
}

async function createSession(trx, user) {
  const accessToken = jwt.sign(
    { sub: user.id, role: user.role, phone: user.phone },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const refreshDays = Number(process.env.REFRESH_TOKEN_DAYS || 30);
  await trx('refresh_tokens').insert({
    user_id: user.id, token_hash: tokenHash(refreshToken),
    expires_at: new Date(Date.now() + refreshDays * 86400000)
  });
  return {
    user: publicUser(user), accessToken, refreshToken,
    tokenType: 'Bearer', expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m'
  };
}

async function refreshSession(rawToken) {
  const hashed = tokenHash(rawToken);
  return db.transaction(async (trx) => {
    const stored = await trx('refresh_tokens').where({ token_hash: hashed }).whereNull('revoked_at').forUpdate().first();
    if (!stored || databaseTimestampMilliseconds(stored.expires_at) <= Date.now()) {
      throw Object.assign(new Error('نشست شما منقضی یا باطل شده است'), { status: 401 });
    }
    await trx('refresh_tokens').where({ id: stored.id }).update({ revoked_at: trx.fn.now(), updated_at: trx.fn.now() });
    const user = await trx('users').where({ id: stored.user_id }).whereNull('deleted_at').first();
    if (!user || user.is_blocked) throw Object.assign(new Error('حساب کاربری در دسترس نیست'), { status: 403 });
    const session = await createSession(trx, user);
    await trx('refresh_tokens').where({ token_hash: hashed }).update({
      replaced_by_hash: tokenHash(session.refreshToken), updated_at: trx.fn.now()
    });
    return session;
  });
}

async function logout(rawToken, userId) {
  await db('refresh_tokens').where({ token_hash: tokenHash(rawToken), user_id: userId }).whereNull('revoked_at')
    .update({ revoked_at: db.fn.now(), updated_at: db.fn.now() });
}

async function loginWithPassword(email, password) {
  const user = await db('users').where({ email }).whereNull('deleted_at').first();
  if (!user?.password_hash || !await bcrypt.compare(password, user.password_hash)) {
    throw Object.assign(new Error('ایمیل یا رمز عبور نادرست است'), { status: 401 });
  }
  if (!['admin', 'superadmin', 'operator', 'secretary'].includes(user.role)) {
    throw Object.assign(new Error('ورود با رمز عبور فقط برای کارکنان کلینیک فعال است'), { status: 403 });
  }
  if (user.is_blocked) throw Object.assign(new Error('حساب کاربری شما مسدود شده است'), { status: 403 });
  return db.transaction((trx) => createSession(trx, user));
}

async function updateProfile(userId, fields) {
  const allowed = ['first_name', 'last_name', 'email'];
  const changes = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.includes(key)));
  await db('users').where({ id: userId }).update({ ...changes, updated_at: db.fn.now() });
  return publicUser(await db('users').where({ id: userId }).first());
}

function publicUser(user) {
  return {
    id: user.id, phone: user.phone, email: user.email, firstName: user.first_name,
    lastName: user.last_name, role: user.role
  };
}

module.exports = { requestOtp, verifyOtp, refreshSession, logout, loginWithPassword, updateProfile };
