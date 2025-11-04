// Profile routes: edit bio + upload avatar (multer)
// - GET /profile      → redirect to public profile (/users/:id)
// - GET /profile/edit → show form with current values
// - POST /profile     → save bio and optional avatar file
// - Ensures DB columns (avatar_path, bio) exist for SQLite

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { get, run, all } = require('../utils/db');

// simple auth guard (inline)
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.redirect('/login');
  next();
}

const router = express.Router();

// GET /profile → redirect to /users/:id (public profile)
router.get('/', requireAuth, (req, res) => {
  return res.redirect(`/users/${req.session.user.id}`);
});

/* ============ ensure users table has avatar_path + bio ============ */
async function ensureUserProfileColumns() {
  const cols = await all('PRAGMA table_info(users)');
  const names = new Set(cols.map(c => c.name));

  if (!names.has('avatar_path')) {
    await run('ALTER TABLE users ADD COLUMN avatar_path TEXT');
  }
  if (!names.has('bio')) {
    await run('ALTER TABLE users ADD COLUMN bio TEXT');
  }
}

/* ============ multer setup for avatars (uploads to public/uploads) ============ */
const uploadDir = process.env.UPLOAD_DIR || 'public/uploads';
fs.mkdirSync(path.join(__dirname, '..', uploadDir), { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', uploadDir)),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + ext);
  }
});
function fileFilter(req, file, cb) {
  const ok = /image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype);
  cb(ok ? null : new Error('Only image files are allowed (jpg, png, webp, gif).'), ok);
}
const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 4 * 1024 * 1024 } // 4MB
}).single('avatar'); // <input name="avatar" type="file">

/* ============ GET /profile/edit ============ */
router.get('/edit', requireAuth, async (req, res, next) => {
  try {
    await ensureUserProfileColumns();

    const me = await get(
      `SELECT id, username, avatar_path, bio
         FROM users
        WHERE id = ?`,
      [req.session.user.id]
    );

    res.render('profile-edit', {
      title: 'Edit profile',
      me
    });
  } catch (err) { next(err); }
});

/* ============ POST /profile (save bio + optional avatar; supports remove) ============ */
router.post('/', requireAuth, (req, res, next) => {
  uploadAvatar(req, res, async (err) => {
    try {
      if (err) {
        // multer error → re-render form with message
        return res.status(400).render('profile-edit', {
          title: 'Edit profile',
          error: err.message,
          me: await get('SELECT id, username, avatar_path, bio FROM users WHERE id = ?', [req.session.user.id])
        });
      }

      await ensureUserProfileColumns();

      const userId = req.session.user.id;
      const { bio, remove_avatar } = req.body || {};
      const cleanBio = (bio && String(bio).trim()) || null;

      // decide new avatar path + cleanup old file if replaced/removed
      const current = await get('SELECT avatar_path FROM users WHERE id = ?', [userId]);
      let newAvatarPath = current?.avatar_path || null;

      if (req.file) {
        // new avatar uploaded
        newAvatarPath = 'uploads/' + path.basename(req.file.path);

        if (current?.avatar_path) {
          const oldAbs = path.join(__dirname, '..', current.avatar_path);
          fs.stat(oldAbs, (e, st) => {
            if (!e && st.isFile()) fs.unlink(oldAbs, () => {});
          });
        }
      } else if (remove_avatar === 'on') {
        // remove current avatar
        if (current?.avatar_path) {
          const oldAbs = path.join(__dirname, '..', current.avatar_path);
          fs.stat(oldAbs, (e, st) => {
            if (!e && st.isFile()) fs.unlink(oldAbs, () => {});
          });
        }
        newAvatarPath = null;
      }

      await run(
        `UPDATE users
            SET bio = ?, avatar_path = ?
          WHERE id = ?`,
        [cleanBio, newAvatarPath, userId]
      );

      res.redirect(`/users/${userId}`);
    } catch (e) { next(e); }
  });
});

module.exports = router;