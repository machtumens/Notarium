-- Accounts hardening: TOTP 2FA, academic-year tracking, and graduation.
-- The runtime source of truth is src/lib/db.ts (schema-on-boot); this mirrors
-- it for teams that run `npx wrangler d1 migrations apply notarium-db`.
-- SQLite has no "ADD COLUMN IF NOT EXISTS", so ignore "duplicate column" errors
-- if db.ts already added these on a booted instance.

ALTER TABLE users ADD COLUMN academic_year TEXT;
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_backup_codes TEXT;
ALTER TABLE users ADD COLUMN graduated INTEGER DEFAULT 0;

ALTER TABLE grade_classes ADD COLUMN academic_year TEXT;

CREATE INDEX IF NOT EXISTS idx_users_grade_class_id ON users(grade_class_id);
