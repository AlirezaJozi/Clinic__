const { pagination, pageMeta } = require('./pagination');

async function paginateQuery(builder, query, orderColumn = 'created_at', direction = 'desc') {
  const { page, limit, offset } = pagination(query);
  const count = Number((await builder.clone().count({ total: '*' }).first()).total);
  const rows = await builder.clone().orderBy(orderColumn, direction).limit(limit).offset(offset);
  return { rows, meta: pageMeta(page, limit, count) };
}

module.exports = { paginateQuery };
