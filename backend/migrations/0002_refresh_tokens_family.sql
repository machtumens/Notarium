-- 0002 — W2.1: `family` groups the rotation chain of one login (reuse of a rotated token revokes
-- the whole family). One ALTER per file: SQLite cannot ADD COLUMN IF NOT EXISTS, so this file
-- applies exactly once per database and `d1_migrations` remembers that. Production still lacks
-- the column (verified 20 Sep 2026 against sqlite_master); a database that already has it must
-- have this file marked applied by hand — see MIGRATION_GUIDE.md.
ALTER TABLE refresh_tokens ADD COLUMN family TEXT;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family);
