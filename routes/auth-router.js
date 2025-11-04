// Auth routes: login/logout + register (creates account and logs in)
// defines /login, /logout, /register, /loggedin and sets session on success
// validates input and uses bcryptjs for hashing

const express = require('express');
const bcrypt = require('bcryptjs');
const { get, run } = require('../utils/db');

const router = express.Router();

/* ============ GET /login ============ */
// login page (redirect to /cars if already logged in)
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/cars');
  res.render('login', { title: 'Log in' });
});

/* ============ POST /login ============ */
// handles login (validate user, compare password, set session)
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const uname = String(username || '').trim();

    if (!uname || !password) {
      return res.status(400).render('login', {
        title: 'Log in',
        error: 'Username and password are required.',
        form: { username: uname }
      });
    }

    // admin seed (username=admin, pw=wdf#2025) exists from utils/db if missing
    const user = await get('SELECT * FROM users WHERE username = ?', [uname]);
    if (!user) {
      return res.status(401).render('login', {
        title: 'Log in',
        error: 'Wrong username or password.',
        form: { username: uname }
      });
    }

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      return res.status(401).render('login', {
        title: 'Log in',
        error: 'Wrong username or password.',
        form: { username: uname }
      });
    }

    req.session.user = { id: user.id, username: user.username, isAdmin: !!user.is_admin };
    res.redirect('/cars');
  } catch (err) {
    next(err);
  }
});

/* ============ POST /logout ============ */
// destroys session and redirects home
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

/* ============ GET /register ============ */
// register page (redirect to /cars if logged in)
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/cars');
  res.render('register', { title: 'Create account' });
});

/* ============ POST /register ============ */
// creates account (validate, unique username, bcrypt hash, auto-login)
router.post('/register', async (req, res, next) => {
  try {
    const { username, password, confirm_password } = req.body || {};
    const uname = String(username || '').trim();

    const errors = [];
    if (!uname) errors.push('Username is required.');
    if (!password) errors.push('Password is required.');
    if (password && password.length < 6) errors.push('Password must be at least 6 characters.');
    if (password !== confirm_password) errors.push('Passwords do not match.');
    if (uname && !/^[a-zA-Z0-9_.-]{3,20}$/.test(uname)) {
      errors.push('Username must be 3–20 chars: letters, numbers, dot, dash or underscore.');
    }

    if (errors.length) {
      return res.status(400).render('register', {
        title: 'Create account',
        error: errors.join(' '),
        form: { username: uname }
      });
    }

    // unique username check
    const existing = await get('SELECT id FROM users WHERE username = ?', [uname]);
    if (existing) {
      return res.status(409).render('register', {
        title: 'Create account',
        error: 'That username is already taken.',
        form: { username: uname }
      });
    }

    // create user with bcrypt hash
    const hash = bcrypt.hashSync(password, 10);
    const result = await run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [uname, hash]
    );

    // auto-login after register
    req.session.user = { id: result.lastID, username: uname, isAdmin: false };
    res.redirect('/cars');
  } catch (err) {
    next(err);
  }
});

/* ============ GET /loggedin (simple) ============ */
// simple logged-in only page (no extra middleware)
router.get('/loggedin', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('loggedin', { title: 'Logged in' });
});

// exports
module.exports = router;