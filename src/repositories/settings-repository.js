const db = require('../config/database');

async function list(publicOnly = false) {
  let query = db('settings').select('key', 'value', 'type', 'is_public');
  if (publicOnly) query = query.where({ is_public: true });
  return query;
}

async function find(key) {
  return db('settings').where({ key }).first();
}

async function upsertMany(values) {
  await db.transaction(async (trx) => {
    for (const setting of values) {
      await trx('settings').insert({ ...setting, updated_at: trx.fn.now() })
        .onConflict('key').merge(['value', 'type', 'is_public', 'updated_at']);
    }
  });
}

module.exports = { list, find, upsertMany };
