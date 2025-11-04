// DB helpers: sqlite3 wrapper with Promises + auto-init of schema and admin user.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

// paths & constants (DB file + schema file)
const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'carhub-data.db');
const SCHEMA_FILE = path.join(process.cwd(), 'schema', '001_init.sql');

// open sqlite connection
const db = new sqlite3.Database(DB_FILE);

// promise helpers (run/get/all)
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// init: apply schema and (optionally) seed an admin from .env
async function init() {
  // 1) apply schema
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  await new Promise((resolve, reject) => db.exec(schemaSql, (err) => (err ? reject(err) : resolve())));

  // 2) seed admin if ADMIN_USERNAME/PASSWORD_HASH exist and user is missing
  const { ADMIN_USERNAME, ADMIN_PASSWORD_HASH } = process.env;
  if (ADMIN_USERNAME && ADMIN_PASSWORD_HASH) {
    const existing = await get('SELECT id FROM users WHERE username = ?', [ADMIN_USERNAME]);
    if (!existing) {
      await run(
        'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)',
        [ADMIN_USERNAME, ADMIN_PASSWORD_HASH]
      );
      // eslint-disable-next-line no-console
      console.log(`[db:init] Skapade admin-konto "${ADMIN_USERNAME}" från .env`);
    }
  }
}

// exports
module.exports = { db, run, get, all, init };