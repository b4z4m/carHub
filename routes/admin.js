// defines everything under /admin and protects with requireAdmin middleware
// safe user actions: toggle admin role, soft-delete user

// imports and creats router
const express = require('express');
const router = express.Router();

const { get, all, run } = require('../utils/db');
const { requireAdmin } = require('../middleware/auth');

// safely converts string to int or returns default
function toInt(v, def = null) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// reads pagination inputs from req.query
function pageInputs(req, { defaultSize = 20, maxSize = 200 } = {}) {
  let page = toInt(req.query.page, 1);
  let pageSize = toInt(req.query.pageSize, defaultSize);
  if (!page || page < 1) page = 1;
  if (!pageSize || pageSize < 1) pageSize = defaultSize;
  pageSize = clamp(pageSize, 1, maxSize);
  return { page, pageSize };
}

// calculates pagination plan
function pagePlan(totalCount, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const safeOffset = (safePage - 1) * pageSize;
  return { totalPages, safePage, safeOffset };
}

// makes range {from, to} from rows with id field
function makeRangeFromRows(rows) {
  if (!rows || !rows.length) return null;
  const ids = rows.map(r => r.id).filter(v => v != null);
  if (!ids.length) return null;
  return { from: Math.min(...ids), to: Math.max(...ids) };
}

// fetches dashboard metrics
async function dashboardMetrics() {
  const [users, admins, deletedUsers, cars, images] = await Promise.all([
    get('SELECT COUNT(*) AS n FROM users'),
    get('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1'),
    get(`SELECT COUNT(*) AS n FROM users WHERE username LIKE 'deleted_user_%'`),
    get('SELECT COUNT(*) AS n FROM cars'),
    get('SELECT COUNT(*) AS n FROM car_images'),
  ]);
  const [maxUser, maxCar, maxImg] = await Promise.all([
    get('SELECT MAX(id) AS id FROM users'),
    get('SELECT MAX(id) AS id FROM cars'),
    get('SELECT MAX(id) AS id FROM car_images'),
  ]);
  return {
    totalUsers: users?.n || 0,
    totalAdmins: admins?.n || 0,
    totalDeletedUsers: deletedUsers?.n || 0,
    totalCars: cars?.n || 0,
    totalImages: images?.n || 0,
    latestIds: {
      user: maxUser?.id || null,
      car: maxCar?.id || null,
      image: maxImg?.id || null,
    }
  };
}

// fetches all users (raw) for listing
async function fetchAllUsersRaw(order = 'ASC', limit = 20, offset = 0) {
  return all(
    `
    SELECT
      id,
      username,
      is_admin,
      (username LIKE 'deleted_user_%') AS is_deleted
    FROM users
    ORDER BY id ${order}
    LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );
}

async function countUsers() {
  const r = await get('SELECT COUNT(*) AS cnt FROM users');
  return r?.cnt || 0;
}

async function fetchUserById(id) {
  return get(
    `
    SELECT
      id, username, is_admin,
      (username LIKE 'deleted_user_%') AS is_deleted
    FROM users
    WHERE id = ?
    `,
    [id]
  );
}

// fetches cars for listing
async function countCars() {
  const r = await get('SELECT COUNT(*) AS cnt FROM cars');
  return r?.cnt || 0;
}
async function fetchCarsPage(order = 'ASC', limit = 20, offset = 0) {
  return all(
    `
    SELECT
      c.id, c.title, c.user_id,
      u.username AS owner_username,
      (u.username LIKE 'deleted_user_%') AS owner_is_deleted
    FROM cars c
    LEFT JOIN users u ON u.id = c.user_id
    ORDER BY c.id ${order}
    LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );
}

