// server/routes/fees.js
// Fee Management routes: overview stats, list students with fees, update total fee, record payments, payment history.

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
// GET /api/fees/stats
// Dashboard stats: Total Fees, Fees Collected, Pending Fees, Students with Unpaid Fees
// ---------------------------------------------------------------
router.get('/stats', async (_req, res) => {
  try {
    const [[stats]] = await pool.execute(`
      SELECT 
        COALESCE(SUM(fr.total_fee), 0) AS total_fees,
        COALESCE(SUM(fr.paid_amount), 0) AS fees_collected,
        COALESCE(SUM(fr.remaining_balance), 0) AS pending_fees,
        COUNT(CASE WHEN COALESCE(fr.fee_status, 'Unpaid') IN ('Unpaid', 'Partial') THEN 1 END) AS students_unpaid
      FROM students s
      LEFT JOIN fee_records fr ON s.id = fr.student_id
      WHERE s.status = 'active'
    `);

    res.json({
      success: true,
      data: {
        total_fees: Number(stats.total_fees || 0),
        fees_collected: Number(stats.fees_collected || 0),
        pending_fees: Number(stats.pending_fees || 0),
        students_unpaid: Number(stats.students_unpaid || 0),
      },
    });
  } catch (err) {
    console.error('GET /api/fees/stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch fee statistics.' });
  }
});

