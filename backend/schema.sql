CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Nullable: only the legacy YourWorld sync path (routes/users.ts) supplies this.
  -- Email signup and Google OAuth both create users without it, so NOT NULL here
  -- made signup fail with a 500 on any database built from this file. Matches
  -- migration 0005 and the runtime schema-init in src/lib/db.ts.
  encrypted_yw_id TEXT UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  email TEXT,
  password_hash TEXT,
  description TEXT,
  -- Free-form class label (e.g. '10.1'..'12.3'); the canonical class registry
  -- is the grade_classes table. No hardcoded grade-10 CHECK — grades 10-12 exist.
  class TEXT,
  grade INTEGER,
  grade_class_id INTEGER,
  academic_year TEXT,
  graduated INTEGER NOT NULL DEFAULT 0 CHECK(graduated IN (0, 1)),
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(totp_enabled IN (0, 1)),
  totp_backup_codes TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'admin')),
  admin_role TEXT,
  notes_uploaded INTEGER NOT NULL DEFAULT 0,
  total_likes INTEGER NOT NULL DEFAULT 0,
  total_admin_upvotes INTEGER NOT NULL DEFAULT 0,
  diamonds INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN (0, 1)),
  suspension_end_date TEXT,
  suspension_reason TEXT,
  warning INTEGER NOT NULL DEFAULT 0 CHECK(warning IN (0, 1)),
  warning_message TEXT,
  warning_first_viewed TEXT,
  warning_view_count INTEGER NOT NULL DEFAULT 0,
  google_id TEXT,
  oauth_provider TEXT DEFAULT 'local',
  last_seen_at TEXT,
  -- IANA zone name, nullable. NULL means "use the school default"
  -- (Asia/Jakarta); resolution is user -> school -> UTC. Day boundaries for
  -- streaks and SRS due dates are computed in this zone, not UTC.
  timezone TEXT,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_study_date TEXT,
  learning_points INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  note_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  subject_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  extracted_text TEXT,
  summary TEXT,
  image_path TEXT,
  content TEXT,
  tags TEXT,
  author_class TEXT,
  parent_note_id INTEGER,
  part_number INTEGER,
  status TEXT NOT NULL DEFAULT 'published',
  visibility TEXT NOT NULL DEFAULT 'everyone',
  scheduled_publish_at TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  admin_upvotes INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (parent_note_id) REFERENCES notes(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS note_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(note_id, user_id)
) STRICT;

CREATE TABLE IF NOT EXISTS admin_note_likes (
  note_id INTEGER NOT NULL,
  admin_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (note_id, admin_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT,
  topic TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  admin_email TEXT,
  action_type TEXT,
  target_type TEXT,
  target_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (admin_id) REFERENCES users(id)
) STRICT;

CREATE TABLE IF NOT EXISTS usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date TEXT NOT NULL,
  active_users INTEGER NOT NULL DEFAULT 0,
  new_users INTEGER NOT NULL DEFAULT 0,
  notes_created INTEGER NOT NULL DEFAULT 0,
  likes_given INTEGER NOT NULL DEFAULT 0,
  chat_sessions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note_id INTEGER,
  question_text TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  confidence INTEGER,
  answered_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS test_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id INTEGER,
  source_type TEXT,
  source_id INTEGER,
  question_count INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  score_pct INTEGER NOT NULL,
  duration_sec INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

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
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- note_id is part of the key: the same question wording asked from two
  -- different notes is two separate SRS cards. See migration 0016.
  UNIQUE(user_id, note_id, question_hash)
);

CREATE INDEX IF NOT EXISTS idx_notes_subject_id ON notes(subject_id);
CREATE INDEX IF NOT EXISTS idx_notes_author_id ON notes(author_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_parent_note_id ON notes(parent_note_id);
CREATE INDEX IF NOT EXISTS idx_note_likes_note_id ON note_likes(note_id);
CREATE INDEX IF NOT EXISTS idx_note_likes_user_id ON note_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_users_encrypted_yw_id ON users(encrypted_yw_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_stats ON users(total_likes DESC, total_admin_upvotes DESC) WHERE suspended = 0;
CREATE INDEX IF NOT EXISTS idx_notes_browse ON notes(subject_id, status, visibility, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_notes_active ON notes(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_time ON quiz_attempts(user_id, answered_at);
CREATE INDEX IF NOT EXISTS idx_test_sessions_user_time ON test_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_items_user_due ON study_items(user_id, due_at);

-- Class registry: grades 10-12, each with sections (10.1..12.3). Admin manages
-- these; students pick one at signup. academic_year dates the cohort.
CREATE TABLE IF NOT EXISTS grade_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade INTEGER NOT NULL CHECK(grade IN (10, 11, 12)),
  class_name TEXT NOT NULL,
  semester TEXT NOT NULL DEFAULT '',
  academic_year TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(grade, class_name, semester)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_users_grade_class_id ON users(grade_class_id);

-- Google OAuth: provider registry, encrypted token storage, and PKCE state.
CREATE TABLE IF NOT EXISTS oauth_providers (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  redirect_to TEXT,
  pkce_verifier TEXT NOT NULL,
  intent TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- Ops metrics: request-level and AI-provider usage samples (Phase 3 ops dashboard).
CREATE TABLE IF NOT EXISTS request_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  path TEXT,
  method TEXT,
  status INTEGER,
  duration_ms INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS idx_request_metrics_ts ON request_metrics(ts);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  provider TEXT,
  endpoint TEXT,
  ok INTEGER,
  duration_ms INTEGER,
  tokens INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS idx_ai_usage_ts ON ai_usage(ts);

-- Admin/moderator broadcast notifications and per-user read receipts.
-- (Definitions mirror initializeDatabase() so a fresh DB from schema.sql matches
-- production; not STRICT, to match the runtime-created tables.)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER,
  target_type TEXT NOT NULL,
  target_grade INTEGER,
  target_class TEXT,
  target_user_id INTEGER,
  notification_type TEXT NOT NULL DEFAULT 'announcement',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS notification_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(notification_id, user_id)
);

-- Tutor wing (redesign option 2f). Mirrors migration 0018.
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (session_id, student_id),
  UNIQUE (session_id, seat_no),
  FOREIGN KEY (session_id) REFERENCES tutor_sessions(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tutor_profiles_subject ON tutor_profiles(subject_id, status);
CREATE INDEX IF NOT EXISTS idx_tutor_sessions_start ON tutor_sessions(starts_at, status);
CREATE INDEX IF NOT EXISTS idx_tutor_bookings_student ON tutor_bookings(student_id, status);
