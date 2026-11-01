-- =============================================================
-- Student Information System - Database Schema
-- =============================================================
-- Run this file in MySQL to create the database and all tables.
-- Command: mysql -u root -p < database/schema.sql
-- =============================================================

-- Create and select the database
CREATE DATABASE IF NOT EXISTS student_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE student_db;

-- -------------------------------------------------------------
-- Table: departments
-- Stores academic departments (e.g., Computer Science, Physics)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  code       VARCHAR(10)  NOT NULL UNIQUE,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- Table: courses
-- Stores courses linked to a department
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id            INT          AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  code          VARCHAR(20)  NOT NULL UNIQUE,
  department_id INT          NOT NULL,
  duration_years TINYINT    DEFAULT 4,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

-- -------------------------------------------------------------
-- Table: students
-- Core student records
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id             INT          AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  roll_number    VARCHAR(20)  NOT NULL UNIQUE,
  email          VARCHAR(150) NOT NULL UNIQUE,
  phone          VARCHAR(15)  NOT NULL,
  course_id      INT          NOT NULL,
  department_id  INT          NOT NULL,
  admission_date DATE         NOT NULL,
  status         ENUM('active','inactive','graduated') DEFAULT 'active',
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id)     REFERENCES courses(id)     ON DELETE RESTRICT,
  FOREIGN KEY (department_id) REFERENCES departments(id)  ON DELETE RESTRICT
);

-- -------------------------------------------------------------
-- Table: admins
-- Stores admin login credentials (passwords are bcrypt-hashed)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(50)  NOT NULL UNIQUE,
  email        VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name    VARCHAR(100) NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  last_login   TIMESTAMP    NULL
);

-- -------------------------------------------------------------
-- Table: fee_records
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
-- Table: fee_payments
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
-- Table: attendance
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

-- -------------------------------------------------------------
-- Table: student_accounts
-- Stores login authentication credentials for students
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_accounts (
  id                   INT          AUTO_INCREMENT PRIMARY KEY,
  student_id           INT          NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN      NOT NULL DEFAULT FALSE,
  last_login           TIMESTAMP    NULL,
  created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_student_account_active (is_active)
);

-- -------------------------------------------------------------
-- Table: announcements
-- Stores university/college notices & announcements for students
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id                   INT          AUTO_INCREMENT PRIMARY KEY,
  title                VARCHAR(200) NOT NULL,
  message              TEXT         NOT NULL,
  target_course_id     INT          NULL,
  target_department_id INT          NULL,
  created_by           INT          NULL,
  created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_course_id)     REFERENCES courses(id)     ON DELETE SET NULL,
  FOREIGN KEY (target_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)           REFERENCES admins(id)      ON DELETE SET NULL,
  INDEX idx_announcement_created (created_at)
);

-- =============================================================
-- Seed Data
-- =============================================================

-- Departments
INSERT IGNORE INTO departments (name, code) VALUES
  ('Computer Science',      'CS'),
  ('Electronics Engineering', 'EE'),
  ('Mechanical Engineering', 'ME'),
  ('Civil Engineering',     'CE'),
  ('Mathematics',           'MATH'),
  ('Physics',               'PHY'),
  ('Business Administration','BA');

-- Courses (linked to departments above)
INSERT IGNORE INTO courses (name, code, department_id, duration_years) VALUES
  ('B.Tech Computer Science',          'BTCS',  1, 4),
  ('M.Tech Computer Science',          'MTCS',  1, 2),
  ('B.Tech Electronics',               'BTEE',  2, 4),
  ('B.Tech Mechanical',                'BTME',  3, 4),
  ('B.Tech Civil',                     'BTCE',  4, 4),
  ('B.Sc Mathematics',                 'BSCM',  5, 3),
  ('B.Sc Physics',                     'BSCP',  6, 3),
  ('BBA Business Administration',      'BBA',   7, 3),
  ('MBA Business Administration',      'MBA',   7, 2);

-- Default admin user
-- Username: admin   Password: Admin@123
INSERT IGNORE INTO admins (username, email, password_hash, full_name) VALUES
  ('admin',
   'admin@sis.edu',
   '$2a$12$vU9kmmYFvmvkmtdY3AU7FeQo7M85B956viQd.02jpL4n2qznWR.te',
   'System Administrator');

-- Sample announcements
INSERT IGNORE INTO announcements (id, title, message) VALUES
  (1, 'Welcome to the Student Information Portal', 'Welcome to the new Student Portal. You can now view your attendance records, track fee payment history, and receive academic announcements directly from this dashboard.'),
  (2, 'Upcoming Mid-Semester Examinations', 'Mid-semester examinations are scheduled to commence next month. Please ensure all your pending fee dues are settled and your attendance is above the required 75% threshold.'),
  (3, 'Central Library Book Return & Renewal', 'All students holding issued library books for the current semester must renew or return them by Friday to avoid overdue fines.');
