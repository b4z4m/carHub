// Cars feature: listing with filters + pagination, CRUD, and photo uploads
// handles everything under /cars: list, create, edit, delete, and image upload

const path = require('path');
const express = require('express');
const router = express.Router();

const { get, all, run } = require('../utils/db');
const { uploadMany } = require('../utils/multer');
const { requireAuth, canManage } = require('../middleware/auth');

/* ================== list cars (filters + pagination) ================== */
// lists all cars with optional filters, sorting, and pagination
router.get('/', async (req, res, next) => {
  try {
    const {
      q, brand, model, body_type, fuel, transmission, minYear, maxPrice, sort
    } = req.query;

    // pagination setup
    let page = parseInt(req.query.page, 10);
    let pageSize = parseInt(req.query.pageSize, 10);
    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(pageSize) || pageSize < 6) pageSize = 12;
    if (pageSize > 48) pageSize = 48;

    // filter builder
    const where = [];
    const params = [];

    if (q && q.trim()) {
      where.push('(c.title LIKE ? OR c.brand LIKE ? OR c.model LIKE ?)');
      const like = `%${q.trim()}%`;
      params.push(like, like, like);
    }
    if (brand)        { where.push('c.brand = ?');        params.push(brand); }
    if (model)        { where.push('c.model = ?');        params.push(model); }
    if (body_type)    { where.push('c.body_type = ?');    params.push(body_type); }
    if (fuel)         { where.push('c.fuel = ?');         params.push(fuel); }
    if (transmission) { where.push('c.transmission = ?'); params.push(transmission); }
    if (minYear)      { where.push('c.year >= ?');        params.push(Number(minYear)); }
    if (maxPrice)     { where.push('c.price <= ?');       params.push(Number(maxPrice)); }

    // count total cars matching filters
    const countRow = await get(
      `SELECT COUNT(*) AS cnt
         FROM cars c
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
      params
    );
    const totalCount = countRow?.cnt || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (page > totalPages) page = totalPages;
    const offset = (page - 1) * pageSize;

    // sorting
    let orderBy = 'c.created_at DESC';
    if (sort === 'price_asc')  orderBy = '(c.price IS NULL), c.price ASC';
    if (sort === 'price_desc') orderBy = '(c.price IS NULL), c.price DESC';
    if (sort === 'year_desc')  orderBy = '(c.year IS NULL), c.year DESC';
    if (sort === 'year_asc')   orderBy = '(c.year IS NULL), c.year ASC';

    // fetch car list with first image and owner info
    const listParams = [...params, pageSize, offset];
    const rows = await all(`
      SELECT
        c.*,
        u.username AS owner_username,
        (
          LOWER(COALESCE(u.username, '')) = 'deleted user'
          OR u.username LIKE 'deleted_user_%'
        ) AS owner_is_deleted,
        (SELECT path
           FROM car_images i
          WHERE i.car_id = c.id
          ORDER BY sort_order, id
          LIMIT 1) AS first_image_path
      FROM cars c
      LEFT JOIN users u ON u.id = c.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, listParams);

    // filter dropdowns (brands + models)
    const brandRows = await all(`
      SELECT DISTINCT brand FROM cars
       WHERE brand IS NOT NULL AND brand <> ''
       ORDER BY brand
    `);
    let modelRows = [];
    if (brand) {
      modelRows = await all(`
        SELECT DISTINCT model FROM cars
         WHERE model IS NOT NULL AND model <> '' AND brand = ?
         ORDER BY model
      `, [brand]);
    }
    const brands = brandRows.map(r => r.brand);
    const models = modelRows.map(r => r.model);

    // render car list view
    const hasFilters = !!(q || brand || model || body_type || fuel || transmission || minYear || maxPrice);
    res.render('cars', {
      title: 'Cars',
      cars: rows,
      query: { q, brand, model, body_type, fuel, transmission, minYear, maxPrice, sort, page, pageSize },
      filters: { brands, models },
      pagination: { page, pageSize, totalPages, totalCount },
      hasFilters
    });
  } catch (err) { next(err); }
});

/* ================== create new car ================== */
// shows add car form (auth required)
router.get('/new', requireAuth, (req, res) => {
  res.render('car-new', { title: 'Add car' });
});

