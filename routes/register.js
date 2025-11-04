// Public registration: create user, bcrypt hash, username is immutable by design
// - GET /register  → render register form
// - POST /register → validate, check uniqueness, insert, auto-login

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { get, run } = require('../utils/db');

// redirect if already authenticated
function redirectIfAuth(req, res, next) {
  if (req.session?.user) return res.redirect('/loggedin');
  next();
}

/* ============ GET /register ============ */
router.get('/', redirectIfAuth, (req, res) => {
  res.render('register', { title: 'Register' });
});

/* ============ POST /register ============ */
router.post('/', redirectIfAuth, async (req, res, next) => {
  try {
    const { username, password, password2 } = req.body || {};
    const errors = [];

    // parse + normalize inputs
    const uname = String(username || '').trim();
    const pass1 = String(password || '');
    const pass2 = String(password2 || '');

    // validation rules
    // - username: 3–20 chars, letters/numbers/_/-
    if (!uname) errors.push('Username is required.');
    else if (!/^[a-z0-9_-]{3,20}$/i.test(uname)) {
      errors.push('Username must be 3–20 characters (letters, numbers, "_" or "-").');
    }
    // - password: ≥ 6 chars
    if (!pass1) errors.push('Password is required.');
    else if (pass1.length < 6) errors.push('Password must be at least 6 characters.');
    // - confirm
    if (pass1 !== pass2) errors.push('Passwords do not match.');

    // early return on validation errors
    if (errors.length) {
      return res.status(400).render('register', {
        title: 'Register',
        error: errors.join(' '),
        form: { username: uname }
      });
    }

    // uniqueness check
    const existing = await get('SELECT id FROM users WHERE username = ?', [uname]);
    if (existing) {
      return res.status(400).render('register', {
        title: 'Register',
        error: 'That username is already taken.',
        form: { username: uname }
      });
    }

    // hash password + insert user
    const hash = bcrypt.hashSync(pass1, 10);
    const result = await run(
      `INSERT INTO users (username, password_hash, is_admin)
       VALUES (?, ?, 0)`,
      [uname, hash]
    );

    // auto-login after successful registration
    req.session.user = {
      id: result.lastID,
      username: uname,
      isAdmin: false
    };

    // done
    res.redirect('/loggedin');
  } catch (err) {
    next(err);
  }
});

module.exports = router;