-- Firebase Auth migration (Phase 1): link a Firebase account to each local user.
-- Runtime source of truth is src/lib/db.ts (schema-on-boot); this mirrors it.
-- SQLite has no "ADD COLUMN IF NOT EXISTS", so ignore "duplicate column" errors
-- if db.ts already added this on a booted instance.

ALTER TABLE users ADD COLUMN firebase_uid TEXT;

-- NULLs are distinct in SQLite, so this tolerates many not-yet-linked users.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