// fetches table row count, used for read-only tables in admin view
async function countTable(tableName) {
  const r = await get(`SELECT COUNT(*) AS cnt FROM ${tableName}`);
  return r?.cnt || 0;
}
async function fetchTableRows(tableName, orderCol = 'id', orderDir = 'ASC', limit = 50, offset = 0) {
  return all(
    `SELECT * FROM ${tableName} ORDER BY ${orderCol} ${orderDir} LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}
async function fetchTableColumns(tableName) {
  return all(`PRAGMA table_info(${tableName})`);
}

const ALLOWED_TABLES = ['users', 'cars', 'car_images'];

// admin dashboard
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const metrics = await dashboardMetrics();
    res.render('admin', {
      title: 'Admin • Dashboard',
      mode: 'dashboard',
      metrics,
    });
  } catch (err) { next(err); }
});

// list users in admin view
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const { page, pageSize } = pageInputs(req, { defaultSize: 20 });
    const totalCount = await countUsers();
    const { totalPages, safePage, safeOffset } = pagePlan(totalCount, page, pageSize);

    const users = await fetchAllUsersRaw('ASC', pageSize, safeOffset);
    res.render('admin', {
      title: 'Admin • Users',
      mode: 'users',
      users,
      pagination: {
        page: safePage, pageSize, totalPages, totalCount,
        range: makeRangeFromRows(users)
      }
    });
  } catch (err) { next(err); }
});

// list cars in admin view
router.get('/cars', requireAdmin, async (req, res, next) => {
  try {
    const { page, pageSize } = pageInputs(req, { defaultSize: 20 });
    const totalCount = await countCars();
    const { totalPages, safePage, safeOffset } = pagePlan(totalCount, page, pageSize);

    const cars = await fetchCarsPage('ASC', pageSize, safeOffset);
    res.render('admin', {
      title: 'Admin • Cars',
      mode: 'cars',
      cars,
      pagination: {
        page: safePage, pageSize, totalPages, totalCount,
        range: makeRangeFromRows(cars)
      }
    });
  } catch (err) { next(err); }
});

// read-only table viewer in admin view
router.get('/tables', requireAdmin, async (req, res, next) => {
  try {
    const t = (req.query.t || 'users').toLowerCase();
    const table = ALLOWED_TABLES.includes(t) ? t : 'users';

    const { page, pageSize } = pageInputs(req, { defaultSize: 50, maxSize: 200 });
    const totalCount = await countTable(table);
    const { totalPages, safePage, safeOffset } = pagePlan(totalCount, page, pageSize);

    const [columns, rows] = await Promise.all([
      fetchTableColumns(table),
      fetchTableRows(table, 'id', 'ASC', pageSize, safeOffset),
    ]);

    const colNames = (columns || []).map(c => c.name);
    const rowsMatrix = (rows || []).map(row =>
      colNames.map(name => (row[name] === null || row[name] === undefined) ? '' : row[name])
    );

    res.render('admin', {
      title: 'Admin • Tables',
      mode: 'tables',
      table,
      tables: ALLOWED_TABLES,
      columns: columns || [],
      colNames,
      rows,        
      rowsMatrix,  
      pagination: {
        page: safePage, pageSize, totalPages, totalCount,
        range: makeRangeFromRows(rows)
      }
    });
  } catch (err) { next(err); }
});

// toggle admin role for user in admin view
router.post('/users/:id/toggle-admin', requireAdmin, async (req, res, next) => {
  try {
    const targetId = toInt(req.params.id);
    const meId = req.session.user.id;
    if (!targetId) return res.redirect('/admin/users');

    if (targetId === meId) {
      return res.status(400).render('admin', {
        title: 'Admin • Users',
        mode: 'users',
        users: await fetchAllUsersRaw('ASC', 20, 0),
        message: 'You cannot change your own admin role.'
      });
    }

    const u = await fetchUserById(targetId);
    if (!u) {
      return res.status(404).render('admin', {
        title: 'Admin • Users',
        mode: 'users',
        users: await fetchAllUsersRaw('ASC', 20, 0),
        message: 'User not found.'
      });
    }
    if (u.is_deleted) {
      return res.status(400).render('admin', {
        title: 'Admin • Users',
        mode: 'users',
        users: await fetchAllUsersRaw('ASC', 20, 0),
        message: 'This account is deleted. Actions are disabled.'
      });
    }

    const newFlag = u.is_admin ? 0 : 1;
    await run('UPDATE users SET is_admin = ? WHERE id = ?', [newFlag, targetId]);
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

// Soft-delete user without removing other data in admin view
router.post('/users/:id/soft-delete', requireAdmin, async (req, res, next) => {
  try {
    const targetId = toInt(req.params.id);
    const meId = req.session.user.id;
    if (!targetId) return res.redirect('/admin/users');

    if (targetId === meId) {
      return res.status(400).render('admin', {
        title: 'Admin • Users',
        mode: 'users',
        users: await fetchAllUsersRaw('ASC', 20, 0),
        message: 'You cannot soft-delete your own account.'
      });
    }

    const u = await fetchUserById(targetId);
    if (!u) {
      return res.status(404).render('admin', {
        title: 'Admin • Users',
        mode: 'users',
        users: await fetchAllUsersRaw('ASC', 20, 0),
        message: 'User not found.'
      });
    }
    if (u.is_deleted) {
      return res.redirect('/admin/users'); 
    }

    const tombstone = `deleted_user_${targetId}`;
    const randomHash = `softdeleted_${Date.now()}_${Math.round(Math.random()*1e9)}`;

    await run(
      `
      UPDATE users
         SET username = ?,
             password_hash = ?,
             is_admin = 0
       WHERE id = ?
      `,
      [tombstone, randomHash, targetId]
    );

    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

//exports
module.exports = router;