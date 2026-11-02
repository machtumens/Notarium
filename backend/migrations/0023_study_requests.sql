-- Study requests: a student asks for a subject on a day; tutors see the demand.
CREATE TABLE IF NOT EXISTS study_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (student_id, subject_id, day),
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);
CREATE INDEX IF NOT EXISTS idx_study_requests_day ON study_requests(day, subject_id);
