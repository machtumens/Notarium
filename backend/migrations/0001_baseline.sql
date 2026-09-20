-- 0001_baseline — the schema the Worker needs, as one idempotent file.
--
-- Reproduces what `initializeDatabase()` in src/index.ts created at runtime until Wave 4
-- (every CREATE TABLE plus every column its try/catch ALTER TABLE block added), folded together
-- with the columns the old hand-applied migrations 0002–0004 (suspension_*, warning_*), 0005
-- (encrypted_yw_id), 0007 (author_class) and add_multi_photo_support (parent_note_id,
-- part_number) introduced. Everything is CREATE ... IF NOT EXISTS, so applying this file to a
-- database that already has all of it (production, a local D1 built by the old runtime) is a
-- no-op — that is what the one-time `wrangler d1 migrations apply` on production relies on.
--
-- refresh_tokens is created in its migration-0008 shape on purpose. The two columns W2.1 added
-- (family, revoked_at) are missing from production, and SQLite has no ADD COLUMN IF NOT EXISTS,
-- so they live in their own files (0002, 0003) that apply exactly once per database.
--
-- Not carried forward: 0001_allow_null_class (rebuilt users without password_hash — its intent,
-- a nullable class, is the plain `class TEXT` below), 0006_reset_user_stats (a one-time data
-- reset from January 2026; re-running it would zero every user's stats), the unused indexes
-- idx_users_encrypted_yw_id / idx_notes_parent_note_id (no query reads either column).

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encrypted_yw_id TEXT UNIQUE,
  display_name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  photo_url TEXT,
  class TEXT,
  role TEXT DEFAULT 'student',
  notes_uploaded INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_admin_upvotes INTEGER DEFAULT 0,
  suspended INTEGER DEFAULT 0,
  diamonds INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- added by the old runtime ALTER block
  description TEXT,
  points INTEGER DEFAULT 0,
  -- old migrations 0002 (suspension), 0003 (warning), 0004 (warning tracking)
  suspension_end_date TEXT,
  suspension_reason TEXT,
  warning INTEGER DEFAULT 0,
  warning_message TEXT,
  warning_first_viewed TEXT,
  warning_view_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  icon TEXT,
  note_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER,
  title TEXT,
  description TEXT,
  subject_id INTEGER,
  extracted_text TEXT,
  image_path TEXT,
  summary TEXT,
  content TEXT,
  tags TEXT,
  author_class TEXT,
  status TEXT DEFAULT 'published',
  visibility TEXT DEFAULT 'everyone',
  scheduled_publish_at TEXT,
  likes INTEGER DEFAULT 0,
  admin_upvotes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- add_multi_photo_support: continuation notes
  parent_note_id INTEGER,
  part_number INTEGER,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  admin_email TEXT,
  action_type TEXT,
  target_type TEXT,
  target_id INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  subject TEXT,
  topic TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  role TEXT,
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

CREATE TABLE IF NOT EXISTS note_likes (
  note_id INTEGER,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (note_id, user_id),
  FOREIGN KEY (note_id) REFERENCES notes(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS admin_note_likes (
  note_id INTEGER,
  admin_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (note_id, admin_id),
  FOREIGN KEY (note_id) REFERENCES notes(id),
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- migration-0008 shape; `token` holds sha256(token) since W2.1. family / revoked_at: see 0002, 0003.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
