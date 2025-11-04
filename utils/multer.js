// Multer config: central image upload handler (images only, unique filenames)

// deps
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// paths & dirs (public uploads root)
const uploadDir = process.env.UPLOAD_DIR || 'public/uploads';

// ensure target folder exists
fs.mkdirSync(path.join(__dirname, '..', uploadDir), { recursive: true });

// storage (disk): save under /public/uploads with unique name + original ext
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', uploadDir)),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + ext);
  }
});

// file filter: accept only common image mimetypes
function fileFilter(req, file, cb) {
  const ok = /image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype);
  cb(ok ? null : new Error('Only image files are allowed (jpg, png, webp, gif).'), ok);
}

// uploader (array): <input name="images" multiple> up to 12 files, 5MB each
const uploadMany = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).array('images', 12);

// exports
module.exports = {
  uploadMany,
};