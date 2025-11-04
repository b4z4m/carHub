// Home route: renders homepage with latest cars (4) + quick stats
// Includes first image via subquery and owner info (handles deleted usernames)

const express = require('express');
const router = express.Router();
const { get, all } = require('../utils/db');

router.get('/', async (req, res, next) => {
  try {
    // fetch latest 4 cars with: basic fields, owner info, deleted-user flag, and first image path
    const latest = await all(`
      SELECT
        c.id, c.title, c.year, c.price,
        c.body_type, c.fuel, c.transmission, c.horsepower,
        c.user_id,
        u.username AS owner_username,
        (
          LOWER(COALESCE(u.username, '')) = 'deleted user'
          OR u.username LIKE 'deleted_user_%'
        ) AS owner_is_deleted,
        (SELECT path
           FROM car_images i
          WHERE i.car_id = c.id
          ORDER BY i.sort_order, i.id
          LIMIT 1) AS first_image_path
      FROM cars c
      LEFT JOIN users u ON u.id = c.user_id
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 4
    `);

    // quick stats: totals for cars, users, images (for hero counters)
    const [cars, users, images] = await Promise.all([
      get('SELECT COUNT(*) AS n FROM cars'),
      get('SELECT COUNT(*) AS n FROM users'),
      get('SELECT COUNT(*) AS n FROM car_images'),
    ]);

    // render home view with latest cards and stats object
    res.render('home', {
      title: 'CarHub',
      latest,
      stats: {
        cars: cars?.n || 0,
        users: users?.n || 0,
        images: images?.n || 0,
      },
    });
  } catch (err) { next(err); }
});

// exports
module.exports = router;