// ---------------------------------------------------------------
// GET /api/fees
// Searchable & filterable student fee records (with pagination)
// ---------------------------------------------------------------
router.get(
  '/',
  [
    query('search').optional().trim().isLength({ max: 100 }),
    query('status').optional().isIn(['Paid', 'Partial', 'Unpaid']),
    query('department_id').optional().isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (req.query.search) {
      conditions.push('(s.name LIKE ? OR s.roll_number LIKE ? OR s.email LIKE ?)');
      const like = `%${req.query.search}%`;
      params.push(like, like, like);
    }

    if (req.query.status) {
      conditions.push('COALESCE(fr.fee_status, "Unpaid") = ?');
      params.push(req.query.status);
    }

    if (req.query.department_id) {
      conditions.push('s.department_id = ?');
      params.push(req.query.department_id);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    try {
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM students s
         LEFT JOIN fee_records fr ON s.id = fr.student_id
         JOIN courses c ON s.course_id = c.id
         JOIN departments d ON s.department_id = d.id
         ${whereClause}`,
        params
      );

      const total = countRows[0].total;

      const [rows] = await pool.execute(
        `SELECT 
           s.id AS student_id,
           s.name,
           s.roll_number,
           s.email,
           c.name AS course_name,
           d.name AS department_name,
           COALESCE(fr.id, NULL) AS fee_record_id,
           COALESCE(fr.total_fee, 0.00) AS total_fee,
           COALESCE(fr.paid_amount, 0.00) AS paid_amount,
           COALESCE(fr.remaining_balance, 0.00) AS remaining_balance,
           COALESCE(fr.fee_status, 'Unpaid') AS fee_status,
           (SELECT MAX(fp.payment_date) FROM fee_payments fp WHERE fp.student_id = s.id) AS last_payment_date,
           (SELECT fp.payment_method FROM fee_payments fp WHERE fp.student_id = s.id ORDER BY fp.id DESC LIMIT 1) AS last_payment_method
         FROM students s
         LEFT JOIN fee_records fr ON s.id = fr.student_id
         JOIN courses c ON s.course_id = c.id
         JOIN departments d ON s.department_id = d.id
         ${whereClause}
         ORDER BY s.roll_number ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        data: rows,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      console.error('GET /api/fees error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch fee records.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/fees/set-total
// Set or update the total fee for a student
// ---------------------------------------------------------------
router.post(
  '/set-total',
  [
    body('student_id').isInt({ min: 1 }).withMessage('Valid student ID required.'),
    body('total_fee').isFloat({ min: 0 }).withMessage('Total fee must be a non-negative number.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { student_id, total_fee } = req.body;
    const total = parseFloat(total_fee);

    try {
      const [existing] = await pool.execute(
        'SELECT id, paid_amount FROM fee_records WHERE student_id = ?',
        [student_id]
      );

      let paid = 0;
      if (existing.length > 0) {
        paid = parseFloat(existing[0].paid_amount);
      }

      const remaining = Math.max(0, total - paid);
      let status = 'Unpaid';
      if (paid >= total && total > 0) {
        status = 'Paid';
      } else if (paid > 0) {
        status = 'Partial';
      }

      if (existing.length > 0) {
        await pool.execute(
          'UPDATE fee_records SET total_fee = ?, remaining_balance = ?, fee_status = ? WHERE student_id = ?',
          [total, remaining, status, student_id]
        );
      } else {
        await pool.execute(
          'INSERT INTO fee_records (student_id, total_fee, paid_amount, remaining_balance, fee_status) VALUES (?, ?, ?, ?, ?)',
          [student_id, total, paid, remaining, status]
        );
      }

      res.json({ success: true, message: 'Total fee updated successfully.' });
    } catch (err) {
      console.error('POST /api/fees/set-total error:', err);
      res.status(500).json({ success: false, message: 'Failed to update total fee.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/fees/payment
// Record a fee payment for a student
// Automatically calculates remaining balance = total fee - paid amount
// and sets fee status (Paid, Partial, Unpaid)
// ---------------------------------------------------------------
router.post(
  '/payment',
  [
    body('student_id').isInt({ min: 1 }).withMessage('Valid student ID required.'),
    body('amount').isFloat({ gt: 0 }).withMessage('Payment amount must be greater than 0.'),
    body('payment_date').isISO8601().withMessage('Valid payment date (YYYY-MM-DD) required.'),
    body('payment_method')
      .isIn(['Cash', 'Card', 'UPI', 'Net Banking', 'Cheque'])
      .withMessage('Invalid payment method.'),
    body('remarks').optional().trim().isLength({ max: 255 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { student_id, amount, payment_date, payment_method, remarks } = req.body;
    const paymentAmount = parseFloat(amount);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check or create fee record
      const [feeRows] = await conn.execute(
        'SELECT id, total_fee, paid_amount FROM fee_records WHERE student_id = ? FOR UPDATE',
        [student_id]
      );

      let feeRecordId;
      let totalFee = 0;
      let currentPaid = 0;

      if (feeRows.length === 0) {
        // Create fee record with 0 total fee if not already created
        const [insertRes] = await conn.execute(
          'INSERT INTO fee_records (student_id, total_fee, paid_amount, remaining_balance, fee_status) VALUES (?, 0, 0, 0, "Unpaid")',
          [student_id]
        );
        feeRecordId = insertRes.insertId;
      } else {
        feeRecordId = feeRows[0].id;
        totalFee = parseFloat(feeRows[0].total_fee);
        currentPaid = parseFloat(feeRows[0].paid_amount);
      }

      const newPaid = currentPaid + paymentAmount;
      const newRemaining = Math.max(0, totalFee - newPaid);

      let newStatus = 'Unpaid';
      if (newPaid >= totalFee && totalFee > 0) {
        newStatus = 'Paid';
      } else if (newPaid > 0) {
        newStatus = 'Partial';
      }

      // Update fee record
      await conn.execute(
        'UPDATE fee_records SET paid_amount = ?, remaining_balance = ?, fee_status = ? WHERE id = ?',
        [newPaid, newRemaining, newStatus, feeRecordId]
      );

      // Insert payment history
      await conn.execute(
        'INSERT INTO fee_payments (fee_record_id, student_id, amount, payment_date, payment_method, remarks) VALUES (?, ?, ?, ?, ?, ?)',
        [feeRecordId, student_id, paymentAmount, payment_date, payment_method, remarks || null]
      );

      await conn.commit();

      res.status(201).json({
        success: true,
        message: 'Payment recorded successfully.',
        data: {
          total_fee: totalFee,
          paid_amount: newPaid,
          remaining_balance: newRemaining,
          fee_status: newStatus,
        },
      });
    } catch (err) {
      await conn.rollback();
      console.error('POST /api/fees/payment error:', err);
      res.status(500).json({ success: false, message: 'Failed to record payment.' });
    } finally {
      conn.release();
    }
  }
);

// ---------------------------------------------------------------
// GET /api/fees/history/:student_id
// Retrieve payment history for a specific student
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
        `SELECT s.id, s.name, s.roll_number, fr.total_fee, fr.paid_amount, fr.remaining_balance, fr.fee_status
         FROM students s
         LEFT JOIN fee_records fr ON s.id = fr.student_id
         WHERE s.id = ?`,
        [studentId]
      );

      if (studentRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      const [payments] = await pool.execute(
        `SELECT id, amount, payment_date, payment_method, remarks, created_at
         FROM fee_payments
         WHERE student_id = ?
         ORDER BY payment_date DESC, id DESC`,
        [studentId]
      );

      res.json({
        success: true,
        student: studentRows[0],
        payments,
      });
    } catch (err) {
      console.error('GET /api/fees/history error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch payment history.' });
    }
  }
);

module.exports = router;
