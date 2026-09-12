-- Stop NEW rows being written in SQLite's space-separated datetime form.
--
-- WHY THIS EXISTS: 0019 normalised every timestamp already in the database, but
-- it could not stop more arriving. The column DEFAULTs are still
-- `(datetime('now'))`, which yields "2026-08-31 11:48:10" — no `T`, no `Z` —
-- and a browser parses that as LOCAL time. For a UTC+7 school that is a silent
-- seven-hour skew that renders as a plausible wrong time rather than an error,
-- and 'T' (0x54) sorts after ' ' (0x20) so mixed-format rows do not compare.
-- 0019 cleaned the water; this closes the tap.
--
-- WHY TRIGGERS AND NOT NEW DEFAULTS: SQLite cannot ALTER a column default. The
-- only way to change one is to rebuild the table — copy, drop, rename, then
-- recreate every index and foreign key. Doing that to 18 live tables (including
-- users and notes) to change a default is a large amount of risk for the
-- benefit. A trigger fixes the value with no schema surgery.
--
-- COST: the WHEN clause runs per insert but the UPDATE only fires for a row
-- that actually landed on the bad default. Any INSERT that passes SQL_NOW_ISO
-- explicitly — which is what backend/src/lib/time.ts asks callers to do — is
-- already ISO, fails the WHEN, and pays nothing beyond the check.
--
-- SAFETY: idempotent. DROP ... IF EXISTS precedes each CREATE, and the WHEN
-- clause matches only the space form, so re-running changes nothing.
--
-- DELIBERATELY EXCLUDED: users.last_study_date and usage_stats.stat_date are
-- DATE-only (YYYY-MM-DD) and must stay that way — the streak logic compares
-- them as calendar dates, not instants. The users table was already rebuilt
-- with ISO defaults and needs no trigger.

DROP TRIGGER IF EXISTS trg_subjects_created_at_iso;
CREATE TRIGGER trg_subjects_created_at_iso
AFTER INSERT ON subjects
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE subjects
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_notes_created_at_iso;
CREATE TRIGGER trg_notes_created_at_iso
AFTER INSERT ON notes
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE notes
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_notes_updated_at_iso;
CREATE TRIGGER trg_notes_updated_at_iso
AFTER INSERT ON notes
FOR EACH ROW
WHEN NEW.updated_at IS NOT NULL
 AND NEW.updated_at NOT LIKE '%Z'
 AND NEW.updated_at LIKE '____-__-__ %'
BEGIN
  UPDATE notes
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_note_likes_created_at_iso;
CREATE TRIGGER trg_note_likes_created_at_iso
AFTER INSERT ON note_likes
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE note_likes
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_admin_note_likes_created_at_iso;
CREATE TRIGGER trg_admin_note_likes_created_at_iso
AFTER INSERT ON admin_note_likes
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE admin_note_likes
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_chat_sessions_created_at_iso;
CREATE TRIGGER trg_chat_sessions_created_at_iso
AFTER INSERT ON chat_sessions
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE chat_sessions
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at_iso;
CREATE TRIGGER trg_chat_sessions_updated_at_iso
AFTER INSERT ON chat_sessions
FOR EACH ROW
WHEN NEW.updated_at IS NOT NULL
 AND NEW.updated_at NOT LIKE '%Z'
 AND NEW.updated_at LIKE '____-__-__ %'
BEGIN
  UPDATE chat_sessions
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_chat_messages_created_at_iso;
CREATE TRIGGER trg_chat_messages_created_at_iso
AFTER INSERT ON chat_messages
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE chat_messages
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_refresh_tokens_created_at_iso;
CREATE TRIGGER trg_refresh_tokens_created_at_iso
AFTER INSERT ON refresh_tokens
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE refresh_tokens
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_admin_activity_log_created_at_iso;
CREATE TRIGGER trg_admin_activity_log_created_at_iso
AFTER INSERT ON admin_activity_log
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE admin_activity_log
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_usage_stats_created_at_iso;
CREATE TRIGGER trg_usage_stats_created_at_iso
AFTER INSERT ON usage_stats
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE usage_stats
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_request_metrics_ts_iso;
CREATE TRIGGER trg_request_metrics_ts_iso
AFTER INSERT ON request_metrics
FOR EACH ROW
WHEN NEW.ts IS NOT NULL
 AND NEW.ts NOT LIKE '%Z'
 AND NEW.ts LIKE '____-__-__ %'
