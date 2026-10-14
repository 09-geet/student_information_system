// server/db.js
// Manages the MySQL connection pool using mysql2 and environment variables.
// Never put credentials directly here — they come from .env

'use strict';

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306', 10),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'student_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  // Return column values as native JS types where possible
  typeCast: true,
});

// Test the connection on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅  MySQL connected successfully.');
    conn.release();
  } catch (err) {
    console.error('❌  MySQL connection failed:', err.message);
    process.exit(1); // Exit so the developer knows immediately
  }
})();

module.exports = pool;
