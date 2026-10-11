const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

const uploadRoot = path.resolve(process.env.UPLOAD_DIR || 'storage/uploads');
fs.mkdirSync(uploadRoot, { recursive: true });
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024), files: 5 },
  fileFilter(req, file, callback) {
    if (!acceptedTypes.has(file.mimetype)) return callback(new Error('نوع فایل مجاز نیست'));
    return callback(null, true);
  }
});

async function processImage(file, prefix = 'image') {
  const name = `${prefix}-${Date.now()}-${require('crypto').randomUUID()}`;
  const image = sharp(file.buffer, { limitInputPixels: 25_000_000 });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp', 'avif'].includes(metadata.format)) throw Object.assign(new Error('تصویر معتبر نیست'), { status: 422 });
  const fullName = `${name}.webp`;
  const thumbName = `${name}-thumb.webp`;
  await Promise.all([
    image.clone().rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(uploadRoot, fullName)),
    image.clone().rotate().resize({ width: 400, height: 400, fit: 'cover' }).webp({ quality: 75 }).toFile(path.join(uploadRoot, thumbName))
  ]);
  return { url: `/uploads/${fullName}`, thumbnailUrl: `/uploads/${thumbName}` };
}

function isPdf(file) {
  return file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

module.exports = { upload, processImage, uploadRoot, isPdf };