BEGIN
  UPDATE request_metrics
     SET ts = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.ts)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_ai_usage_ts_iso;
CREATE TRIGGER trg_ai_usage_ts_iso
AFTER INSERT ON ai_usage
FOR EACH ROW
WHEN NEW.ts IS NOT NULL
 AND NEW.ts NOT LIKE '%Z'
 AND NEW.ts LIKE '____-__-__ %'
BEGIN
  UPDATE ai_usage
     SET ts = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.ts)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_grade_classes_created_at_iso;
CREATE TRIGGER trg_grade_classes_created_at_iso
AFTER INSERT ON grade_classes
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE grade_classes
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_grade_classes_updated_at_iso;
CREATE TRIGGER trg_grade_classes_updated_at_iso
AFTER INSERT ON grade_classes
FOR EACH ROW
WHEN NEW.updated_at IS NOT NULL
 AND NEW.updated_at NOT LIKE '%Z'
 AND NEW.updated_at LIKE '____-__-__ %'
BEGIN
  UPDATE grade_classes
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_notifications_created_at_iso;
CREATE TRIGGER trg_notifications_created_at_iso
AFTER INSERT ON notifications
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE notifications
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_notification_reads_read_at_iso;
CREATE TRIGGER trg_notification_reads_read_at_iso
AFTER INSERT ON notification_reads
FOR EACH ROW
WHEN NEW.read_at IS NOT NULL
 AND NEW.read_at NOT LIKE '%Z'
 AND NEW.read_at LIKE '____-__-__ %'
BEGIN
  UPDATE notification_reads
     SET read_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.read_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_test_sessions_created_at_iso;
CREATE TRIGGER trg_test_sessions_created_at_iso
AFTER INSERT ON test_sessions
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE test_sessions
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_tutor_profiles_created_at_iso;
CREATE TRIGGER trg_tutor_profiles_created_at_iso
AFTER INSERT ON tutor_profiles
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE tutor_profiles
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_tutor_profiles_updated_at_iso;
CREATE TRIGGER trg_tutor_profiles_updated_at_iso
AFTER INSERT ON tutor_profiles
FOR EACH ROW
WHEN NEW.updated_at IS NOT NULL
 AND NEW.updated_at NOT LIKE '%Z'
 AND NEW.updated_at LIKE '____-__-__ %'
BEGIN
  UPDATE tutor_profiles
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_tutor_availability_created_at_iso;
CREATE TRIGGER trg_tutor_availability_created_at_iso
AFTER INSERT ON tutor_availability
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE tutor_availability
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_tutor_sessions_created_at_iso;
CREATE TRIGGER trg_tutor_sessions_created_at_iso
AFTER INSERT ON tutor_sessions
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE tutor_sessions
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_tutor_sessions_updated_at_iso;
CREATE TRIGGER trg_tutor_sessions_updated_at_iso
AFTER INSERT ON tutor_sessions
FOR EACH ROW
WHEN NEW.updated_at IS NOT NULL
 AND NEW.updated_at NOT LIKE '%Z'
 AND NEW.updated_at LIKE '____-__-__ %'
BEGIN
  UPDATE tutor_sessions
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.updated_at)
   WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_tutor_bookings_created_at_iso;
CREATE TRIGGER trg_tutor_bookings_created_at_iso
AFTER INSERT ON tutor_bookings
FOR EACH ROW
WHEN NEW.created_at IS NOT NULL
 AND NEW.created_at NOT LIKE '%Z'
 AND NEW.created_at LIKE '____-__-__ %'
BEGIN
  UPDATE tutor_bookings
     SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', NEW.created_at)
   WHERE rowid = NEW.rowid;
END;
