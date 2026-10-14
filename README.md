# 🎓 Student Information System

A full-stack Student Information System built with **Node.js**, **Express**, **MySQL**, and **Vanilla JavaScript**.

---

## 🚀 Features

### Core Student Management
- 🔐 **Secure Admin Login** — bcrypt-hashed passwords, session cookies, rate limiting
- 📊 **Admin Dashboard** — student metrics + fee summary overview cards
- ➕ **Add Student** — client and server validated form with departments and courses
- 📋 **Student Records Table** — paginated, searchable, filterable by department and status
- ✏️ **Edit & Delete Student** — safe updating and deletion with confirmation modals

### 1. Fee Management Module (New)
- 💳 **Student Fee Tracking** — stores total fee, paid amount, remaining balance, and status (`Paid`, `Partial`, `Unpaid`)
- 🧮 **Automatic Calculations** — `remaining balance = total fee - paid amount`; status updates automatically
- 🔍 **Search & Filter** — live search by student name, roll number, or email; filters for `Paid`, `Partial`, and `Unpaid`
- 💵 **Record Payments** — record payments with date, amount, payment method (Cash, UPI, Card, Net Banking, Cheque), and remarks
- 📜 **Payment History** — modal showing full transaction logs per student
- 📊 **Dashboard Cards** — Total Fees, Fees Collected, Pending Fees, and Students with Unpaid Fees

### 2. Attendance Management Module (New)
- 📅 **Batch Marking** — select Course, Class/Batch, and Date; mark students as `Present` or `Absent`
- ⚡ **Duplicate Prevention** — unique composite key `(student_id, date)` allows updating attendance without duplicates
- 📈 **Percentage Calculation** — automatically computes total classes, present days, absent days, and attendance %
- ⚠️ **Low Attendance Warning** — students with attendance **below 75%** are highlighted with red alerts
- 📜 **Student Attendance History** — individual attendance logs across dates and classes
- 📊 **Date-wise Reports** — view daily attendance breakdown across all enrolled courses

---

## 🗄️ Database Schema & Migration

### Existing vs New Tables
1. `departments` & `courses` — academic structure
2. `admins` — system credentials with bcrypt
3. `students` — student profiles
4. `fee_records` *(New)* — stores `total_fee`, `paid_amount`, `remaining_balance`, `fee_status` linked to `students.id`
5. `fee_payments` *(New)* — records payment transactions (`amount`, `payment_date`, `payment_method`, `remarks`)
6. `attendance` *(New)* — records attendance entries (`student_id`, `course_id`, `class_name`, `date`, `status`) with `UNIQUE (student_id, date)`

### Running the Migration (For existing database)
If you already have `student_db`, apply the migration SQL:
```powershell
Get-Content database\migration_v2.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```
*(Or open `database/migration_v2.sql` in MySQL Workbench and run it).*

For a brand-new installation, `database/schema.sql` contains the complete schema and seed data.

---

## 🛠️ How to Run

### 1. Environment Configuration
Ensure `.env` contains your MySQL credentials:
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=student_db
SESSION_SECRET=your_secret_key_at_least_32_characters
```

### 2. Start the Server
```bash
npm start
```
Or with auto-reload:
```bash
npm run dev
```

### 3. Open in Browser
Visit **[http://localhost:3000](http://localhost:3000)**

**Default Credentials:**
- Username: `admin`
- Password: `Admin@123`

---

## 📡 REST API Reference

### Student APIs
- `GET /api/students` — list with pagination, search & filters
- `GET /api/students/stats` — overall counts
- `GET /api/students/:id` — get single student
- `POST /api/students` — create student
- `PUT /api/students/:id` — update student
- `DELETE /api/students/:id` — delete student
- `GET /api/students/departments` — departments list
- `GET /api/students/courses` — courses list

### Fee APIs (`/api/fees`)
- `GET /api/fees/stats` — Total Fees, Collected, Pending, Unpaid Students count
- `GET /api/fees` — Searchable & filterable student fees
- `POST /api/fees/set-total` — Set or update total fee for a student
- `POST /api/fees/payment` — Record a payment (recalculates balance & status)
- `GET /api/fees/history/:student_id` — Student transaction history

### Attendance APIs (`/api/attendance`)
- `GET /api/attendance/students-for-marking?course_id=X&date=YYYY-MM-DD` — Retrieve students and existing status
- `POST /api/attendance/mark` — Batch mark or update attendance
- `GET /api/attendance/summary` — Student stats (total, present, absent, %, <75% alert)
- `GET /api/attendance/history/:student_id` — Date-wise history for a student
- `GET /api/attendance/report-by-date?date=YYYY-MM-DD` — Date-wise attendance report
