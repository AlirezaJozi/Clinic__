function success(res, data = null, message = 'عملیات با موفقیت انجام شد', meta = null, status = 200) {
  return res.status(status).json({ success: true, data, message, meta });
}

function failure(res, message, status = 400, errors = null) {
  return res.status(status).json({ success: false, data: null, message, meta: errors });
}

module.exports = { success, failure };
