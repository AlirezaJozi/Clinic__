const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../config/logger');
const settingsService = require('../services/settings-service');
const { sendSms } = require('../services/sms');

function tehranDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TEHRAN_TIMEZONE || 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

async function sendDueReminders(now = new Date()) {
  const settings = await settingsService.getAll();
  const reminderHours = Array.isArray(settings.reminder_hours) ? settings.reminder_hours : [24, 2];
  const parts = tehranDateParts(now);
  for (const hours of reminderHours) {
    const wallClockUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute)
    );
    const target = new Date(wallClockUtc + Number(hours) * 3600000);
    const targetDate = target.toISOString().slice(0, 10);
    const targetTime = target.toISOString().slice(11, 16);
    const appointments = await db('appointments').join('users', 'appointments.user_id', 'users.id')
      .where({ 'appointments.status': 'confirmed', 'appointments.appointment_date': targetDate })
      .whereBetween('appointments.start_time', [`${targetTime}:00`, `${targetTime}:59`])
      .whereNotIn('appointments.id', db('appointment_reminders').select('appointment_id').where({ reminder_hours: Number(hours) }))
      .select('appointments.id', 'appointments.appointment_date', 'appointments.start_time', 'users.phone');
    for (const item of appointments) {
      try {
        await sendSms(item.phone, `appointment_reminder_${hours}`, { date: item.appointment_date, time: item.start_time });
        await db('appointment_reminders').insert({ appointment_id: item.id, reminder_hours: Number(hours) }).onConflict(['appointment_id', 'reminder_hours']).ignore();
      } catch (error) {
        logger.error({ err: error, appointmentId: item.id }, 'Appointment reminder failed');
      }
    }
  }
}

function startReminderScheduler() {
  cron.schedule('* * * * *', () => sendDueReminders().catch((error) => logger.error({ err: error }, 'Reminder job failed')), {
    timezone: process.env.TEHRAN_TIMEZONE || 'Asia/Tehran'
  });
  cron.schedule('*/10 * * * *', () => require('../services/sms').retryFailedSms().catch((error) =>
    logger.error({ err: error }, 'SMS retry job failed')), { timezone: process.env.TEHRAN_TIMEZONE || 'Asia/Tehran' });
}

module.exports = { startReminderScheduler, sendDueReminders, tehranDateParts };
