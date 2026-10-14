-- =============================================================
-- Migration: Add Fee Management and Attendance Management Tables
-- =============================================================
USE student_db;

-- -------------------------------------------------------------
-- 1. Table: fee_records
-- One fee record per student (tracks total, paid, remaining, status)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_records (
  id                INT            AUTO_INCREMENT PRIMARY KEY,
  student_id        INT            NOT NULL UNIQUE,
  total_fee         DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  paid_amount       DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  remaining_balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  fee_status        ENUM('Paid', 'Partial', 'Unpaid') NOT NULL DEFAULT 'Unpaid',
  created_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_fee_status (fee_status),
  INDEX idx_student_id (student_id)
);

-- -------------------------------------------------------------
-- 2. Table: fee_payments
-- History of individual payments made by students
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_payments (
  id             INT            AUTO_INCREMENT PRIMARY KEY,
  fee_record_id  INT            NOT NULL,
  student_id     INT            NOT NULL,
  amount         DECIMAL(10, 2) NOT NULL,
  payment_date   DATE           NOT NULL,
  payment_method ENUM('Cash', 'Card', 'UPI', 'Net Banking', 'Cheque') NOT NULL DEFAULT 'Cash',
  remarks        VARCHAR(255)   NULL,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fee_record_id) REFERENCES fee_records(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id)    REFERENCES students(id)    ON DELETE CASCADE,
  INDEX idx_payment_date (payment_date),
  INDEX idx_fee_record (fee_record_id)
);

-- -------------------------------------------------------------
-- 3. Table: attendance
-- Records individual student attendance per course, class and date
-- Unique constraint prevents duplicate attendance on same date
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  student_id INT          NOT NULL,
  course_id  INT          NOT NULL,
  class_name VARCHAR(100) NOT NULL DEFAULT 'Regular',
  date       DATE         NOT NULL,
  status     ENUM('Present', 'Absent') NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE,
  UNIQUE KEY uq_student_date (student_id, date),
  INDEX idx_attendance_date (date),
  INDEX idx_attendance_course (course_id),
  INDEX idx_attendance_status (status)
);
