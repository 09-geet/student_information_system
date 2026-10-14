// server/routes/auth.js
// Handles admin login and logout using bcrypt password verification.

'use strict';

const express   = require('express');
const bcrypt    = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool      = require('../db');

const router = express.Router();

// ---------------------------------------------------------------
// POST /api/auth/login
// Validates credentials, creates a session on success.
// ---------------------------------------------------------------
router.post(
  '/login',
  [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required.')
      .isLength({ max: 50 }).withMessage('Username too long.'),
    body('password')
      .notEmpty().withMessage('Password is required.')
      .isLength({ max: 128 }).withMessage('Password too long.'),
  ],
  async (req, res) => {
    // 1. Validate inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      // 2. Fetch the admin row (parameterized query — no SQL injection risk)
      const [rows] = await pool.execute(
        'SELECT id, username, email, password_hash, full_name FROM admins WHERE username = ?',
        [username]
      );

      if (rows.length === 0) {
        // Use a generic message to avoid leaking whether the username exists
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      const admin = rows[0];

      // 3. Compare the provided password with the stored bcrypt hash
      const isMatch = await bcrypt.compare(password, admin.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      // 4. Update last_login timestamp
      await pool.execute(
        'UPDATE admins SET last_login = NOW() WHERE id = ?',
        [admin.id]
      );

      // 5. Create the session
      req.session.adminId   = admin.id;
      req.session.username  = admin.username;
      req.session.fullName  = admin.full_name;

      return res.json({
        success:  true,
        message:  'Login successful.',
        admin: {
          id:       admin.id,
          username: admin.username,
          fullName: admin.full_name,
          email:    admin.email,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/auth/logout
// Destroys the session.
// ---------------------------------------------------------------
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed.' });
    }
    res.clearCookie('sis.sid');
    return res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// ---------------------------------------------------------------
// GET /api/auth/me
// Returns session info if logged in (used by frontend to check auth).
// ---------------------------------------------------------------
router.get('/me', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({
      loggedIn: true,
      admin: {
        id:       req.session.adminId,
        username: req.session.username,
        fullName: req.session.fullName,
      },
    });
  }
  return res.json({ loggedIn: false });
});

module.exports = router;
