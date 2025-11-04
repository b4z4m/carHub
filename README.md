# CarHub

A simple car listing web app for the course Web Development Fundamentals.

## Stack
- Node.js, Express
- Handlebars (views)
- SQLite (data)
- Multer (uploads)
- Nodemon (dev)

## Quick start
```zsh
npm install
cp .env.example .env   # fill real values
npm run dev            # runs nodemon server.js

App runs at: http://localhost:3000

Environment variables

Set these in .env (see .env.example):
	•	SESSION_SECRET – long random string
	•	UPLOAD_DIR – e.g. public/uploads
	•	ADMIN_USERNAME – e.g. admin
	•	ADMIN_PASSWORD_HASH – bcrypt hash
	•	DB_FILE – e.g. carhub-data.db

Scripts
	•	npm run dev – start with nodemon
	•	npm start – start in production

Project structure (short)
	•	/views – handlebars templates
	•	/routes – Express routes (incl. admin)
	•	/utils – helpers (db, multer, etc.)
	•	/public – static files (css, uploads, etc.)
	•	/seed – optional seed script/files
	•	/schema – SQL init files (optional, for setup)

Notes
	•	Do not commit real secrets. Commit .env.example only.
	•	Images in public/uploads/ are user content.
	•	Admin view includes read-only tables for users/cars/images.
