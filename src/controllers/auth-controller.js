const authService = require('../services/auth-service');
const { success } = require('../utils/api-response');

async function requestOtp(req, res) {
  const data = await authService.requestOtp(req.body.phone, req.ip);
  return success(res, data, 'کد تأیید برای شما ارسال شد');
}

async function verifyOtp(req, res) {
  const data = await authService.verifyOtp(req.body.phone, req.body.code);
  return success(res, data, 'ورود با موفقیت انجام شد');
}

async function refresh(req, res) {
  const data = await authService.refreshSession(req.body.refreshToken);
  return success(res, data, 'نشست با موفقیت تمدید شد');
}

async function logout(req, res) {
  await authService.logout(req.body.refreshToken, req.auth.sub);
  return success(res, null, 'با موفقیت از حساب کاربری خارج شدید');
}

async function passwordLogin(req, res) {
  const data = await authService.loginWithPassword(req.body.email, req.body.password);
  return success(res, data, 'ورود با موفقیت انجام شد');
}

async function profile(req, res) {
  const data = await authService.updateProfile(req.auth.sub, req.body);
  return success(res, data, 'پروفایل با موفقیت به‌روزرسانی شد');
}

module.exports = { requestOtp, verifyOtp, refresh, logout, passwordLogin, profile };
