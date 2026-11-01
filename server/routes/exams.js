// server/routes/exams.js
// Exam and result management (admin only)

'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../db');

const router = express.Router();

function sendValidationError(res, errors) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: errors.array() });
}

// ---------------------------------------------------------------
// GET /api/exams - list exams (optional filters)
// ---------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM exams ORDER BY exam_date DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/exams error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch exams.' });
  }
});

// ---------------------------------------------------------------
// POST /api/exams - create new exam
// ---------------------------------------------------------------
router.post(
  '/',
  [
    body('title').notEmpty().withMessage('Title required'),
    body('subject').notEmpty().withMessage('Subject required'),
    body('course_id').isInt({ min: 1 }).withMessage('Valid course_id required'),
    body('class_name').notEmpty().withMessage('Class name required'),
    body('exam_date').isISO8601().withMessage('Valid exam_date required'),
    body('max_marks').isInt({ min: 1 }).withMessage('max_marks required'),
    body('pass_marks').isInt({ min: 0 }).withMessage('pass_marks required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);
    const { title, subject, course_id, class_name, exam_date, max_marks, pass_marks } = req.body;
    try {
      const [result] = await pool.execute(
        `INSERT INTO exams (title, subject, course_id, class_name, exam_date, max_marks, pass_marks)
         VALUES (?,?,?,?,?,?,?)`,
        [title, subject, course_id, class_name, exam_date, max_marks, pass_marks]
      );
      res.json({ success: true, data: { examId: result.insertId } });
    } catch (err) {
      console.error('POST /api/exams error:', err);
      res.status(500).json({ success: false, message: 'Failed to create exam.' });
    }
  }
);

// ---------------------------------------------------------------
// PUT /api/exams/:id - update exam (including status publish)
// ---------------------------------------------------------------
router.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }),
    body('status').optional().isIn(['draft', 'published', 'archived']).withMessage('Invalid status'),
    // other optional fields can be added as needed
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);
    const examId = req.params.id;
    const fields = [];
    const values = [];
    if (req.body.title) { fields.push('title = ?'); values.push(req.body.title); }
    if (req.body.subject) { fields.push('subject = ?'); values.push(req.body.subject); }
    if (req.body.exam_date) { fields.push('exam_date = ?'); values.push(req.body.exam_date); }
    if (req.body.max_marks) { fields.push('max_marks = ?'); values.push(req.body.max_marks); }
    if (req.body.pass_marks) { fields.push('pass_marks = ?'); values.push(req.body.pass_marks); }
    if (req.body.status) { fields.push('status = ?'); values.push(req.body.status); }
    if (fields.length === 0) return res.status(400).json({ success: false, message: 'No update fields provided.' });
    values.push(examId);
    const sql = `UPDATE exams SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    try {
      await pool.execute(sql, values);
      res.json({ success: true, message: 'Exam updated.' });
    } catch (err) {
      console.error('PUT /api/exams/:id error:', err);
      res.status(500).json({ success: false, message: 'Failed to update exam.' });
    }
  }
);

// ---------------------------------------------------------------
// DELETE /api/exams/:id - remove exam
// ---------------------------------------------------------------
router.delete('/:id', [param('id').isInt({ min: 1 })], async (req, res) => {
  const examId = req.params.id;
  try {
    await pool.execute('DELETE FROM exams WHERE id = ?', [examId]);
    res.json({ success: true, message: 'Exam deleted.' });
  } catch (err) {
    console.error('DELETE /api/exams/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete exam.' });
  }
});

// ---------------------------------------------------------------
// GET /api/exams/:id/results - list results for an exam
// ---------------------------------------------------------------
router.get('/:id/results', [param('id').isInt({ min: 1 })], async (req, res) => {
  const examId = req.params.id;
  try {
    const [rows] = await pool.execute(
      `SELECT er.*, s.roll_number, s.name FROM exam_results er\n` +
      `JOIN students s ON er.student_id = s.id\n` +
      `WHERE er.exam_id = ? ORDER BY s.roll_number`,
      [examId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/exams/:id/results error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
});

// ---------------------------------------------------------------
// POST /api/exams/:id/results - upsert result for a student
// ---------------------------------------------------------------
router.post(
  '/:id/results',
  [
    param('id').isInt({ min: 1 }),
    body('student_id').isInt({ min: 1 }).withMessage('student_id required'),
    body('marks_obtained').isInt({ min: 0 }).withMessage('marks_obtained required'),
    body('status').optional().isIn(['pass', 'fail', 'pending']).withMessage('Invalid status'),
    body('remarks').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);
    const examId = req.params.id;
    const { student_id, marks_obtained, status, remarks } = req.body;
    try {
      await pool.execute(
        `INSERT INTO exam_results (exam_id, student_id, marks_obtained, status, remarks)\n` +
        `VALUES (?,?,?,?,?)\n` +
        `ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained), status = VALUES(status), remarks = VALUES(remarks), updated_at = CURRENT_TIMESTAMP`,
        [examId, student_id, marks_obtained, status || 'pending', remarks || null]
      );
      res.json({ success: true, message: 'Result saved.' });
    } catch (err) {
      console.error('POST /api/exams/:id/results error:', err);
      res.status(500).json({ success: false, message: 'Failed to save result.' });
    }
  }
);

module.exports = router;
