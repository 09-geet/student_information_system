// server/app.js
// Main Express application entry point.
// Loads environment variables, mounts middleware, and registers routes.

'use strict';

require('dotenv').config();

const express      = require('express');
const path         = require('path');
const session      = require('express-session');
const rateLimit    = require('express-rate-limit');

const pool         = require('./db');
const authRoutes       = require('./routes/auth');
const studentRoutes    = require('./routes/students');
const feeRoutes        = require('./routes/fees');
const attendanceRoutes = require('./routes/attendance');

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
  max: 20,                    // max 20 login attempts per 15 min per IP
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
// 4. Auth guard middleware — protects all student API routes
// ---------------------------------------------------------------
function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
}

// ---------------------------------------------------------------
// 5. API routes
// ---------------------------------------------------------------
app.use('/api/auth',       authRoutes);
app.use('/api/students',   requireAuth, studentRoutes);
app.use('/api/fees',       requireAuth, feeRoutes);
app.use('/api/attendance', requireAuth, attendanceRoutes);

// ---------------------------------------------------------------
// 6. Serve static frontend files (disable auto index.html)
// ---------------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

// ---------------------------------------------------------------
// 7. Page routes with authentication protection
// ---------------------------------------------------------------
app.get('/', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  return res.redirect('/login.html');
});

app.get('/dashboard', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  return res.redirect('/login.html');
});

app.get('/login.html', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('*', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// ---------------------------------------------------------------
// 8. Global error handler
// ---------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ---------------------------------------------------------------
// 9. Start server
// ---------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀  Server running at http://localhost:${PORT}`);
  console.log(`    Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
