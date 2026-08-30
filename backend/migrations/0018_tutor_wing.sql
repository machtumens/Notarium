-- Tutor wing (redesign brief option 2f) — schema.
--
-- The full four-table shape from the tutor-wing plan lands in one migration so
-- the schema is settled, even though only T1 (profiles + directory) is wired up
-- in this pass. Scheduling and booking endpoints come later; 1:1 sessions stay
-- gated on the safeguarding question the plan records as a hard blocker.

CREATE TABLE IF NOT EXISTS tutor_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  blurb TEXT,
  grade_min INTEGER,
  grade_max INTEGER,
  languages TEXT,
  -- pending | active | paused | revoked. New applications land on 'pending':
  -- a moderator grants tutor status, it is never self-granted.
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by INTEGER,
  rating_avg REAL,
  session_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

CREATE TABLE IF NOT EXISTS tutor_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tutor_profile_id INTEGER NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'one_to_one',
  seat_cap INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tutor_profile_id) REFERENCES tutor_profiles(id)
);

CREATE TABLE IF NOT EXISTS tutor_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tutor_profile_id INTEGER NOT NULL,
  availability_id INTEGER,
  subject_id INTEGER NOT NULL,
  topic TEXT,
  kind TEXT NOT NULL DEFAULT 'one_to_one',
  seat_cap INTEGER,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tutor_profile_id) REFERENCES tutor_profiles(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

CREATE TABLE IF NOT EXISTS tutor_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  -- Seat number is assigned on insert. The UNIQUE below is what actually stops
  -- a group room being oversold: D1 has no SELECT ... FOR UPDATE, so two
  -- students racing for the last seat are separated by the database rejecting
  -- the loser rather than by application-level checking.
  seat_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked',
  rating INTEGER,
  feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, student_id),
  UNIQUE (session_id, seat_no),
  FOREIGN KEY (session_id) REFERENCES tutor_sessions(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tutor_profiles_subject ON tutor_profiles(subject_id, status);
CREATE INDEX IF NOT EXISTS idx_tutor_sessions_start ON tutor_sessions(starts_at, status);
CREATE INDEX IF NOT EXISTS idx_tutor_bookings_student ON tutor_bookings(student_id, status);
