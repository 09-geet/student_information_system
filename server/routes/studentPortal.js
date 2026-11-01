// server/routes/studentPortal.js
// Dedicated backend routes for the authenticated student portal.
// All endpoints derive identity STRICTLY from req.session.studentId — never from client parameters.

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
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
// GET /api/student/me  — Student profile and academic details
// ---------------------------------------------------------------
router.get('/me', async (req, res) => {
  const studentId = req.session.studentId;

  try {
    const [rows] = await pool.execute(
      `SELECT 
         s.id,
         s.name,
         s.roll_number,
         s.email,
         s.phone,
         s.admission_date,
         s.status,
         c.id AS course_id,
         c.name AS course_name,
         c.code AS course_code,
         c.duration_years,
         d.id AS department_id,
         d.name AS department_name,
         d.code AS department_code,
         sa.last_login,
         sa.created_at AS account_created_at
       FROM students s
       JOIN courses c ON s.course_id = c.id
       JOIN departments d ON s.department_id = d.id
       LEFT JOIN student_accounts sa ON sa.student_id = s.id
       WHERE s.id = ?`,
      [studentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student profile not found.' });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error('GET /api/student/me error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch student profile.' });
  }
});

// ---------------------------------------------------------------
// GET /api/student/attendance  — Student's attendance summary and history
// ---------------------------------------------------------------
router.get('/attendance', async (req, res) => {
  const studentId = req.session.studentId;

  try {
    // 1. Calculate overall summary
    const [summaryRows] = await pool.execute(
      `SELECT 
         COUNT(a.id) AS total_classes,
         COUNT(CASE WHEN a.status = 'Present' THEN 1 END) AS present_days,
         COUNT(CASE WHEN a.status = 'Absent' THEN 1 END) AS absent_days,
         ROUND(
           CASE 
             WHEN COUNT(a.id) > 0 THEN (COUNT(CASE WHEN a.status = 'Present' THEN 1 END) * 100.0 / COUNT(a.id))
             ELSE 0.00 
           END, 
           2
         ) AS attendance_percentage
       FROM students s
       LEFT JOIN attendance a ON s.id = a.student_id
       WHERE s.id = ?
       GROUP BY s.id`,
      [studentId]
    );

    const stats = summaryRows.length > 0
      ? summaryRows[0]
      : { total_classes: 0, present_days: 0, absent_days: 0, attendance_percentage: 0.0 };

    const percentage = parseFloat(stats.attendance_percentage || 0);
    const isLowAttendance = stats.total_classes > 0 && percentage < 75.0;

    // 2. Fetch full attendance records list
    const [history] = await pool.execute(
      `SELECT 
         a.id,
         a.date,
         a.class_name,
         a.status,
         c.name AS course_name
       FROM attendance a
       JOIN courses c ON a.course_id = c.id
       WHERE a.student_id = ?
       ORDER BY a.date DESC, a.id DESC`,
      [studentId]
    );

    res.json({
      success: true,
      data: {
        summary: {
          total_classes:         Number(stats.total_classes),
          present_days:          Number(stats.present_days),
          absent_days:           Number(stats.absent_days),
          attendance_percentage: percentage,
          is_low_attendance:     isLowAttendance,
        },
        history,
      },
    });
  } catch (err) {
    console.error('GET /api/student/attendance error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance data.' });
  }
});

// ---------------------------------------------------------------
// GET /api/student/fees  — Student's fee ledger and payment history
// ---------------------------------------------------------------
router.get('/fees', async (req, res) => {
  const studentId = req.session.studentId;

  try {
    // 1. Fetch fee record
    const [feeRows] = await pool.execute(
      `SELECT 
         COALESCE(fr.total_fee, 0.00) AS total_fee,
         COALESCE(fr.paid_amount, 0.00) AS paid_amount,
         COALESCE(fr.remaining_balance, 0.00) AS remaining_balance,
         COALESCE(fr.fee_status, 'Unpaid') AS fee_status,
         fr.updated_at AS last_updated
       FROM students s
       LEFT JOIN fee_records fr ON s.id = fr.student_id
       WHERE s.id = ?`,
      [studentId]
    );

    const feeInfo = feeRows.length > 0 ? feeRows[0] : {
      total_fee: 0.00,
      paid_amount: 0.00,
      remaining_balance: 0.00,
      fee_status: 'Unpaid',
      last_updated: null,
    };

    // 2. Fetch payments history
    const [payments] = await pool.execute(
      `SELECT 
         id,
         amount,
         payment_date,
         payment_method,
         remarks,
         created_at
       FROM fee_payments
       WHERE student_id = ?
       ORDER BY payment_date DESC, id DESC`,
      [studentId]
    );

    res.json({
      success: true,
      data: {
        ledger: {
          total_fee:         Number(feeInfo.total_fee),
          paid_amount:       Number(feeInfo.paid_amount),
          remaining_balance: Number(feeInfo.remaining_balance),
          fee_status:        feeInfo.fee_status,
          last_updated:      feeInfo.last_updated,
        },
        payments,
      },
    });
  } catch (err) {
    console.error('GET /api/student/fees error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch fee data.' });
  }
});

