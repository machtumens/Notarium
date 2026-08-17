-- Widen the study_items dedup key from (user_id, question_hash) to
-- (user_id, note_id, question_hash).
--
-- Why: upsertStudyItem now looks up the existing SRS card by note as well as by
-- question, so the same question wording asked from two different notes gets two
-- separate cards instead of collapsing into one row stuck on the first note's
-- note_id. With the old narrower UNIQUE still in place, that second INSERT would
-- fail the constraint and surface as a 500.
--
-- SQLite cannot drop a table constraint in place, so this is a rebuild.
-- The new key is strictly WEAKER than the old one (it permits a superset of
-- rows), so every existing row copies over without conflict — no dedup pass and
-- no data loss. Note that under SQLite semantics NULLs compare distinct in a
-- UNIQUE constraint, so note-less cards are deduped by the handler's
-- `note_id IS ?` lookup rather than by the constraint.

ALTER TABLE study_items RENAME TO study_items_old;

CREATE TABLE study_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note_id INTEGER,
  question_text TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  ease_factor REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  due_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, note_id, question_hash)
);

INSERT INTO study_items
  (id, user_id, note_id, question_text, question_hash,
   ease_factor, interval_days, repetitions, due_at, created_at, updated_at)
SELECT
  id, user_id, note_id, question_text, question_hash,
  ease_factor, interval_days, repetitions, due_at, created_at, updated_at
FROM study_items_old;

DROP TABLE study_items_old;

CREATE INDEX IF NOT EXISTS idx_study_items_user_due
  ON study_items(user_id, due_at);
