const db = require('../../config/database');
const logger = require('../../config/logger');

class MockSmsProvider {
  async sendTemplate(phone, template, payload) {
    const logData = template === 'otp'
      ? { phone, template, verificationCode: payload.token }
      : { phone, template, payload };
    logger.info(logData, 'Mock SMS sent');
    return { provider: 'mock', accepted: true };
  }
}

class KavenegarSmsProvider {
  async sendTemplate(phone, template, payload) {
    const apiKey = process.env.KAVENEGAR_API_KEY;
    if (!apiKey) throw new Error('KAVENEGAR_API_KEY is required for the Kavenegar driver');
    const response = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        receptor: phone,
        token: String(payload.token || ''),
        template: template === 'otp' ? (process.env.KAVENEGAR_OTP_TEMPLATE || 'ClinicOtp') : template
      })
    });
    const body = await response.json();
    if (!response.ok || body.return?.status !== 200) throw new Error(body.return?.message || 'Kavenegar request failed');
    return body;
  }
}

const smsDriver = process.env.SMS_DRIVER || (process.env.NODE_ENV === 'production' ? null : 'mock');
if (!['mock', 'kavenegar'].includes(smsDriver)) {
  throw new Error('SMS_DRIVER must be explicitly configured as kavenegar in production');
}
if (process.env.NODE_ENV === 'production' && smsDriver !== 'kavenegar') {
  throw new Error('The mock SMS driver is not allowed in production');
}
const provider = smsDriver === 'kavenegar' ? new KavenegarSmsProvider() : new MockSmsProvider();

async function sendSms(phone, template, payload = {}) {
  const [id] = await db('sms_logs').insert({
    phone,
    template,
    payload: JSON.stringify(template === 'otp' ? { token: '[REDACTED]' } : payload),
    status: 'queued'
  });
  try {
    const response = await provider.sendTemplate(phone, template, payload);
    await db('sms_logs').where({ id }).update({
      status: 'sent', attempts: 1, provider_response: JSON.stringify(response),
      sent_at: db.fn.now(), updated_at: db.fn.now()
    });
    return response;
  } catch (error) {
    await db('sms_logs').where({ id }).update({
      status: 'failed', attempts: 1, provider_response: error.message, updated_at: db.fn.now()
    });
    throw error;
  }
}

async function retryFailedSms(limit = 25) {
  const failed = await db('sms_logs').where('status', 'failed').andWhere('attempts', '<', 3)
    .whereNot({ template: 'otp' }).limit(limit);
  for (const item of failed) {
    try {
      const response = await provider.sendTemplate(item.phone, item.template, item.payload || {});
      await db('sms_logs').where({ id: item.id }).update({
        status: 'sent', attempts: item.attempts + 1, provider_response: JSON.stringify(response),
        sent_at: db.fn.now(), updated_at: db.fn.now()
      });
    } catch (error) {
      await db('sms_logs').where({ id: item.id }).update({
        attempts: item.attempts + 1, provider_response: error.message, updated_at: db.fn.now()
      });
    }
  }
}

module.exports = { sendSms, retryFailedSms, MockSmsProvider, KavenegarSmsProvider };
