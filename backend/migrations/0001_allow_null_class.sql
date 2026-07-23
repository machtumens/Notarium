-- Migration: Allow NULL values for class field (for admin users)
-- SQLite doesn't support modifying CHECK constraints, so we need to recreate the table

-- Step 1: Create new table with updated constraint
CREATE TABLE IF NOT EXISTS users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encrypted_yw_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  email TEXT,
  class TEXT CHECK(class IS NULL OR class IN ('10.1', '10.2', '10.3')),
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'admin')),
  notes_uploaded INTEGER NOT NULL DEFAULT 0,
  total_likes INTEGER NOT NULL DEFAULT 0,
  total_admin_upvotes INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- Step 2: Copy all data from old table to new table
INSERT INTO users_new (
  id, encrypted_yw_id, display_name, photo_url, email, class, role,
  notes_uploaded, total_likes, total_admin_upvotes, suspended, created_at, updated_at
)
SELECT
  id, encrypted_yw_id, display_name, photo_url, email, class, role,
  notes_uploaded, total_likes, total_admin_upvotes, suspended, created_at, updated_at
FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table to original name
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_encrypted_yw_id ON users(encrypted_yw_id);
