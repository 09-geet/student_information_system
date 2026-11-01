// server/routes/attendanceSessions.js
// QR‑code attendance session routes

'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../db');
const crypto = require('crypto');

const router = express.Router();

function sendValidationError(res, errors) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: errors.array(),
  });
}

// Middleware to require admin authentication – re‑use same guard from app.js
// We will import it from a shared module to avoid duplication.
// For simplicity, we expect the router to be mounted after the admin guard.

// ---------------------------------------------------------------
// POST /api/attendance/sessions
// Create a new QR attendance session (admin only)
// ---------------------------------------------------------------
router.post(
  '/sessions',
  [
    body('course_id').isInt({ min: 1 }).withMessage('Valid course_id required.'),
    body('class_name').optional().trim(),
    body('expires_in_minutes').isInt({ min: 1 }).withMessage('Expiration time required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { course_id, class_name, expires_in_minutes } = req.body;
    const className = class_name ? class_name.trim() : 'Regular';
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + expires_in_minutes * 60 * 1000);
    const created_by = req.session.adminId;

    try {
      const [result] = await pool.execute(
        `INSERT INTO attendance_sessions (course_id, class_name, token, expires_at, created_by)
         VALUES (?,?,?,?,?)`,
        [course_id, className, token, expires_at, created_by]
      );
      const sessionId = result.insertId;
      res.json({ success: true, data: { sessionId, token, expires_at } });
    } catch (err) {
      console.error('POST /attendance/sessions error:', err);
      res.status(500).json({ success: false, message: 'Failed to create attendance session.' });
    }
  }
);

// ---------------------------------------------------------------
// GET /api/attendance/sessions/:id
// Retrieve session details (admin only)
// ---------------------------------------------------------------
router.get(
  '/sessions/:id',
  [param('id').isInt({ min: 1 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);
    const sessionId = req.params.id;
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM attendance_sessions WHERE id = ?`,
        [sessionId]
      );
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Session not found.' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error('GET /attendance/sessions/:id error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch session.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/attendance/scan
// Student scans QR and records attendance for the session date.
// ---------------------------------------------------------------
router.post(
  '/scan',
  [
    body('token').isLength({ min: 1 }).withMessage('Token required.'),
    body('date').isISO8601().withMessage('Valid date required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { token, date } = req.body;
    const studentId = req.session.studentId;
    if (!studentId) return res.status(401).json({ success: false, message: 'Student not authenticated.' });

    try {
      // Verify token and retrieve session
      const [sessionRows] = await pool.execute(
        `SELECT * FROM attendance_sessions WHERE token = ? AND status = 'open' AND expires_at > NOW()`,
        [token]
      );
      if (sessionRows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
      }
      const session = sessionRows[0];

      // Use INSERT ... ON DUPLICATE KEY to avoid duplicate attendance for same student/date
      await pool.execute(
        `INSERT INTO attendance (student_id, course_id, class_name, date, status)
         VALUES (?,?,?,?, 'Present')
         ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at = CURRENT_TIMESTAMP`,
        [studentId, session.course_id, session.class_name, date]
      );

      res.json({ success: true, message: 'Attendance recorded.' });
    } catch (err) {
      console.error('POST /attendance/scan error:', err);
      res.status(500).json({ success: false, message: 'Failed to record attendance.' });
    }
  }
);

module.exports = router;
