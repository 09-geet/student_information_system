// server/routes/attendance.js
// Attendance Management routes: mark/update attendance, student list by course, reports, and student attendance history.

'use strict';

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const pool = require('../db');

const router = express.Router();

function sendValidationError(res, errors) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: errors.array(),
  });
}

// ---------------------------------------------------------------
// GET /api/attendance/students-for-marking
// Returns students for a course & class, along with any existing marked status for a given date.
// ---------------------------------------------------------------
router.get(
  '/students-for-marking',
  [
    query('course_id').isInt({ min: 1 }).withMessage('Valid course_id is required.'),
    query('date').isISO8601().withMessage('Valid date (YYYY-MM-DD) is required.'),
    query('class_name').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { course_id, date, class_name } = req.query;
    const targetClass = class_name || 'Regular';

    try {
      const [students] = await pool.execute(
        `SELECT 
           s.id AS student_id,
           s.name,
           s.roll_number,
           s.email,
           c.name AS course_name,
           a.id AS attendance_id,
           COALESCE(a.status, 'Present') AS current_status,
           CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS is_marked
         FROM students s
         JOIN courses c ON s.course_id = c.id
         LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
         WHERE s.course_id = ? AND s.status = 'active'
         ORDER BY s.roll_number ASC`,
        [date, course_id]
      );

      res.json({
        success: true,
        data: students,
      });
    } catch (err) {
      console.error('GET /api/attendance/students-for-marking error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch students for attendance.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/attendance/mark
// Mark or update attendance for students on a specific date.
// Uses INSERT ... ON DUPLICATE KEY UPDATE to prevent duplicates and allow updates.
// ---------------------------------------------------------------
router.post(
  '/mark',
  [
    body('course_id').isInt({ min: 1 }).withMessage('Valid course_id is required.'),
    body('class_name').optional().trim(),
    body('date').isISO8601().withMessage('Valid date (YYYY-MM-DD) is required.'),
    body('records').isArray({ min: 1 }).withMessage('Attendance records array is required.'),
    body('records.*.student_id').isInt({ min: 1 }).withMessage('Student ID is required.'),
    body('records.*.status').isIn(['Present', 'Absent']).withMessage('Status must be Present or Absent.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { course_id, date, records } = req.body;
    const className = req.body.class_name ? req.body.class_name.trim() : 'Regular';

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const rec of records) {
        await conn.execute(
          `INSERT INTO attendance (student_id, course_id, class_name, date, status)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             course_id = VALUES(course_id),
             class_name = VALUES(class_name),
             status = VALUES(status),
             updated_at = CURRENT_TIMESTAMP`,
          [rec.student_id, course_id, className, date, rec.status]
        );
      }

      await conn.commit();
      res.json({
        success: true,
        message: `Attendance marked successfully for ${records.length} students on ${date}.`,
      });
    } catch (err) {
      await conn.rollback();
      console.error('POST /api/attendance/mark error:', err);
      res.status(500).json({ success: false, message: 'Failed to save attendance.' });
    } finally {
      conn.release();
    }
  }
);

// ---------------------------------------------------------------
// GET /api/attendance/summary
// Calculates overall attendance metrics for students (optionally filtered by course)
// Computes total_classes, present_days, absent_days, attendance_percentage
// Highlights students below 75%
// ---------------------------------------------------------------
router.get(
  '/summary',
  [
    query('course_id').optional().isInt({ min: 1 }),
    query('search').optional().trim(),
    query('status').optional().isIn(['active', 'inactive', 'graduated', 'all']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const conditions = [];
    const params = [];

    if (req.query.status && req.query.status !== 'all') {
      conditions.push('s.status = ?');
      params.push(req.query.status);
    } else if (!req.query.status) {
      conditions.push("s.status IN ('active', 'inactive')");
    }

    if (req.query.course_id) {
      conditions.push('s.course_id = ?');
      params.push(req.query.course_id);
    }

    if (req.query.search) {
      conditions.push('(s.name LIKE ? OR s.roll_number LIKE ?)');
      const like = `%${req.query.search}%`;
      params.push(like, like);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    try {
      const [rows] = await pool.execute(
        `SELECT 
           s.id AS student_id,
           s.name,
           s.roll_number,
           c.name AS course_name,
           COUNT(a.id) AS total_classes,
           COUNT(CASE WHEN a.status = 'Present' THEN 1 END) AS present_days,
           COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) AS absent_days,
           ROUND(
             CASE 
               WHEN COUNT(a.id) > 0 THEN (COUNT(CASE WHEN a.status = 'Present' THEN 1 END) * 100.0 / COUNT(a.id))
               ELSE 0.00 
             END, 
             2
           ) AS attendance_percentage,
           CASE 
             WHEN COUNT(a.id) > 0 AND (COUNT(CASE WHEN a.status = 'Present' THEN 1 END) * 100.0 / COUNT(a.id)) < 75.00 THEN 1
             ELSE 0
           END AS is_low_attendance
         FROM students s
         JOIN courses c ON s.course_id = c.id
         LEFT JOIN attendance a ON s.id = a.student_id
         ${whereClause}
         GROUP BY s.id, s.name, s.roll_number, c.name
         ORDER BY s.roll_number ASC`,
        params
      );

      res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      console.error('GET /api/attendance/summary error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch attendance summary.' });
    }
  }
);

// ---------------------------------------------------------------
// GET /api/attendance/history/:student_id
// Date-wise attendance history for a specific student
// ---------------------------------------------------------------
router.get(
  '/history/:student_id',
  [param('student_id').isInt({ min: 1 }).withMessage('Valid student ID required.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const studentId = req.params.student_id;

    try {
      const [studentRows] = await pool.execute(
        `SELECT s.id, s.name, s.roll_number, c.name AS course_name
         FROM students s
         JOIN courses c ON s.course_id = c.id
         WHERE s.id = ?`,
        [studentId]
      );

      if (studentRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      const [history] = await pool.execute(
        `SELECT a.id, a.date, a.class_name, a.status, c.name AS course_name
         FROM attendance a
         JOIN courses c ON a.course_id = c.id
         WHERE a.student_id = ?
         ORDER BY a.date DESC, a.id DESC`,
        [studentId]
      );

      const totalClasses = history.length;
      const presentDays = history.filter(h => h.status === 'Present').length;
      const absentDays = history.filter(h => h.status === 'Absent').length;
      const percentage = totalClasses > 0 ? ((presentDays * 100) / totalClasses).toFixed(2) : '0.00';

      res.json({
        success: true,
        student: studentRows[0],
        stats: {
          total_classes: totalClasses,
          present_days: presentDays,
          absent_days: absentDays,
          attendance_percentage: parseFloat(percentage),
          is_low_attendance: totalClasses > 0 && parseFloat(percentage) < 75.0,
        },
        history,
      });
    } catch (err) {
      console.error('GET /api/attendance/history error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch student attendance history.' });
    }
  }
);

// ---------------------------------------------------------------
// GET /api/attendance/report-by-date
// Date-wise attendance report across courses
// ---------------------------------------------------------------
router.get(
  '/report-by-date',
  [
    query('date').isISO8601().withMessage('Valid date (YYYY-MM-DD) is required.'),
    query('course_id').optional().isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { date, course_id } = req.query;
    const conditions = ['a.date = ?'];
    const params = [date];

    if (course_id) {
      conditions.push('a.course_id = ?');
      params.push(course_id);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    try {
      const [rows] = await pool.execute(
        `SELECT 
           a.id,
           a.date,
           a.class_name,
           a.status,
           s.id AS student_id,
           s.name AS student_name,
           s.roll_number,
           c.name AS course_name
         FROM attendance a
         JOIN students s ON a.student_id = s.id
         JOIN courses c ON a.course_id = c.id
         ${whereClause}
         ORDER BY c.name ASC, s.roll_number ASC`,
        params
      );

      const totalMarked = rows.length;
      const presentCount = rows.filter(r => r.status === 'Present').length;
      const absentCount = rows.filter(r => r.status === 'Absent').length;

      res.json({
        success: true,
        date,
        summary: {
          total: totalMarked,
          present: presentCount,
          absent: absentCount,
          present_percentage: totalMarked > 0 ? ((presentCount * 100) / totalMarked).toFixed(2) : '0.00',
        },
        records: rows,
      });
    } catch (err) {
      console.error('GET /api/attendance/report-by-date error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch date-wise attendance report.' });
    }
  }
);

module.exports = router;
