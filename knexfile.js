require('dotenv').config();

const connection = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'beauty_clinic_api',
  charset: 'utf8mb4',
  dateStrings: true,
  timezone: 'Z'
};
const pool = {
  min: 0,
  max: 10,
  afterCreate(connection, callback) {
    connection.query("SET time_zone = '+00:00'", (error) => callback(error, connection));
  }
};

module.exports = {
  development: {
    client: 'mysql2',
    connection,
    pool,
    migrations: { directory: './src/database/migrations', tableName: 'knex_migrations' },
    seeds: { directory: './src/database/seeds' }
  },
  test: {
    client: 'mysql2',
    connection: { ...connection, database: process.env.DB_TEST_NAME || 'beauty_clinic_api_test' },
    pool: { ...pool, max: 5 },
    migrations: { directory: './src/database/migrations', tableName: 'knex_migrations' },
    seeds: { directory: './src/database/seeds' }
  },
  production: {
  
    client: 'mysql2',
    connection,
    pool: { ...pool, min: 2, max: 20 },
    migrations: { directory: './src/database/migrations', tableName: 'knex_migrations' },
    seeds: { directory: './src/database/seeds' }
  }
};
