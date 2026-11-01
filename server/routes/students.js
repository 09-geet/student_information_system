// server/routes/students.js
// CRUD operations for students, courses, and departments.
// All routes are protected — requireAuth middleware must be applied in app.js.

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, query, validationResult } = require('express-validator');
const pool = require('../db');

const router = express.Router();

// ---------------------------------------------------------------
// Helper: format validation errors into a single response
// ---------------------------------------------------------------
function sendValidationError(res, errors) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: errors.array(),
  });
}

// ===============================================================
// DEPARTMENT & COURSE ROUTES (read-only for the UI dropdowns)
// ===============================================================

// GET /api/students/departments  — list all departments
router.get('/departments', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, code FROM departments ORDER BY name'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /departments error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch departments.' });
  }
});

// GET /api/students/courses  — list all courses (optionally filter by department)
router.get('/courses', async (req, res) => {
  try {
    const deptId = req.query.department_id;
    let sql = `SELECT c.id, c.name, c.code, c.duration_years, d.name AS department_name
               FROM courses c
               JOIN departments d ON c.department_id = d.id`;
    const params = [];
    if (deptId && /^\d+$/.test(deptId)) {
      sql += ' WHERE c.department_id = ?';
      params.push(deptId);
    }
    sql += ' ORDER BY c.name';
    const [rows] = await pool.execute(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /courses error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
  }
});

// ===============================================================
// STUDENT ROUTES
// ===============================================================

// ---------------------------------------------------------------
// GET /api/students  — list students with search & filter
// ---------------------------------------------------------------
router.get(
  '/',
  [
    query('search').optional().trim().isLength({ max: 100 }),
    query('department_id').optional().isInt({ min: 1 }),
    query('course_id').optional().isInt({ min: 1 }),
    query('status').optional().isIn(['active', 'inactive', 'graduated']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const page   = parseInt(req.query.page  || '1',  10);
    const limit  = parseInt(req.query.limit || '20', 10);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params     = [];

    if (req.query.search) {
      conditions.push(
        '(s.name LIKE ? OR s.roll_number LIKE ? OR s.email LIKE ? OR s.phone LIKE ?)'
      );
      const like = `%${req.query.search}%`;
      params.push(like, like, like, like);
    }
    if (req.query.department_id) {
      conditions.push('s.department_id = ?');
      params.push(req.query.department_id);
    }
    if (req.query.course_id) {
      conditions.push('s.course_id = ?');
      params.push(req.query.course_id);
    }
    if (req.query.status) {
      conditions.push('s.status = ?');
      params.push(req.query.status);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    try {
      // Count total matching rows for pagination
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM students s
         JOIN courses c    ON s.course_id     = c.id
         JOIN departments d ON s.department_id = d.id
         ${whereClause}`,
        params
      );

      const total = countRows[0].total;

      // Fetch paginated results
      const [rows] = await pool.execute(
        `SELECT
           s.id, s.name, s.roll_number, s.email, s.phone,
           s.status, s.admission_date,
           c.id   AS course_id,   c.name   AS course_name,
           d.id   AS department_id, d.name AS department_name,
           s.created_at, s.updated_at
         FROM students s
         JOIN courses c     ON s.course_id     = c.id
         JOIN departments d ON s.department_id = d.id
         ${whereClause}
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        data:    rows,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      console.error('GET /students error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch students.' });
    }
  }
);

// ---------------------------------------------------------------
// GET /api/students/stats  — dashboard summary counts
// ---------------------------------------------------------------
router.get('/stats', async (_req, res) => {
  try {
    const [[{ total_students }]] = await pool.execute(
      'SELECT COUNT(*) AS total_students FROM students'
    );
    const [[{ total_courses }]] = await pool.execute(
      'SELECT COUNT(*) AS total_courses FROM courses'
    );
    const [[{ total_departments }]] = await pool.execute(
      'SELECT COUNT(*) AS total_departments FROM departments'
    );
    const [[{ active_students }]] = await pool.execute(
      "SELECT COUNT(*) AS active_students FROM students WHERE status = 'active'"
    );
    res.json({
      success: true,
      data: { total_students, total_courses, total_departments, active_students },
    });
  } catch (err) {
    console.error('GET /stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

// ---------------------------------------------------------------
// GET /api/students/:id  — single student
// ---------------------------------------------------------------
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid student ID.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    try {
      const [rows] = await pool.execute(
        `SELECT
           s.id, s.name, s.roll_number, s.email, s.phone,
           s.status, s.admission_date,
           s.course_id, c.name AS course_name,
           s.department_id, d.name AS department_name,
           s.created_at, s.updated_at
         FROM students s
         JOIN courses c     ON s.course_id     = c.id
         JOIN departments d ON s.department_id = d.id
         WHERE s.id = ?`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error('GET /students/:id error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch student.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/students  — create a new student
// ---------------------------------------------------------------
const studentValidators = [
  body('name')
    .trim().notEmpty().withMessage('Name is required.')
    .isLength({ max: 100 }).withMessage('Name must be ≤ 100 characters.')
    .matches(/^[A-Za-z\s.'-]+$/).withMessage('Name contains invalid characters.'),

  body('roll_number')
    .trim().notEmpty().withMessage('Roll number is required.')
    .isLength({ max: 20 }).withMessage('Roll number must be ≤ 20 characters.')
    .matches(/^[A-Za-z0-9/_-]+$/).withMessage('Roll number can only contain letters, numbers, hyphens, slashes, or underscores.'),

  body('email')
    .trim().notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Invalid email address.')
    .normalizeEmail()
    .isLength({ max: 150 }),

  body('phone')
    .trim().notEmpty().withMessage('Phone is required.')
    .matches(/^\+?[\d\s\-().]{7,15}$/).withMessage('Invalid phone number.'),

  body('course_id')
    .isInt({ min: 1 }).withMessage('Course is required.'),

  body('department_id')
    .isInt({ min: 1 }).withMessage('Department is required.'),

  body('admission_date')
    .isISO8601().withMessage('Invalid admission date (YYYY-MM-DD required).')
    .toDate(),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'graduated']).withMessage('Invalid status.'),
];

router.post('/', studentValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  const { name, roll_number, email, phone, course_id, department_id, admission_date, status } = req.body;

  try {
    // Check for duplicate roll_number or email
    const [dupRows] = await pool.execute(
      'SELECT id FROM students WHERE roll_number = ? OR email = ?',
      [roll_number, email]
    );
    if (dupRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A student with this roll number or email already exists.',
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO students
         (name, roll_number, email, phone, course_id, department_id, admission_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, roll_number, email.toLowerCase(), phone, course_id, department_id,
       new Date(admission_date).toISOString().split('T')[0],
       status || 'active']
    );

    // Initialize fee_record row for the new student
    try {
      await pool.execute(
        `INSERT INTO fee_records (student_id, total_fee, paid_amount, remaining_balance, fee_status)
         VALUES (?, 0.00, 0.00, 0.00, 'Unpaid')
         ON DUPLICATE KEY UPDATE student_id = student_id`,
        [result.insertId]
      );
    } catch (feeErr) {
      console.warn('Could not auto-create fee_record:', feeErr.message);
    }

    // Initialize student portal account with default credentials (Student@123)
    try {
      const defaultHash = '$2a$12$bRtm7SG/RvlpxYJkZAHV4.CH0hmqUBPND7frhk2LnYj.1HP39sR6y';
      await pool.execute(
        `INSERT INTO student_accounts (student_id, password_hash, is_active, must_change_password)
         VALUES (?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE student_id = student_id`,
        [result.insertId, defaultHash]
      );
    } catch (accErr) {
      console.warn('Could not auto-create student_account:', accErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Student added successfully.',
      data: { id: result.insertId },
    });
  } catch (err) {
    console.error('POST /students error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Duplicate roll number or email.' });
    }
    res.status(500).json({ success: false, message: 'Failed to add student.' });
  }
});

// ---------------------------------------------------------------
// PUT /api/students/:id  — update a student
// ---------------------------------------------------------------
router.put(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid student ID.'), ...studentValidators],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const { name, roll_number, email, phone, course_id, department_id, admission_date, status } = req.body;
    const studentId = req.params.id;

    try {
      // Ensure student exists
      const [existing] = await pool.execute(
        'SELECT id FROM students WHERE id = ?', [studentId]
      );
      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      // Check for duplicate roll_number / email on a DIFFERENT student
      const [dupRows] = await pool.execute(
        'SELECT id FROM students WHERE (roll_number = ? OR email = ?) AND id != ?',
        [roll_number, email, studentId]
      );
      if (dupRows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Another student already has this roll number or email.',
        });
      }

      await pool.execute(
        `UPDATE students
         SET name = ?, roll_number = ?, email = ?, phone = ?,
             course_id = ?, department_id = ?, admission_date = ?, status = ?
         WHERE id = ?`,
        [name, roll_number, email.toLowerCase(), phone, course_id, department_id,
         new Date(admission_date).toISOString().split('T')[0],
         status || 'active', studentId]
      );

      res.json({ success: true, message: 'Student updated successfully.' });
    } catch (err) {
      console.error('PUT /students/:id error:', err);
      res.status(500).json({ success: false, message: 'Failed to update student.' });
    }
  }
);

// ---------------------------------------------------------------
// DELETE /api/students/:id  — delete a student
// ---------------------------------------------------------------
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid student ID.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    try {
      const [result] = await pool.execute(
        'DELETE FROM students WHERE id = ?', [req.params.id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
      res.json({ success: true, message: 'Student deleted successfully.' });
    } catch (err) {
      console.error('DELETE /students/:id error:', err);
      res.status(500).json({ success: false, message: 'Failed to delete student.' });
    }
  }
);

// ===============================================================
// STUDENT ACCOUNT MANAGEMENT (ADMIN-CONTROLLED)
// ===============================================================

// ---------------------------------------------------------------
// GET /api/students/:id/account — Get student account status
// ---------------------------------------------------------------
router.get(
  '/:id/account',
  [param('id').isInt({ min: 1 }).withMessage('Invalid student ID.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const studentId = req.params.id;

    try {
      const [students] = await pool.execute(
        'SELECT id, name, roll_number, email FROM students WHERE id = ?',
        [studentId]
      );

      if (students.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      const [accounts] = await pool.execute(
        `SELECT id, is_active, must_change_password, last_login, created_at, updated_at
         FROM student_accounts
         WHERE student_id = ?`,
        [studentId]
      );

      const hasAccount = accounts.length > 0;
      res.json({
        success: true,
        student: students[0],
        hasAccount,
        account: hasAccount ? accounts[0] : null,
      });
    } catch (err) {
      console.error('GET /:id/account error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch student account.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/students/:id/account/create — Create student portal account
// ---------------------------------------------------------------
router.post(
  '/:id/account/create',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid student ID.'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const studentId = req.params.id;
    const rawPassword = req.body.password || 'Student@123';

    try {
      const [students] = await pool.execute(
        'SELECT id, name, roll_number, email FROM students WHERE id = ?',
        [studentId]
      );
      if (students.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      const [existing] = await pool.execute(
        'SELECT id FROM student_accounts WHERE student_id = ?',
        [studentId]
      );
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'An account already exists for this student.' });
      }

      const passwordHash = await bcrypt.hash(rawPassword, 12);
      await pool.execute(
        `INSERT INTO student_accounts (student_id, password_hash, is_active, must_change_password)
         VALUES (?, ?, 1, 1)`,
        [studentId, passwordHash]
      );

      res.status(201).json({
        success: true,
        message: 'Student account created successfully. Temporary password is set.',
      });
    } catch (err) {
      console.error('POST /:id/account/create error:', err);
      res.status(500).json({ success: false, message: 'Failed to create student account.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/students/:id/account/toggle-status — Activate/deactivate account
// ---------------------------------------------------------------
router.post(
  '/:id/account/toggle-status',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid student ID.'),
    body('is_active').isBoolean().withMessage('is_active must be a boolean.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const studentId = req.params.id;
    const isActive = req.body.is_active ? 1 : 0;

    try {
      const [result] = await pool.execute(
        'UPDATE student_accounts SET is_active = ?, updated_at = NOW() WHERE student_id = ?',
        [isActive, studentId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Student account not found.' });
      }

      res.json({
        success: true,
        message: `Student account ${isActive ? 'activated' : 'deactivated'} successfully.`,
        is_active: Boolean(isActive),
      });
    } catch (err) {
      console.error('POST /:id/account/toggle-status error:', err);
      res.status(500).json({ success: false, message: 'Failed to update account status.' });
    }
  }
);

// ---------------------------------------------------------------
// POST /api/students/:id/account/reset-password — Admin reset password
// ---------------------------------------------------------------
router.post(
  '/:id/account/reset-password',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid student ID.'),
    body('new_password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const studentId = req.params.id;
    const newPassword = req.body.new_password;

    try {
      const passwordHash = await bcrypt.hash(newPassword, 12);
      const [result] = await pool.execute(
        'UPDATE student_accounts SET password_hash = ?, must_change_password = 1, updated_at = NOW() WHERE student_id = ?',
        [passwordHash, studentId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Student account not found.' });
      }

      res.json({
        success: true,
        message: 'Student password reset successfully. Student will be prompted to update it on next login.',
      });
    } catch (err) {
      console.error('POST /:id/account/reset-password error:', err);
      res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }
  }
);

module.exports = router;
