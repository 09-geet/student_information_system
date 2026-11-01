-- =============================================================
-- Migration v3: Student Login Portal & Announcements
-- =============================================================
USE student_db;

-- -------------------------------------------------------------
-- 1. Table: student_accounts
-- Stores authentication credentials for students
-- Linked to students table via student_id foreign key
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
-- 2. Table: announcements
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

-- -------------------------------------------------------------
-- Seed sample announcements
-- -------------------------------------------------------------
INSERT IGNORE INTO announcements (id, title, message) VALUES
  (1, 'Welcome to the Student Information Portal', 'Welcome to the new Student Portal. You can now view your attendance records, track fee payment history, and receive academic announcements directly from this dashboard.'),
  (2, 'Upcoming Mid-Semester Examinations', 'Mid-semester examinations are scheduled to commence next month. Please ensure all your pending fee dues are settled and your attendance is above the required 75% threshold.'),
  (3, 'Central Library Book Return & Renewal', 'All students holding issued library books for the current semester must renew or return them by Friday to avoid overdue fines.');

-- -------------------------------------------------------------
-- Seed default student accounts for existing students
-- Password: "Student@123"
-- -------------------------------------------------------------
INSERT IGNORE INTO student_accounts (student_id, password_hash, is_active, must_change_password)
SELECT 
  s.id,
  '$2a$12$bRtm7SG/RvlpxYJkZAHV4.CH0hmqUBPND7frhk2LnYj.1HP39sR6y',
  1,
  0
FROM students s
WHERE NOT EXISTS (
  SELECT 1 FROM student_accounts sa WHERE sa.student_id = s.id
);
