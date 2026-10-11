const filterXss = require('xss');

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key];
      } else {
        value[key] = sanitizeValue(value[key]);
      }
    }
    return value;
  }
  if (typeof value === 'string') {
    const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    return filterXss(clean);
  }
  return value;
}

module.exports = (req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.params) req.params = sanitizeValue(req.params);
  return next();
};
