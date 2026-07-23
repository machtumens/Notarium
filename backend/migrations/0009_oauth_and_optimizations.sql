-- google oauth support and query optimizations
-- run: npx wrangler d1 execute notarium-db --file=backend/migrations/0009_oauth_and_optimizations.sql

ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN oauth_provider TEXT DEFAULT 'local';
ALTER TABLE users ADD COLUMN last_seen_at TEXT;

ALTER TABLE notes ADD COLUMN deleted_at TEXT;

-- unique index on google_id (partial — only for rows that have one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
  ON users(google_id) WHERE google_id IS NOT NULL;

-- leaderboard query: active non-suspended users sorted by score
CREATE INDEX IF NOT EXISTS idx_users_stats
  ON users(total_likes DESC, total_admin_upvotes DESC) WHERE suspended = 0;

-- note listing: browsing by subject with filters
CREATE INDEX IF NOT EXISTS idx_notes_browse
  ON notes(subject_id, status, visibility, created_at DESC) WHERE deleted_at IS NULL;

-- admin user lookup by email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- soft-delete index so listing queries skip deleted notes cheaply
CREATE INDEX IF NOT EXISTS idx_notes_active
  ON notes(deleted_at) WHERE deleted_at IS NULL;
