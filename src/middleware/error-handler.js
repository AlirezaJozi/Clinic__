const logger = require('../config/logger');
const { failure } = require('../utils/api-response');

function notFound(req, res) {
  return failure(res, 'مسیر مورد نظر پیدا نشد', 404);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status || (error.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) logger.error({ err: error, path: req.originalUrl }, 'Request failed');
  return failure(res, status >= 500 ? 'خطای داخلی سرور رخ داد' : (error.message || 'درخواست نامعتبر است'), status);
}

module.exports = { notFound, errorHandler };
