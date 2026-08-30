-- Test history + the counter the "10 mocks" badge needs.
--
-- quiz_attempts records individual QUESTIONS, so there was no way to answer
-- "how many mock tests has this student finished" or "how did this one compare
-- to the last". Both are required by the redesign brief's results screen
-- ("Better than last time · +9 points from your Physics mock two weeks ago")
-- and by the trophy deck's badge row.

CREATE TABLE IF NOT EXISTS test_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id INTEGER,
  source_type TEXT,                       -- 'note' | 'subject'
  source_id INTEGER,
  question_count INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  score_pct INTEGER NOT NULL,             -- 0..100, stored so history needs no recompute
  duration_sec INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- The results screen looks up "my previous test, most recent first", and the
-- badge counts rows per user. Both are covered by this one index.
CREATE INDEX IF NOT EXISTS idx_test_sessions_user_time
  ON test_sessions(user_id, created_at DESC);
