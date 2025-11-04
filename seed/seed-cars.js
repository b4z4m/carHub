// Purpose: seed demo users and ~30 cars (optionally attach seed images).
// Safe to re-run: usernames use INSERT OR IGNORE; cars are recreated each run.
// Run from project root: node seed/seed-cars.js

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// DB helpers (init applies schema and seeds admin if missing)
const { init, run, get, all } = require('../utils/db');

// ---------- Config ----------
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'public/uploads';
// Optional seed images folder; any jpg/png/webp/gif here will be auto-attached to cars
const SEED_IMG_DIR = path.join(process.cwd(), 'public', 'uploads', 'seed');

// Demo users (non-admin). Password for all = "test1234".
const DEMO_USERS = [
  { username: 'alice', is_admin: 0 },
  { username: 'bob',   is_admin: 0 },
  { username: 'carl',  is_admin: 0 },
  { username: 'dina',  is_admin: 0 },
];

// Car catalog parts used to generate random cars
const BRANDS = {
  Audi:   ['A3', 'A4', 'A6', 'S3', 'RS3'],
  BMW:    ['118i', '320d', '330e', 'M240i', 'M3'],
  Mercedes: ['A180', 'C220d', 'E300e', 'AMG C43', 'AMG GT'],
  Volvo:  ['V40', 'V60', 'V90', 'XC40', 'XC60', 'XC90'],
  Tesla:  ['Model 3', 'Model Y', 'Model S'],
  Toyota: ['Corolla', 'RAV4', 'Supra'],
  Volkswagen: ['Golf', 'Passat', 'Tiguan', 'Polo', 'ID.3'],
};

const BODY_TYPES = ['Sedan', 'SUV', 'Wagon', 'Hatchback', 'Coupe'];
const FUELS = ['Petrol', 'Diesel', 'Hybrid', 'Electric'];
const TRANSMISSIONS = ['Manual', 'Automatic'];

// ---------- Utilities ----------
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Build a title like "2020 BMW 330e" or "Audi RS3 Performance"
function buildTitle(brand, model, year) {
  const extra = Math.random() < 0.25 ? ' Performance' : '';
  return `${year} ${brand} ${model}${extra}`;
}

// Read seed images from /public/uploads/seed (if present)
function loadSeedImages() {
  try {
    const files = fs.readdirSync(SEED_IMG_DIR)
      .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
      // store as web-root relative (public/ is web root)
      .map(f => path.join('uploads', 'seed', f));
    return files;
  } catch {
    return [];
  }
}

// ---------- Main ----------
(async () => {
  try {
    console.log('→ Init DB…');
    await init();

    // Ensure upload dirs exist
    fs.mkdirSync(path.join(process.cwd(), UPLOAD_DIR), { recursive: true });
    fs.mkdirSync(SEED_IMG_DIR, { recursive: true });

    // 1) Seed demo users (idempotent via INSERT OR IGNORE)
    console.log('→ Seeding users…');
    const passwordHash = bcrypt.hashSync('test1234', 10);

    for (const u of DEMO_USERS) {
      await run(
        `INSERT OR IGNORE INTO users (username, password_hash, is_admin)
         VALUES (?, ?, ?)`,
        [u.username, passwordHash, u.is_admin]
      );
    }

    // Include admin that init() may have added
    const users = await all('SELECT id, username, is_admin FROM users ORDER BY id');
    if (!users.length) throw new Error('No users found after seeding — check schema/init.');

    // 2) Fresh dataset: clear previous cars (and images)
    //    Comment this block if you want to keep existing cars.
    console.log('→ Clearing previous cars (and images)…');
    // Note: delete both tables to avoid FK issues in environments without ON DELETE CASCADE
    await run('DELETE FROM car_images');
    await run('DELETE FROM cars');

    // 3) Load optional seed images
    const seedImages = loadSeedImages();
    console.log(`→ Found ${seedImages.length} seed image(s) in /public/uploads/seed`);

    // 4) Create cars
    console.log('→ Creating cars…');
    const TARGET = 30;
    let created = 0;

    const brandKeys = Object.keys(BRANDS);
    const now = Date.now();

    for (let i = 0; i < TARGET; i++) {
      const brand = sample(brandKeys);
      const model = sample(BRANDS[brand]);

      const year = rnd(2008, 2024);
      const price = rnd(70000, 950000); // SEK
      const mileage = rnd(0, 240_000);
      const transmission = sample(TRANSMISSIONS);
      const fuel = sample(FUELS);
      const horsepower = rnd(80, 650);
      const bodyType = sample(BODY_TYPES);

      const title = buildTitle(brand, model, year);
      const description = `Demo seed car. Brand: ${brand}, model: ${model}. Generated at ${new Date(now).toISOString()}.`;

      // Assign an owner by simple round-robin
      const owner = users[i % users.length];

      const result = await run(
        `INSERT INTO cars (user_id, title, brand, model, year, price, mileage,
                           transmission, fuel, horsepower, body_type, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          owner.id,
          title, brand, model, year, price, mileage,
          transmission, fuel, horsepower, bodyType, description
        ]
      );
      const carId = result.lastID;

      // Attach 1–3 images when available (skip if folder empty)
      const imgCount = seedImages.length ? rnd(1, Math.min(3, seedImages.length)) : 0;
      for (let idx = 0; idx < imgCount; idx++) {
        const filePath = seedImages[(i + idx) % seedImages.length]; // rotate through files
        await run(
          'INSERT INTO car_images (car_id, path, alt, sort_order) VALUES (?, ?, ?, ?)',
          [carId, filePath, title, idx]
        );
      }

      created++;
    }

    console.log(`✔ Done. Created ${created} cars.`);
    const countCars = await get('SELECT COUNT(*) AS n FROM cars');
    const countImgs = await get('SELECT COUNT(*) AS n FROM car_images');
    console.log(`Totals → cars: ${countCars.n}, images: ${countImgs.n}`);

    console.log('\nNext steps:');
    console.log('1) (Optional) Add images to public/uploads/seed and run the seed again.');
    console.log('2) Start the app: npm run dev');
    console.log('3) Open http://localhost:3000/cars to see the data.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
})();