require('dotenv').config();
const app = require('./app');
const db = require('./config/database');
const logger = require('./config/logger');
const { startReminderScheduler } = require('./jobs/reminders');

const port = Number(process.env.PORT || 3000);

async function start() {
  if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters');
  }
  if (!process.env.OTP_HASH_SECRET || process.env.OTP_HASH_SECRET.length < 32) {
    throw new Error('OTP_HASH_SECRET must contain at least 32 characters');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.KAVENEGAR_API_KEY) {
    throw new Error('KAVENEGAR_API_KEY is required in production');
  }
  await db.raw('SELECT 1');
  const server = app.listen(port, () => logger.info({ port }, 'Beauty clinic API started'));
  startReminderScheduler();
  const shutdown = async () => {
    server.close(async () => {
      await db.destroy();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  logger.fatal({ err: error }, 'Unable to start API');
  process.exitCode = 1;
});