// handles form submission, validates and uploads photos
router.post('/', requireAuth, (req, res, next) => {
  uploadMany(req, res, async (err) => {
    if (err) {
      return res.status(400).render('car-new', {
        title: 'Add car',
        error: err.message,
        form: req.body
      });
    }
    try {
      const {
        title, brand, model, year, price, mileage,
        transmission, fuel, horsepower, body_type, description
      } = req.body;

      const errors = [];
      function reqStr(name, value) {
        if (!value || !String(value).trim()) errors.push(`${name} is required.`);
        return String(value || '').trim();
      }

      // validate string fields
      const v_title        = reqStr('Title', title);
      const v_brand        = reqStr('Brand', brand);
      const v_model        = reqStr('Model', model);
      const v_transmission = reqStr('Transmission', transmission);
      const v_fuel         = reqStr('Fuel', fuel);
      const v_body_type    = reqStr('Body type', body_type);

      // validate numeric fields
      function reqNum(name, value, opts = {}) {
        if (value === undefined || value === null || String(value).trim() === '') {
          errors.push(`${name} is required.`);
          return null;
        }
        const n = Number(value);
        if (Number.isNaN(n)) { errors.push(`${name} must be a number.`); return null; }
        if (opts.min !== undefined && n < opts.min) errors.push(`${name} must be ≥ ${opts.min}.`);
        if (opts.max !== undefined && n > opts.max) errors.push(`${name} must be ≤ ${opts.max}.`);
        return errors.length ? null : n;
      }

      const v_year       = reqNum('Year', year, { min: 1900, max: 2100 });
      const v_price      = reqNum('Price', price, { min: 0 });
      const v_mileage    = reqNum('Mileage (km)', mileage, { min: 0 });
      const v_horsepower = reqNum('Horsepower (hp)', horsepower, { min: 0 });

      const files = req.files || [];
      if (!files.length) errors.push('Please upload at least one image.');

      // validation errors render form again
      if (errors.length) {
        return res.status(400).render('car-new', {
          title: 'Add car',
          error: errors.join(' '),
          form: req.body
        });
      }

      // insert new car
      const result = await run(
        `INSERT INTO cars (user_id, title, brand, model, year, price, mileage,
                           transmission, fuel, horsepower, body_type, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.session.user.id,
          v_title, v_brand, v_model, v_year, v_price, v_mileage,
          v_transmission, v_fuel, v_horsepower, v_body_type,
          (description && String(description).trim()) || null
        ]
      );
      const carId = result.lastID;

      // insert uploaded images
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        await run(
          'INSERT INTO car_images (car_id, path, alt, sort_order) VALUES (?, ?, ?, ?)',
          [carId, 'uploads/' + path.basename(f.path), v_title, i]
        );
      }

      res.redirect(`/cars/${carId}`);
    } catch (e) { next(e); }
  });
});

/* ================== show car detail ================== */
// shows one car with images and owner info
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const car = await get(
      `SELECT
         c.*,
         u.username AS owner_username,
         (
           LOWER(COALESCE(u.username, '')) = 'deleted user'
           OR u.username LIKE 'deleted_user_%'
         ) AS owner_is_deleted
       FROM cars c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [id]
    );
    if (!car) return res.status(404).render('404', { title: 'Not found' });

    const images = await all(
      'SELECT * FROM car_images WHERE car_id = ? ORDER BY sort_order, id',
      [id]
    );

    if (car && car.owner_is_deleted) car.owner_username = 'Deleted user';
    const canEdit = !!req.session.user && canManage(car, req);

    res.render('car-detail', {
      title: car.title || `Car #${id}`,
      car,
      images,
      canEdit,
      error: req.query.error || null
    });
  } catch (err) { next(err); }
});

/* ================== edit / update / delete car ================== */
// edit form for car (auth + ownership check)
router.get('/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const car = await get('SELECT * FROM cars WHERE id = ?', [id]);
    if (!car) return res.status(404).render('404', { title: 'Not found' });
    if (!canManage(car, req)) return res.redirect('/login');

    res.render('car-edit', { title: `Edit: ${car.title}`, car });
  } catch (err) { next(err); }
});

// update existing car
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const car = await get('SELECT * FROM cars WHERE id = ?', [id]);
    if (!car) return res.status(404).render('404', { title: 'Not found' });
    if (!canManage(car, req)) return res.redirect('/login');

    const {
      title, brand, model, year, price, mileage,
      transmission, fuel, horsepower, body_type, description
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).render('car-edit', {
        title: `Edit: ${car.title}`,
        car,
        error: 'Title is required.'
      });
    }

    await run(
      `UPDATE cars
          SET title = ?, brand = ?, model = ?, year = ?, price = ?, mileage = ?,
              transmission = ?, fuel = ?, horsepower = ?, body_type = ?, description = ?
        WHERE id = ?`,
      [
        String(title).trim(), (brand && String(brand).trim()) || null,
        (model && String(model).trim()) || null,
        year ? Number(year) : null,
        price ? Number(price) : null,
        mileage ? Number(mileage) : null,
        transmission || null, fuel || null,
        horsepower ? Number(horsepower) : null,
        body_type || null,
        (description && String(description).trim()) || null,
        id
      ]
    );

    res.redirect(`/cars/${id}`);
  } catch (err) { next(err); }
});

// delete car (and its images)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const car = await get('SELECT * FROM cars WHERE id = ?', [id]);
    if (!car) return res.status(404).render('404', { title: 'Not found' });
    if (!canManage(car, req)) return res.redirect('/login');

    await run('DELETE FROM car_images WHERE car_id = ?', [id]);
    await run('DELETE FROM cars WHERE id = ?', [id]);

    res.redirect('/cars');
  } catch (err) { next(err); }
});

/* ================== add/remove images after creation ================== */
// upload extra images after car is created
router.post('/:id/images', requireAuth, (req, res, next) => {
  uploadMany(req, res, async (err) => {
    if (err) {
      return res.status(400).redirect(
        `/cars/${req.params.id}?error=${encodeURIComponent(err.message)}`
      );
    }
    try {
      const id = Number(req.params.id);
      const car = await get('SELECT * FROM cars WHERE id = ?', [id]);
      if (!car) return res.status(404).render('404', { title: 'Not found' });
      if (!canManage(car, req)) return res.redirect('/login');

      const files = req.files || [];
      for (const [idx, f] of files.entries()) {
        await run(
          'INSERT INTO car_images (car_id, path, alt, sort_order) VALUES (?, ?, ?, ?)',
          [id, 'uploads/' + path.basename(f.path), car.title, idx + 1000]
        );
      }
      res.redirect(`/cars/${id}`);
    } catch (e) { next(e); }
  });
});

// delete one image from car
router.delete('/:id/images/:imageId', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const imageId = Number(req.params.imageId);

    const car = await get('SELECT * FROM cars WHERE id = ?', [id]);
    if (!car) return res.status(404).render('404', { title: 'Not found' });
    if (!canManage(car, req)) return res.redirect('/login');

    await run('DELETE FROM car_images WHERE id = ? AND car_id = ?', [imageId, id]);
    res.redirect(`/cars/${id}`);
  } catch (err) { next(err); }
});

// exports
module.exports = router;