require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');
const logger = require('./config/logger');
const { notFound, errorHandler } = require('./middleware/error-handler');
const sanitize = require('./middleware/sanitize');
const routes = require('./routes');
const openapi = require('./config/openapi');
const { failure } = require('./utils/api-response');

const app = express();
const allowedOrigin = process.env.APP_ORIGIN;
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigin || origin === allowedOrigin) return callback(null, true);
    return callback(new Error('مبدأ درخواست مجاز نیست'));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(sanitize);
app.use(pinoHttp({ logger }));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.get('/openapi.json', (req, res) => res.json(openapi));
app.use('/uploads', express.static(require('./middleware/upload').uploadRoot, { dotfiles: 'deny', index: false }));
const apiPrefix = process.env.API_PREFIX || '/api/v1';
app.use(apiPrefix, async (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/admin/') || req.path.startsWith('/auth/')) return next();
  try {
    if (await require('./services/settings-service').isMaintenanceMode()) {
      return failure(res, 'سایت در حال به‌روزرسانی است؛ لطفاً کمی بعد مراجعه کنید', 503);
    }
    return next();
  } catch (error) {
    return next(error);
  }
}, routes);
app.use(notFound);
app.use((error, req, res, next) => {
  if (error.message === 'مبدأ درخواست مجاز نیست') return failure(res, error.message, 403);
  if (error.type === 'entity.parse.failed') return failure(res, 'ساختار JSON درخواست معتبر نیست', 400);
  if (error.type === 'entity.too.large') return failure(res, 'حجم درخواست از حد مجاز بیشتر است', 413);
  if (error.code === 'LIMIT_FILE_SIZE') return failure(res, 'حجم فایل از حد مجاز بیشتر است', 413);
  if (error.message === 'نوع فایل مجاز نیست') return failure(res, error.message, 415);
  return next(error);
});
app.use(errorHandler);

module.exports = app;
