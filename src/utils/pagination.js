function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function pageMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

module.exports = { pagination, pageMeta };
