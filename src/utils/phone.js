const digitMap = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

function normalizeIranianPhone(value) {
  if (typeof value !== 'string') return null;
  let phone = value.replace(/[۰-۹٠-٩]/g, (digit) => digitMap[digit]).replace(/[\s()-]/g, '');
  if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith('0098')) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith('98') && phone.length === 12) phone = `0${phone.slice(2)}`;
  return /^09\d{9}$/.test(phone) ? phone : null;
}

module.exports = { normalizeIranianPhone };
