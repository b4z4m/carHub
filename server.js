// Main entry point for the app.
// - Loads environment variables
// - Initializes the database (runs schema, seeds admin if needed)
// - Starts Express server from app.js

require('dotenv').config();

const { init } = require('./utils/db');
const app = require('./app');

const PORT = process.env.PORT || 3000;

// Initialize DB and then start server
init().then(() => {
  app.listen(PORT, () => {
    console.log(`CarHub running: http://localhost:${PORT}`);
  });
}).catch((e) => {
  console.error('DB init fail:', e);
  process.exit(1);
});