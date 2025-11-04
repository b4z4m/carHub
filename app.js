// App bootstrapping for Express.
// - View engine (Handlebars) + helpers
// - Static files, body parsers, method-override
// - Sessions (SQLiteStore)
// - res.locals (isAuth, user)
// - Mount routers (/cars, /users, /auth, /admin, /profile)
// - 404 & 500 handlers

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const methodOverride = require('method-override');
const { engine } = require('express-handlebars');

// Routers
const homeRouter = require('./routes/home');
const carsRouter = require('./routes/cars');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth-router');
const adminRouter = require('./routes/admin');
const profileRouter = require('./routes/profile');

// Uploads directory (ensure exists)
const uploadDir = process.env.UPLOAD_DIR || 'public/uploads';
fs.mkdirSync(path.join(__dirname, uploadDir), { recursive: true });

const app = express();

// View engine (Handlebars)
app.engine('handlebars', engine({
  defaultLayout: 'main',
  extname: '.handlebars',
  helpers: {
    year: () => new Date().getFullYear(),
    eq: (a, b) => String(a) === String(b),
    // Tiny helpers for template math/formatting
    add: (a, b) => Number(a) + Number(b),
    subtract: (a, b) => Number(a) - Number(b),
     formatPrice: (v) => {
      if (v == null || v === '') return '';
      const n = Number(v);
      if (Number.isNaN(n)) return v;
      return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n);
    }
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Global middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Sessions (SQLiteStore)
app.use(session({
  store: new SQLiteStore({ dir: __dirname, db: 'session-db.db' }),
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, sameSite: 'lax', secure: false }
}));

// res.locals for templates
app.use((req, res, next) => {
  res.locals.isAuth = !!req.session.user;
  res.locals.user = req.session.user || null;
  next();
});

// Basic pages
app.get('/home', (req, res) => res.render('home', { title: 'Home' }));
app.get('/contact', (req, res) => res.render('contact', { title: 'Contact' }));
app.get('/about', (req, res) =>   res.render('about', { title: 'About' }));

// Feature routers (mount points)
app.use('/', homeRouter);       // homepage route
app.use('/cars', carsRouter);
app.use('/users', usersRouter);
app.use('/', authRouter);       // /login, /loggedin, /logout
app.use('/admin', adminRouter); // admin section
app.use('/profile', profileRouter); // profile pages

// 404 & 500 handlers
app.use((req, res) => res.status(404).render('404', { title: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('404', { title: 'Error', error: 'Something went wrong.' });
});

module.exports = app;