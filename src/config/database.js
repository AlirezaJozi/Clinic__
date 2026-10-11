const knex = require('knex');
const configs = require('../../knexfile');

const environment = process.env.NODE_ENV || 'development';
const db = knex(configs[environment] || configs.development);

module.exports = db;
