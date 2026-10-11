const { failure } = require('../utils/api-response');

module.exports = (schema, property = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[property], { abortEarly: false, stripUnknown: true, convert: true });
  if (error) {
    const details = error.details.map((item) => ({
      field: item.path.join('.'),
      message: 'مقدار این فیلد معتبر نیست'
    }));
    return failure(res, 'اطلاعات واردشده معتبر نیست', 422, details);
  }
  req[property] = value;
  return next();
};
