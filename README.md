# 🎓 Student Information System (SIS)

A modern, full-stack web application for academic institution management, featuring an **Administrator Management Portal** and a dedicated **Student Self-Service Portal**.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies Used |
|---|---|
| **Frontend** | HTML5, Modern CSS3 (Variables, Flexbox/Grid, Responsive Design), Vanilla JavaScript (SPA, Fetch API, CSRF Token Handling) |
| **Backend** | Node.js, Express.js |
| **Database** | MySQL 8.0+ / MariaDB (`mysql2` connection pooling) |
| **Security** | `csurf` CSRF protection, `bcryptjs` password hashing, `express-session` HTTP-only session cookies, `express-rate-limit` brute-force protection |

---

## 📁 Project Directory Structure

```
student_information_system/
├── .env.example              # Template configuration for environment variables
├── .gitignore                # Git ignore rules (protects credentials & node_modules)
├── package.json              # Project metadata, dependencies, and npm scripts
├── package-lock.json         # Pinned dependency lockfile
├── README.md                 # Complete project guide and setup instructions
│
├── database/                 # Database schemas and migration scripts
│   ├── 00_full_schema_and_seed.sql   # ⭐ Consolidated all-in-one setup script
│   ├── schema.sql                    # Core base schema (departments, courses, admins, students)
│   ├── migration_v2.sql              # Fee and Attendance tables
│   └── migration_v3_student_auth.sql # Student accounts and announcements
│
├── migrations/               # Additional module migrations
│   ├── add_attendance_sessions.sql   # QR attendance sessions table
│   └── add_exams_and_results.sql     # Exams and grade results tables
│
├── docs/                     # Project documentation & reference material
│   ├── SIS-Setup-Guide.md            # In-depth setup walkthrough
│   ├── API_DOCUMENTATION.md          # REST API endpoints reference
│   ├── DATABASE_SCHEMA.md            # ER diagram & table specifications
│   └── diagrams/
│       └── ER_DIAGRAM.png            # Visual database ER diagram
│
├── public/                   # Frontend static assets served by Express
│   ├── index.html                    # Admin Dashboard SPA
│   ├── login.html                    # Admin Login portal
│   ├── student-dashboard.html        # Student Self-Service Portal
│   ├── student-login.html            # Student Login portal
│   ├── css/
│   │   └── style.css                 # Main stylesheet with unified design tokens
│   └── js/
│       ├── app.js                    # Admin dashboard logic (CRUD, fees, attendance)
│       ├── csrf.js                   # Client-side CSRF token manager & auto-refresher
│       ├── login.js                  # Admin authentication handler
│       ├── student-app.js            # Student portal controller
│       └── student-login.js          # Student authentication handler
│
├── scripts/                  # Automation and operational scripts
│   └── startClean.js                 # Process cleanup and safe server starter on Windows
│
├── server/                   # Backend application source code
│   ├── app.js                        # Express server entry point, middleware & route mounting
│   ├── db.js                         # MySQL2 connection pool setup
│   └── routes/
│       ├── auth.js                   # Admin & Student authentication, sessions, logout
│       ├── students.js               # Student CRUD, stats, and search/filter APIs
│       ├── fees.js                   # Fee ledger, fee updates, payment receipts
│       ├── attendance.js             # Batch attendance marking, stats, <75% warnings
│       ├── attendanceSessions.js     # QR attendance session management
│       ├── exams.js                  # Exam scheduling and marksheet entries
│       └── studentPortal.js          # Student-specific authenticated endpoints
│
└── tests/                    # Automated testing scripts
    └── test_student_portal.js        # Test suite for student authentication & portal
```

---

## ⚡ Quick Start Guide (Windows)

### Step 1: Prerequisites
Make sure you have the following installed on your machine:
1. **Node.js** (v16 or higher) — [Download Node.js](https://nodejs.org/)
2. **MySQL Server** (v8.0+) — [Download MySQL](https://dev.mysql.com/downloads/installer/)

---

### Step 2: Initialize Database
Open **MySQL Workbench** or your terminal/command prompt and run the consolidated SQL script:

```bash
# Using MySQL command line:
mysql -u root -p < database/00_full_schema_and_seed.sql
```
*(Or open `database/00_full_schema_and_seed.sql` in MySQL Workbench and click the ⚡ Execute button).*

This script creates:
- `student_db` database
- All 12 tables (`departments`, `courses`, `admins`, `students`, `student_accounts`, `announcements`, `fee_records`, `fee_payments`, `attendance`, `attendance_sessions`, `exams`, `exam_results`)
- Academic departments and courses
- Default Administrator account
- Sample academic announcements

---

### Step 3: Configure Environment
In the root directory of the project:
1. Copy `.env.example` to create `.env`:
   ```bash
   cp .env.example .env
   # On Windows PowerShell:
   # Copy-Item .env.example .env
   ```
2. Open `.env` in any text editor and update your database credentials:
   ```ini
   PORT=3000
   NODE_ENV=development
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password_here
   DB_NAME=student_db
   SESSION_SECRET=a_very_long_random_string_secret_for_sessions_32chars
   ```

---

### Step 4: Install Dependencies & Run Server
Run the following commands in the project root:

```bash
# Install Node dependencies
npm install

# Start the server (with auto-port cleanup on Windows)
npm run start:clean

# Or standard start
npm start
```

You should see:
```text
✅  MySQL connected successfully.
🚀  Server running at http://localhost:3000
    Environment: development
```

---

## 🔑 Default Login Credentials

### 1. Administrator Portal
- **URL:** [http://localhost:3000/login.html](http://localhost:3000/login.html)
- **Username:** `admin`
- **Password:** `Admin@123`

### 2. Student Portal
- **URL:** [http://localhost:3000/student-login.html](http://localhost:3000/student-login.html)
- **Identifier:** Student Registered Email or Roll Number
- **Default Password for enrolled students:** `Student@123`

---

## 🛡️ Key Security Features Implemented
- **CSRF Token Verification:** Automatically requested via `/api/csrf-token` on page load, submitted with all state-changing HTTP operations (`POST`, `PUT`, `DELETE`).
- **Strict Role-Based Access Control:** Students can never access administrative APIs. Requests enforce ownership at the database query level using session IDs.
- **Password Protection:** Encrypted using industry-standard `bcrypt` with salt rounds.
- **Session Fixation Prevention:** Express sessions are regenerated upon login.
- **Rate Limiting:** Prevents brute force password guessing attacks.
