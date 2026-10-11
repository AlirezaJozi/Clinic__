const Joi = require('joi');

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });
const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().max(120),
  active: Joi.boolean()
});

module.exports = { Joi, idParam, listQuery };
