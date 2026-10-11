const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { failure } = require('../utils/api-response');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return failure(res, 'برای ادامه وارد حساب کاربری خود شوید', 401);
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    return failure(res, 'نشست شما معتبر نیست یا منقضی شده است', 401);
  }
  try {
    const user = await db('users').select('id', 'role', 'is_blocked')
      .where({ id: claims.sub }).whereNull('deleted_at').first();
    if (!user) return failure(res, 'حساب کاربری شما در دسترس نیست', 401);
    if (user.is_blocked) return failure(res, 'حساب کاربری شما مسدود شده است', 403);
    req.auth = { ...claims, role: user.role };
    return next();
  } catch (error) {
    return next(error);
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) return failure(res, 'شما اجازه انجام این عملیات را ندارید', 403);
    return next();
  };
}

module.exports = { authenticate, authorize };
