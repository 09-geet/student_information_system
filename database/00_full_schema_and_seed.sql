-- =============================================================
-- Student Information System - Complete Database Setup Script
-- =============================================================
-- Run this script in MySQL Workbench or via command line:
-- Command: mysql -u root -p < database/00_full_schema_and_seed.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS student_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE student_db;

-- -------------------------------------------------------------
-- 1. Table: departments
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  code       VARCHAR(10)  NOT NULL UNIQUE,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- 2. Table: courses
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id             INT          AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  code           VARCHAR(20)  NOT NULL UNIQUE,
  department_id  INT          NOT NULL,
  duration_years TINYINT      DEFAULT 4,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

-- -------------------------------------------------------------
-- 3. Table: admins
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id            INT          AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  last_login    TIMESTAMP    NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- 4. Table: students
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id             INT                                      AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100)                             NOT NULL,
  roll_number    VARCHAR(20)                              NOT NULL UNIQUE,
  email          VARCHAR(150)                             NOT NULL UNIQUE,
  phone          VARCHAR(15)                              NOT NULL,
  course_id      INT                                      NOT NULL,
  department_id  INT                                      NOT NULL,
  admission_date DATE                                     NOT NULL,
  status         ENUM('active', 'inactive', 'graduated')  DEFAULT 'active',
  created_at     TIMESTAMP                                DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP                                DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id)     REFERENCES courses(id)     ON DELETE RESTRICT,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  INDEX idx_roll_number   (roll_number),
  INDEX idx_email         (email),
  INDEX idx_department_id (department_id),
  INDEX idx_course_id     (course_id),
  INDEX idx_status        (status)
);

-- -------------------------------------------------------------
-- 5. Table: student_accounts
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
-- 6. Table: announcements
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

-- -------------------------------------------------------------
-- 7. Table: fee_records
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
-- 8. Table: fee_payments
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
-- 9. Table: attendance
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
-- 10. Table: attendance_sessions (QR Code attendance)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id         BIGINT       AUTO_INCREMENT PRIMARY KEY,
  course_id  INT          NOT NULL,
  class_name VARCHAR(100) NOT NULL,
  token      VARCHAR(64)  NOT NULL UNIQUE,
  expires_at DATETIME     NOT NULL,
  created_by INT          NULL,
  status     ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id)  REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES admins(id)  ON DELETE SET NULL,
  INDEX idx_attendance_sessions_token (token)
);

-- -------------------------------------------------------------
-- 11. Table: exams
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
  id         BIGINT       AUTO_INCREMENT PRIMARY KEY,
  title      VARCHAR(255) NOT NULL,
  subject    VARCHAR(255) NOT NULL,
  course_id  INT          NOT NULL,
  class_name VARCHAR(100) NOT NULL,
  exam_date  DATE         NOT NULL,
  max_marks  INT          NOT NULL,
  pass_marks INT          NOT NULL,
  status     ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  INDEX idx_exams_date (exam_date)
);

-- -------------------------------------------------------------
-- 12. Table: exam_results
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_results (
  id             BIGINT    AUTO_INCREMENT PRIMARY KEY,
  exam_id        BIGINT    NOT NULL,
  student_id     INT       NOT NULL,
  marks_obtained INT       NOT NULL,
  status         ENUM('pass', 'fail', 'pending') NOT NULL DEFAULT 'pending',
  remarks        TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id)    REFERENCES exams(id)    ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY uq_exam_student (exam_id, student_id),
  INDEX idx_exam_results_exam (exam_id),
  INDEX idx_exam_results_student (student_id)
);

-- =============================================================
-- Seed Initial Data
-- =============================================================

-- Academic Departments
INSERT IGNORE INTO departments (id, name, code) VALUES
  (1, 'Computer Science',        'CS'),
  (2, 'Electronics Engineering', 'EE'),
  (3, 'Mechanical Engineering',  'ME'),
  (4, 'Civil Engineering',       'CE'),
  (5, 'Mathematics',             'MATH'),
  (6, 'Physics',                 'PHY'),
  (7, 'Business Administration', 'BA');

-- Courses
INSERT IGNORE INTO courses (id, name, code, department_id, duration_years) VALUES
  (1, 'B.Tech Computer Science',     'BTCS', 1, 4),
  (2, 'M.Tech Computer Science',     'MTCS', 1, 2),
  (3, 'B.Tech Electronics',          'BTEE', 2, 4),
  (4, 'B.Tech Mechanical',           'BTME', 3, 4),
  (5, 'B.Tech Civil',                'BTCE', 4, 4),
  (6, 'B.Sc Mathematics',            'BSCM', 5, 3),
  (7, 'B.Sc Physics',                'BSCP', 6, 3),
  (8, 'BBA Business Administration', 'BBA',  7, 3),
  (9, 'MBA Business Administration', 'MBA',  7, 2);

-- Default Admin User (username: admin / password: Admin@123)
INSERT IGNORE INTO admins (id, username, email, password_hash, full_name) VALUES
  (1,
   'admin',
   'admin@sis.edu',
   '$2a$12$vU9kmmYFvmvkmtdY3AU7FeQo7M85B956viQd.02jpL4n2qznWR.te',
   'System Administrator');

-- Announcements
INSERT IGNORE INTO announcements (id, title, message) VALUES
  (1, 'Welcome to the Student Information Portal', 'Welcome to the new Student Portal. You can now view your attendance records, track fee payment history, and receive academic announcements directly from this dashboard.'),
  (2, 'Upcoming Mid-Semester Examinations', 'Mid-semester examinations are scheduled to commence next month. Please ensure all your pending fee dues are settled and your attendance is above the required 75% threshold.'),
  (3, 'Central Library Book Return & Renewal', 'All students holding issued library books for the current semester must renew or return them by Friday to avoid overdue fines.');
