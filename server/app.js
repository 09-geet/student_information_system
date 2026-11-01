// server/app.js
// Main Express application entry point.
// Loads environment variables, mounts middleware, and registers routes.

'use strict';

require('dotenv').config();

const express          = require('express');
const csurf = require('csurf');
const path             = require('path');
const session          = require('express-session');
const rateLimit        = require('express-rate-limit');

const pool             = require('./db');
const authRoutes       = require('./routes/auth');
const studentRoutes    = require('./routes/students');
const feeRoutes        = require('./routes/fees');
const attendanceRoutes = require('./routes/attendance');
const studentPortalRoutes = require('./routes/studentPortal');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---------------------------------------------------------------
// 1. Parse JSON & URL-encoded bodies
// ---------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------
// 2. Rate limiting — prevents brute-force attacks
// ---------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 20, // relaxed during automated test runs
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute window
  max: 200,             // 200 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/student/login', loginLimiter);

// ---------------------------------------------------------------
// 3. Session middleware
// ---------------------------------------------------------------
app.use(
  session({
    secret:            process.env.SESSION_SECRET || 'change_me_in_production',
    name:              'sis.sid',
    resave:            false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,          // Prevents JS access to the cookie
      secure:   process.env.NODE_ENV === 'production', // HTTPS only in production
      maxAge:   8 * 60 * 60 * 1000, // 8-hour session
      sameSite: 'lax',
    },
  })
);

// ---------------------------------------------------------------
// 4. Role-Based Auth Guard Middlewares
// ---------------------------------------------------------------

// Protects Admin-only API routes
function requireAdminAuth(req, res, next) {
  if (req.session && req.session.role === 'admin' && req.session.adminId) {
    return next();
  }
  if (req.session && req.session.role === 'student') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin privileges required.' });
  }
  return res.status(401).json({ success: false, message: 'Unauthorized. Please log in as administrator.' });
}

// Protects Student Portal API routes
async function requireStudentAuth(req, res, next) {
  if (req.session && req.session.role === 'student' && req.session.studentId) {
    try {
      // Real-time verification: check if account was deactivated by admin
      const [rows] = await pool.execute(
        'SELECT is_active FROM student_accounts WHERE student_id = ?',
        [req.session.studentId]
      );
      if (rows.length === 0 || !rows[0].is_active) {
        req.session.destroy(() => {});
        res.clearCookie('sis.sid');
        return res.status(403).json({
          success: false,
          message: 'Your student account has been deactivated by the administrator.',
        });
      }
      return next();
    } catch (err) {
      console.error('requireStudentAuth DB error:', err);
      return res.status(500).json({ success: false, message: 'Authentication verification failed.' });
    }
  }

  if (req.session && req.session.role === 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Student portal account required.' });
  }
  return res.status(401).json({ success: false, message: 'Unauthorized. Please log in to student portal.' });
}

// ---------------------------------------------------------------
// 5. CSRF protection
// ---------------------------------------------------------------
// csurf middleware — applies to ALL requests so that req.csrfToken()
// is available on GETs (for the token endpoint) and validation
// happens automatically on POST/PUT/PATCH/DELETE.
const csrfProtection = csurf({ cookie: false });
app.use(csrfProtection);

// Endpoint to provide a CSRF token for the current session.
// The browser must call this (GET) before any state-changing request.
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// ---------------------------------------------------------------
// 6. API routes
// ---------------------------------------------------------------
app.use('/api/auth',                 authRoutes);
app.use('/api/students',             requireAdminAuth, studentRoutes);
app.use('/api/fees',                 requireAdminAuth, feeRoutes);
app.use('/api/attendance',           requireAdminAuth, attendanceRoutes);
app.use('/api/attendance-sessions',  requireAdminAuth, require('./routes/attendanceSessions'));
app.use('/api/exams',                requireAdminAuth, require('./routes/exams'));
app.use('/api/student',              requireStudentAuth, studentPortalRoutes);

// ---------------------------------------------------------------
// 6. Serve static frontend files (disable auto index.html)
// ---------------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

// ---------------------------------------------------------------
// 7. Page routes with role-aware redirection
// ---------------------------------------------------------------
app.get('/', (req, res) => {
  if (req.session && req.session.role === 'admin' && req.session.adminId) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  if (req.session && req.session.role === 'student' && req.session.studentId) {
    return res.redirect('/student-dashboard.html');
  }
  return res.redirect('/login.html');
});

app.get('/dashboard', (req, res) => {
  if (req.session && req.session.role === 'admin' && req.session.adminId) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  if (req.session && req.session.role === 'student' && req.session.studentId) {
    return res.redirect('/student-dashboard.html');
  }
  return res.redirect('/login.html');
});

app.get('/student-dashboard', (req, res) => {
  res.redirect('/student-dashboard.html');
});

app.get('/student-dashboard.html', (req, res) => {
  if (req.session && req.session.role === 'student' && req.session.studentId) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'student-dashboard.html'));
  }
  if (req.session && req.session.role === 'admin') {
    return res.redirect('/dashboard');
  }
  return res.redirect('/student-login.html');
});

app.get('/student-login', (req, res) => {
  res.redirect('/student-login.html');
});

app.get('/student-login.html', (req, res) => {
  if (req.session && req.session.role === 'student' && req.session.studentId) {
    return res.redirect('/student-dashboard.html');
  }
  if (req.session && req.session.role === 'admin') {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'student-login.html'));
});

app.get('/login.html', (req, res) => {
  if (req.session && req.session.role === 'admin' && req.session.adminId) {
    return res.redirect('/dashboard');
  }
  if (req.session && req.session.role === 'student' && req.session.studentId) {
    return res.redirect('/student-dashboard.html');
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('*', (req, res) => {
  if (req.session && req.session.role === 'admin') {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  if (req.session && req.session.role === 'student') {
    return res.sendFile(path.join(__dirname, '..', 'public', 'student-dashboard.html'));
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// ---------------------------------------------------------------
// 8. CSRF error handler — must come before the generic handler
// ---------------------------------------------------------------
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
    });
  }
  next(err);
});

// ---------------------------------------------------------------
// 9. Global error handler
// ---------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ---------------------------------------------------------------
// 10. Start server
// ---------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀  Server running at http://localhost:${PORT}`);
  console.log(`    Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
