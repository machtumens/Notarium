-- Admin role split: refine role='admin' with an admin_role sub-role.
-- The role column CHECK constraint is intentionally left unchanged; admins keep
-- role='admin' and admin_role distinguishes moderator / technical / super.
-- Also adds notes.featured (moderator feature-note, Phase 2) and the metrics
-- tables (Phase 3). SQLite has no "ADD COLUMN IF NOT EXISTS", so ignore
-- "duplicate column" errors if db.ts already added these on a booted instance.

ALTER TABLE users ADD COLUMN admin_role TEXT;
ALTER TABLE notes ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;

UPDATE users SET admin_role = 'super' WHERE role = 'admin';

CREATE TABLE IF NOT EXISTS request_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  path TEXT,
  method TEXT,
  status INTEGER,
  duration_ms INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS idx_request_metrics_ts ON request_metrics(ts);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  provider TEXT,
  endpoint TEXT,
  ok INTEGER,
  duration_ms INTEGER,
  tokens INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS idx_ai_usage_ts ON ai_usage(ts);
