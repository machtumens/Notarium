-- Notarium database schema — authoritative reference
-- this reflects the table structure after all migrations have been applied
-- to create from scratch: npx wrangler d1 execute notarium-db --file=backend/schema.sql
--
-- architecture notes for maintainers:
-- - all tables use STRICT mode for type safety
-- - image_path stores base64 JSON arrays; consider migrating to R2 object URLs
--   as the user base grows to avoid D1 row-size pressure
-- - enable D1 read replication in the Cloudflare dashboard for leaderboard
--   and subject listing endpoints (zero code change required)
-- - chat sessions older than 30 days with no messages can be pruned
--   via a Cloudflare Cron Trigger on a schedule

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encrypted_yw_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  email TEXT,
  password_hash TEXT,
  description TEXT,
  class TEXT CHECK(class IS NULL OR class IN ('10.1', '10.2', '10.3')),
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'admin')),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  note_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  subject_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  extracted_text TEXT,
  summary TEXT,
  -- JSON array of base64 images, max 3 per note
  image_path TEXT,
  content TEXT,
  tags TEXT,
  author_class TEXT,
  -- links to parent note for multi-part series
  parent_note_id INTEGER,
  part_number INTEGER,
  status TEXT NOT NULL DEFAULT 'published',
  visibility TEXT NOT NULL DEFAULT 'everyone',
  scheduled_publish_at TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  admin_upvotes INTEGER NOT NULL DEFAULT 0,
  -- soft delete — set instead of hard deleting
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (parent_note_id) REFERENCES notes(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS note_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(note_id, user_id)
) STRICT;

CREATE TABLE IF NOT EXISTS admin_note_likes (
  note_id INTEGER NOT NULL,
  admin_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (note_id, admin_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT,
  topic TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- indexes
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
