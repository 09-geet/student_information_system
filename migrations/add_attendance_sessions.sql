-- Migration: add_attendance_sessions.sql
-- Adds a table to manage QR code attendance sessions.
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    course_id BIGINT NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_by BIGINT NOT NULL,
    status ENUM('open','closed') NOT NULL DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attendance_sessions_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_sessions_creator FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL
);

-- Ensure token is indexed for fast lookup.
CREATE INDEX idx_attendance_sessions_token ON attendance_sessions(token);
