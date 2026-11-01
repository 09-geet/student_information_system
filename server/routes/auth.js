// server/routes/auth.js
// Handles authentication for both administrators and students.
// Uses bcrypt for secure password hashing and express-session for session management.

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../db');

const router = express.Router();

// Helper: send validation error response
function sendValidationError(res, errors) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: errors.array(),
  });
}

// ---------------------------------------------------------------
// POST /api/auth/login  — Administrator Login
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { username, password } = req.body;

    try {
      const [rows] = await pool.execute(
        'SELECT id, username, email, password_hash, full_name FROM admins WHERE username = ?',
        [username]
      );

      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      const admin = rows[0];
      const isMatch = await bcrypt.compare(password, admin.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      // Update last login
      await pool.execute('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regenerate error:', err);
          return res.status(500).json({ success: false, message: 'Session creation failed.' });
        }

        req.session.adminId  = admin.id;
        req.session.username = admin.username;
        req.session.fullName = admin.full_name;
        req.session.role     = 'admin';

        return res.json({
          success: true,
          message: 'Login successful.',
          role: 'admin',
          admin: {
            id:       admin.id,
            username: admin.username,
            fullName: admin.full_name,
            email:    admin.email,
          },
        });
      });
    } catch (err) {
      console.error('Admin login error:', err);
      return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/auth/student/login  — Student Portal Login
// Supports login via registered email OR roll number / student ID
// ---------------------------------------------------------------
router.post(
  '/student/login',
  [
    body('identifier')
      .trim()
      .notEmpty().withMessage('Email or Roll Number is required.')
      .isLength({ max: 150 }).withMessage('Identifier too long.'),
    body('password')
      .notEmpty().withMessage('Password is required.')
      .isLength({ max: 128 }).withMessage('Password too long.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { identifier, password } = req.body;

    try {
      const [rows] = await pool.execute(
        `SELECT 
           sa.id AS account_id,
           sa.student_id,
           sa.password_hash,
           sa.is_active,
           sa.must_change_password,
           s.id,
           s.name,
           s.roll_number,
           s.email,
           s.phone,
           s.status AS student_status,
           c.name AS course_name,
           d.name AS department_name
         FROM student_accounts sa
         JOIN students s ON sa.student_id = s.id
         JOIN courses c ON s.course_id = c.id
         JOIN departments d ON s.department_id = d.id
         WHERE (LOWER(s.email) = LOWER(?) OR s.roll_number = ?)`,
        [identifier, identifier]
      );

      if (rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials. Please check your email or roll number and password.',
        });
      }

      const account = rows[0];

      // Check if account is active
      if (!account.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Your student portal account has been deactivated. Please contact the administrator.',
        });
      }

      // Check student enrollment status
      if (account.student_status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: 'Your student enrollment status is currently marked as inactive. Please contact administration.',
        });
      }

      // Compare password
      const isMatch = await bcrypt.compare(password, account.password_hash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials. Please check your email or roll number and password.',
        });
      }

      // Update last login timestamp
      await pool.execute('UPDATE student_accounts SET last_login = NOW() WHERE id = ?', [account.account_id]);

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regenerate error:', err);
          return res.status(500).json({ success: false, message: 'Session creation failed.' });
        }

        req.session.studentId        = account.id;
        req.session.studentAccountId = account.account_id;
        req.session.role             = 'student';
        req.session.studentName      = account.name;
        req.session.rollNumber       = account.roll_number;
        req.session.email            = account.email;

        return res.json({
          success: true,
          message: 'Student login successful.',
          role: 'student',
          student: {
            id:                 account.id,
            name:               account.name,
            rollNumber:         account.roll_number,
            email:              account.email,
            courseName:         account.course_name,
            departmentName:     account.department_name,
            mustChangePassword: Boolean(account.must_change_password),
          },
        });
      });
    } catch (err) {
      console.error('Student login error:', err);
      return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/auth/logout  — Logout for both admin and student
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
// GET /api/auth/me  — General auth status check
// ---------------------------------------------------------------
router.get('/me', (req, res) => {
  if (req.session && req.session.role === 'admin' && req.session.adminId) {
    return res.json({
      loggedIn: true,
      role: 'admin',
      admin: {
        id:       req.session.adminId,
        username: req.session.username,
        fullName: req.session.fullName,
      },
    });
  }

  if (req.session && req.session.role === 'student' && req.session.studentId) {
    return res.json({
      loggedIn: true,
      role: 'student',
      student: {
        id:         req.session.studentId,
        name:       req.session.studentName,
        rollNumber: req.session.rollNumber,
        email:      req.session.email,
      },
    });
  }

  return res.json({ loggedIn: false });
});

// ---------------------------------------------------------------
// GET /api/auth/student/me  — Student-specific auth check
// ---------------------------------------------------------------
router.get('/student/me', (req, res) => {
  if (req.session && req.session.role === 'student' && req.session.studentId) {
    return res.json({
      loggedIn: true,
      role: 'student',
      student: {
        id:         req.session.studentId,
        name:       req.session.studentName,
        rollNumber: req.session.rollNumber,
        email:      req.session.email,
      },
    });
  }
  return res.json({ loggedIn: false });
});

module.exports = router;
