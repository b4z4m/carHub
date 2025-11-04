// Public profiles: show username (or "Deleted user") and their cars
// Also exposes avatar_path + bio when available, and sets canEdit for owner CTA

const express = require('express');
const router = express.Router();
const { get, all } = require('../utils/db');

// fetch user with optional profile fields; fallback if columns don't exist
async function fetchUserWithProfile(userId) {
  try {
    const user = await get(
      `SELECT u.id,
              u.username,
              u.avatar_path,
              u.bio
         FROM users u
        WHERE u.id = ?`,
      [userId]
    );
    return user;
  } catch (err) {
    // fallback to minimal columns if avatar_path/bio not present
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[users.js] Falling back to minimal user columns:', err.message);
    }
    const user = await get(
      `SELECT u.id,
              u.username
         FROM users u
        WHERE u.id = ?`,
      [userId]
    );
    // normalize so views don't break
    return user ? { ...user, avatar_path: null, bio: null } : null;
  }
}

/* ============ GET /users/:id ============ */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    // 1) load user (with profile fields when present)
    const user = await fetchUserWithProfile(userId);

    // 2) synthesize “Deleted user” if not found
    const profile = user || {
      id: userId,
      username: 'Deleted user',
      avatar_path: null,
      bio: null,
      isDeleted: true
    };

    // 3) list this user's cars (works even if user is deleted)
    const cars = await all(
      `SELECT c.*,
              (SELECT path
                 FROM car_images i
                WHERE i.car_id = c.id
                ORDER BY sort_order, id
                LIMIT 1) AS first_image_path
         FROM cars c
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC`,
      [userId]
    );

    // 4) render profile page + canEdit if owner
    res.render('user-profile', {
      title: profile.username,
      profile,
      cars,
      canEdit: req.session?.user?.id === userId
    });
  } catch (err) { next(err); }
});

module.exports = router;