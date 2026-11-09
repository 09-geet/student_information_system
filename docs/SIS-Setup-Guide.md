# 🎓 Student Information System — Setup Guide

## What Was Built

A complete, production-quality Student Information System with:

| Layer | Technology | Key Files |
|-------|-----------|-----------|
| Frontend | HTML5 + CSS3 + Vanilla JS | `public/login.html`, `public/index.html`, `public/css/style.css`, `public/js/login.js`, `public/js/app.js` |
| Backend | Node.js + Express.js | `server/app.js`, `server/db.js` |
| API Routes | Express Router | `server/routes/auth.js`, `server/routes/students.js` |
| Database | MySQL | `database/schema.sql` |

---

## Project Structure (matches spec exactly)

```
student-information-system/
  public/
    index.html          ← Dashboard (SPA with sidebar nav)
    login.html          ← Admin login page
    css/style.css       ← All styles (responsive, design tokens)
    js/app.js           ← Dashboard logic (CRUD, search, pagination)
    js/login.js         ← Login page logic
  server/
    app.js              ← Express entry point (sessions, rate limiting, routing)
    db.js               ← MySQL connection pool
    routes/students.js  ← Full CRUD + stats + dropdowns
    routes/auth.js      ← Login / logout / session check
  database/schema.sql   ← Tables + seed data + correct admin hash
  .env.example          ← Credential template
  .gitignore
  package.json
  README.md
```

---

## Step-by-Step: How to Run

### 1. Set up MySQL Database

**Option A — MySQL Workbench**
1. Open MySQL Workbench → connect to local server
2. File → Open SQL Script → pick `database/schema.sql`
3. Click ⚡ Execute

**Option B — Command Line**
```bash
mysql -u root -p < database/schema.sql
```

This creates `student_db` with all tables and seed data.

### 2. Configure `.env`

The `.env` file was already copied from `.env.example`. Open it and fill in your MySQL password:

```
# File: student-information-system/.env
DB_PASSWORD=your_actual_mysql_password
SESSION_SECRET=any_long_random_string_here_at_least_32_chars
```

> [!IMPORTANT]
> Never put your real password in `.env.example` — that file is safe to commit. `.env` is gitignored.

### 3. Start the Server

```bash
# From the student-information-system/ folder:
npm start         # production
npm run dev       # development (auto-restarts on file changes)
```

You should see:
```
✅  MySQL connected successfully.
🚀  Server running at http://localhost:3000
```

### 4. Login

Open **http://localhost:3000** → you'll see the login page.

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `Admin@123` |

> [!WARNING]
> Change the admin password in your database after first login!

---

## REST API Reference

All student routes require a valid login session.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | ❌ | Login |
| POST | `/api/auth/logout` | ❌ | Logout |
| GET | `/api/auth/me` | ❌ | Session check |
| GET | `/api/students` | ✅ | List (search, filter, paginate) |
| GET | `/api/students/stats` | ✅ | Dashboard counts |
| GET | `/api/students/:id` | ✅ | Single student |
| POST | `/api/students` | ✅ | Add student |
| PUT | `/api/students/:id` | ✅ | Update student |
| DELETE | `/api/students/:id` | ✅ | Delete student |
| GET | `/api/students/departments` | ✅ | All departments |
| GET | `/api/students/courses` | ✅ | All courses |

---

## Security Implementation

| Feature | How it works |
|---------|-------------|
| Password hashing | bcrypt with 12 salt rounds (`bcryptjs`) |
| SQL injection prevention | Parameterized queries everywhere via `mysql2` |
| Session auth | `express-session` with `httpOnly`, `sameSite: lax` cookie |
| Route protection | `requireAuth` middleware on all `/api/students` routes |
| Brute-force protection | Rate limiter: 20 login attempts / 15 min / IP |
| Credentials | Stored in `.env`, never in source code |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `❌ MySQL connection failed` | Check `DB_PASSWORD` in `.env`; make sure MySQL service is running |
| `Port 3000 in use` | Change `PORT=3001` in `.env` |
| Login fails | Re-run `schema.sql` (restores default admin hash) |
| `Cannot find module` | Run `npm install` again |
| Nodemon `braces` warning | Affects dev-only tool, safe to ignore |

---

## Database Schema Summary

```sql
departments  ← id, name, code
     ↓
courses      ← id, name, code, department_id, duration_years
     ↓
students     ← id, name, roll_number, email, phone,
               course_id, department_id, admission_date, status
admins       ← id, username, email, password_hash, full_name, last_login
```

All foreign keys have `ON DELETE CASCADE` or `RESTRICT` to maintain data integrity.
