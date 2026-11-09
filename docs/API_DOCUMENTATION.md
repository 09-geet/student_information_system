# 📡 Student Information System (SIS) — REST API Documentation

This document covers all available HTTP API endpoints in the Student Information System.

---

## 🔒 Security & Common Conventions

- **Session Authentication:** All protected endpoints require a valid session cookie (`sis.sid`).
- **CSRF Protection:** State-changing requests (`POST`, `PUT`, `DELETE`) require a valid `CSRF-Token` header.
  - To obtain a token: `GET /api/csrf-token`
- **Rate Limiting:**
  - Standard API: 200 requests / minute per IP.
  - Login endpoints: 20 attempts / 15 minutes per IP.

---

## 1. Authentication APIs (`/api/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/csrf-token` | Public | Returns `{ csrfToken: string }` and creates session |
| `POST` | `/api/auth/login` | Public | Administrator login (username & password) |
| `POST` | `/api/auth/student/login` | Public | Student portal login (email or roll number & password) |
| `POST` | `/api/auth/logout` | Authenticated | Destroys current session and clears cookie |
| `GET` | `/api/auth/me` | Public/Auth | Checks login status and returns current user info |
| `GET` | `/api/auth/student/me` | Student | Checks student portal auth status |

---

## 2. Student Management APIs (`/api/students`)
*Requires Admin Authentication*

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/students` | Get paginated list of students (`?page=1&limit=15&search=&department_id=&status=`) |
| `GET` | `/api/students/stats` | Get dashboard summary metrics (total, active, inactive, graduated) |
| `GET` | `/api/students/departments`| Get list of departments for dropdowns |
| `GET` | `/api/students/courses` | Get list of courses for dropdowns (`?department_id=`) |
| `GET` | `/api/students/:id` | Get details of a single student |
| `POST` | `/api/students` | Create new student profile (automatically creates fee record & portal account) |
| `PUT` | `/api/students/:id` | Update student profile |
| `DELETE` | `/api/students/:id` | Delete student profile and associated cascaded records |

---

## 3. Fee Management APIs (`/api/fees`)
*Requires Admin Authentication*

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/fees` | Get paginated student fee ledger list with balance & payment status |
| `GET` | `/api/fees/stats` | Get overall fee analytics (total fee, collected, pending, unpaid count) |
| `GET` | `/api/fees/:studentId` | Get fee summary and transaction history for a specific student |
| `PUT` | `/api/fees/:studentId/total` | Update the total fee assigned to a student |
| `POST` | `/api/fees/:studentId/payments` | Record a fee payment transaction (Cash, UPI, Card, Net Banking, Cheque) |

---

## 4. Attendance Management APIs (`/api/attendance`)
*Requires Admin Authentication*

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/attendance/marking-list` | Get students enrolled in a course to mark attendance (`?course_id=&date=&class_name=`) |
| `POST` | `/api/attendance/mark` | Batch mark attendance entries (`records: [{ student_id, status }]`) |
| `GET` | `/api/attendance/summary` | Get student attendance percentage summary (`<75%` alert) |
| `GET` | `/api/attendance/student/:id` | Get attendance history for a specific student |
| `GET` | `/api/attendance/date-report` | Daily attendance statistics breakdown across courses |

---

## 5. QR Code Attendance Sessions (`/api/attendance-sessions`)
*Requires Admin Authentication*

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/attendance-sessions` | Create a new temporary QR attendance session |
| `GET` | `/api/attendance-sessions/:id/qr` | Get generated QR code image for classroom display |
| `POST` | `/api/attendance-sessions/:token/close` | Close an active attendance session |

---

## 6. Examination & Results APIs (`/api/exams`)
*Requires Admin Authentication*

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/exams` | List exams with filters |
| `POST` | `/api/exams` | Schedule a new exam |
| `GET` | `/api/exams/:id` | Get exam details and enrolled students list |
| `POST` | `/api/exams/:id/results` | Save / publish marks obtained for students |

---

## 7. Student Portal APIs (`/api/student`)
*Requires Student Authentication (Access strictly isolated to logged-in student)*

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/student/me` | Academic profile details of logged-in student |
| `GET` | `/api/student/attendance` | Attendance summary percentage and class attendance logs |
| `GET` | `/api/student/fees` | Fee ledger, remaining balance, and itemized receipt transactions |
| `GET` | `/api/student/notifications` | Announcements targeted to student's department/course or all |
| `POST` | `/api/student/change-password` | Self-service password change |
