// server.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const methodOverride = require('method-override');
const { engine } = require('express-handlebars');

const app = express();
const PORT = process.env.PORT || 3000;

// Säkerställ uppladdningsmapp finns (t.ex. public/uploads)
const uploadDir = process.env.UPLOAD_DIR || 'public/uploads';
fs.mkdirSync(path.join(__dirname, uploadDir), { recursive: true });

// View engine (Handlebars, .handlebars, main-layout)
app.engine('handlebars', engine({
  defaultLayout: 'main',
  extname: '.handlebars',
  helpers: {
    year: () => new Date().getFullYear(),
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Sessions i SQLite (samma upplägg som läraren)
app.use(session({
  store: new SQLiteStore({
    dir: __dirname,
    db: 'session-db.db'
  }),
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 dagar
}));

// Locals till vyer (t.ex. inloggad-användare)
app.use((req, res, next) => {
  res.locals.isAuth = !!req.session.user;
  res.locals.user = req.session.user || null;
  next();
});

// --- Rutter ---
// Hem
app.get('/', (req, res) => {
  res.render('home', { title: 'Hem' });
});

// Kontakt
app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Kontakt' });
});

// Bilar (placeholderlista)
app.get('/cars', (req, res) => {
  const cars = []; // Här fyller du senare från DB
  res.render('cars', { title: 'Bilar', cars });
});

// Bil-detalj (placeholder)
app.get('/cars/:id', (req, res) => {
  const { id } = req.params;
  // Hämta senare från DB med id
  res.render('car-detail', { title: `Bil #${id}`, carId: id });
});

// Login (enkel – byggs ut senare)
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/loggedin');
  res.render('login', { title: 'Logga in' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Minimal demo-inloggning. Byt till riktig user-tabell senare.
  if (username === 'admin' && password === 'admin123') {
    req.session.user = { username: 'admin', isAdmin: true };
    return res.redirect('/loggedin');
  }

  res.status(401).render('login', { title: 'Logga in', error: 'Fel användarnamn eller lösenord.' });
});

app.get('/loggedin', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('loggedin', { title: 'Inloggad' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Sidan finns inte' });
});

// Start
app.listen(PORT, () => {
  console.log(`CarHub igång: http://localhost:${PORT}`);
});