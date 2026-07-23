-- learning-science study features: quiz attempts, spaced-repetition queue,
-- retrieval-based learning points, study streaks, confidence ratings.
-- run: npx wrangler d1 execute notarium-db --file=backend/migrations/0012_study_features.sql

-- (19) persisted quiz attempts + (23) confidence ratings
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note_id INTEGER,
  question_text TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  confidence INTEGER,
  answered_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_time
  ON quiz_attempts(user_id, answered_at);

-- (20) spaced-repetition review queue (SM-2 state per question)
CREATE TABLE IF NOT EXISTS study_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note_id INTEGER,
  question_text TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  ease_factor REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  due_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, question_hash)
);

CREATE INDEX IF NOT EXISTS idx_study_items_user_due
  ON study_items(user_id, due_at);

-- (21) retrieval-based learning points + (22) study streaks
ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN longest_streak INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_study_date TEXT;
ALTER TABLE users ADD COLUMN learning_points INTEGER DEFAULT 0;