// ---------------------------------------------------------------
// GET /api/student/notifications  — Relevant notices & announcements
// ---------------------------------------------------------------
router.get('/notifications', async (req, res) => {
  const studentId = req.session.studentId;

  try {
    // Get student's department and course to filter targeted notices
    const [studentRows] = await pool.execute(
      'SELECT course_id, department_id FROM students WHERE id = ?',
      [studentId]
    );

    if (studentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student record not found.' });
    }

    const { course_id, department_id } = studentRows[0];

    const [announcements] = await pool.execute(
      `SELECT 
         a.id,
         a.title,
         a.message,
         a.created_at,
         d.name AS department_name,
         c.name AS course_name
       FROM announcements a
       LEFT JOIN departments d ON a.target_department_id = d.id
       LEFT JOIN courses c ON a.target_course_id = c.id
       WHERE 
         (a.target_department_id IS NULL OR a.target_department_id = ?)
         AND (a.target_course_id IS NULL OR a.target_course_id = ?)
       ORDER BY a.created_at DESC
       LIMIT 20`,
      [department_id, course_id]
    );

    res.json({
      success: true,
      data: announcements,
    });
  } catch (err) {
    console.error('GET /api/student/notifications error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch announcements.' });
  }
});

// ---------------------------------------------------------------
// GET /api/student/results  — Exam results (empty state contract)
// ---------------------------------------------------------------
router.get('/results', async (req, res) => {
  res.json({
    success: true,
    hasResults: false,
    message: 'Examination results and semester marksheets have not been published yet for your class.',
    data: [],
  });
});

// ---------------------------------------------------------------
// POST /api/student/change-password  — Self password change
// ---------------------------------------------------------------
router.post(
  '/change-password',
  [
    body('current_password').notEmpty().withMessage('Current password is required.'),
    body('new_password')
      .isLength({ min: 8 }).withMessage('New password must be at least 8 characters long.')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must include uppercase, lowercase, and numbers.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const studentId = req.session.studentId;
    const { current_password, new_password } = req.body;

    try {
      const [rows] = await pool.execute(
        'SELECT id, password_hash FROM student_accounts WHERE student_id = ?',
        [studentId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student account not found.' });
      }

      const account = rows[0];
      const isMatch = await bcrypt.compare(current_password, account.password_hash);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password does not match.' });
      }

      // Hash new password
      const newHash = await bcrypt.hash(new_password, 12);

      await pool.execute(
        'UPDATE student_accounts SET password_hash = ?, must_change_password = 0, updated_at = NOW() WHERE id = ?',
        [newHash, account.id]
      );

      res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
      console.error('POST /api/student/change-password error:', err);
      res.status(500).json({ success: false, message: 'Failed to change password.' });
    }
  }
);

module.exports = router;
