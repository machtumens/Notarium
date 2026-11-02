-- Archive every note written before the new cohort arrives (2 Nov 2026).
-- Nothing is deleted: notes move to status 'archived', which every public list already skips
-- (they all filter on status = 'published'). Authors still see their own under My notes, marked Archived.
--
-- Run (after a fresh `npx wrangler d1 export` backup), from backend/:
--   npx wrangler d1 execute notarium-db --remote --file scripts/archive-notes-2026-11.sql
--
-- Undo, exactly (restores each note's old status, drafts included):
--   UPDATE notes SET status = (SELECT a.status FROM notes_archive_2026_11 a WHERE a.id = notes.id)
--    WHERE id IN (SELECT id FROM notes_archive_2026_11);

CREATE TABLE IF NOT EXISTS notes_archive_2026_11 (id INTEGER PRIMARY KEY, status TEXT, archived_at TEXT);

INSERT OR IGNORE INTO notes_archive_2026_11 (id, status, archived_at)
  SELECT id, status, strftime('%Y-%m-%dT%H:%M:%SZ','now') FROM notes
   WHERE COALESCE(status, '') != 'archived' AND deleted_at IS NULL;

UPDATE notes SET status = 'archived'
 WHERE id IN (SELECT id FROM notes_archive_2026_11);
