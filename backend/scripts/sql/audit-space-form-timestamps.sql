-- How many stored values are still in SQLite's space-separated form.
--
-- GENERATED from migrations/0019_normalise_timestamps_to_iso.sql — one column
-- here per UPDATE there, so the audit and the backfill can never disagree
-- about what is in scope. Regenerate if 0019 changes.
--
-- Read-only. Run before the backfill to see the blast radius, after to confirm
-- it reached zero. The predicate matches 0019's exactly: non-NULL, no trailing
-- Z, and shaped like a date followed by a space. Values already in ISO do not
-- match and are never counted or touched.
--
-- SHAPE: one row, one column per checked field, named <table>__<column>. This
-- is deliberately NOT a UNION ALL of 42 selects — D1 rejects a compound SELECT
-- that wide ("too many terms in compound SELECT"). Scalar subqueries in a
-- single row have no such limit, and the caller reads the whole picture from
-- one result instead of paging through 42.
--
-- 42 fields across 22 tables.

SELECT
  (SELECT count(*) FROM users
    WHERE suspension_end_date IS NOT NULL AND suspension_end_date NOT LIKE '%Z' AND suspension_end_date LIKE '____-__-__ %'
  ) AS users__suspension_end_date,
  (SELECT count(*) FROM users
    WHERE last_seen_at IS NOT NULL AND last_seen_at NOT LIKE '%Z' AND last_seen_at LIKE '____-__-__ %'
  ) AS users__last_seen_at,
  (SELECT count(*) FROM users
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS users__created_at,
  (SELECT count(*) FROM users
    WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at LIKE '____-__-__ %'
  ) AS users__updated_at,
  (SELECT count(*) FROM subjects
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS subjects__created_at,
  (SELECT count(*) FROM notes
    WHERE scheduled_publish_at IS NOT NULL AND scheduled_publish_at NOT LIKE '%Z' AND scheduled_publish_at LIKE '____-__-__ %'
  ) AS notes__scheduled_publish_at,
  (SELECT count(*) FROM notes
    WHERE deleted_at IS NOT NULL AND deleted_at NOT LIKE '%Z' AND deleted_at LIKE '____-__-__ %'
  ) AS notes__deleted_at,
  (SELECT count(*) FROM notes
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS notes__created_at,
  (SELECT count(*) FROM notes
    WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at LIKE '____-__-__ %'
  ) AS notes__updated_at,
  (SELECT count(*) FROM note_likes
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS note_likes__created_at,
  (SELECT count(*) FROM admin_note_likes
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS admin_note_likes__created_at,
  (SELECT count(*) FROM chat_sessions
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS chat_sessions__created_at,
  (SELECT count(*) FROM chat_sessions
    WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at LIKE '____-__-__ %'
  ) AS chat_sessions__updated_at,
  (SELECT count(*) FROM chat_messages
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS chat_messages__created_at,
  (SELECT count(*) FROM refresh_tokens
    WHERE expires_at IS NOT NULL AND expires_at NOT LIKE '%Z' AND expires_at LIKE '____-__-__ %'
  ) AS refresh_tokens__expires_at,
  (SELECT count(*) FROM refresh_tokens
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS refresh_tokens__created_at,
  (SELECT count(*) FROM admin_activity_log
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS admin_activity_log__created_at,
  (SELECT count(*) FROM usage_stats
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS usage_stats__created_at,
  (SELECT count(*) FROM oauth_tokens
    WHERE expires_at IS NOT NULL AND expires_at NOT LIKE '%Z' AND expires_at LIKE '____-__-__ %'
  ) AS oauth_tokens__expires_at,
  (SELECT count(*) FROM oauth_tokens
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS oauth_tokens__created_at,
  (SELECT count(*) FROM oauth_tokens
    WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at LIKE '____-__-__ %'
  ) AS oauth_tokens__updated_at,
  (SELECT count(*) FROM oauth_states
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS oauth_states__created_at,
  (SELECT count(*) FROM oauth_states
    WHERE expires_at IS NOT NULL AND expires_at NOT LIKE '%Z' AND expires_at LIKE '____-__-__ %'
  ) AS oauth_states__expires_at,
  (SELECT count(*) FROM grade_classes
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS grade_classes__created_at,
  (SELECT count(*) FROM grade_classes
    WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at LIKE '____-__-__ %'
  ) AS grade_classes__updated_at,
  (SELECT count(*) FROM notifications
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS notifications__created_at,
  (SELECT count(*) FROM notification_reads
    WHERE read_at IS NOT NULL AND read_at NOT LIKE '%Z' AND read_at LIKE '____-__-__ %'
  ) AS notification_reads__read_at,
  (SELECT count(*) FROM quiz_attempts
    WHERE answered_at IS NOT NULL AND answered_at NOT LIKE '%Z' AND answered_at LIKE '____-__-__ %'
  ) AS quiz_attempts__answered_at,
  (SELECT count(*) FROM study_items
    WHERE due_at IS NOT NULL AND due_at NOT LIKE '%Z' AND due_at LIKE '____-__-__ %'
  ) AS study_items__due_at,
  (SELECT count(*) FROM study_items
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS study_items__created_at,
  (SELECT count(*) FROM study_items
    WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at LIKE '____-__-__ %'
  ) AS study_items__updated_at,
  (SELECT count(*) FROM test_sessions
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS test_sessions__created_at,
  (SELECT count(*) FROM tutor_profiles
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS tutor_profiles__created_at,
  (SELECT count(*) FROM tutor_profiles
    WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at LIKE '____-__-__ %'
  ) AS tutor_profiles__updated_at,
  (SELECT count(*) FROM tutor_availability
    WHERE starts_at IS NOT NULL AND starts_at NOT LIKE '%Z' AND starts_at LIKE '____-__-__ %'
  ) AS tutor_availability__starts_at,
  (SELECT count(*) FROM tutor_availability
    WHERE ends_at IS NOT NULL AND ends_at NOT LIKE '%Z' AND ends_at LIKE '____-__-__ %'
  ) AS tutor_availability__ends_at,
  (SELECT count(*) FROM tutor_availability
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS tutor_availability__created_at,
  (SELECT count(*) FROM tutor_sessions
    WHERE starts_at IS NOT NULL AND starts_at NOT LIKE '%Z' AND starts_at LIKE '____-__-__ %'
  ) AS tutor_sessions__starts_at,
  (SELECT count(*) FROM tutor_sessions
    WHERE ends_at IS NOT NULL AND ends_at NOT LIKE '%Z' AND ends_at LIKE '____-__-__ %'
  ) AS tutor_sessions__ends_at,
  (SELECT count(*) FROM tutor_sessions
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS tutor_sessions__created_at,
  (SELECT count(*) FROM tutor_sessions
    WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%Z' AND updated_at LIKE '____-__-__ %'
  ) AS tutor_sessions__updated_at,
  (SELECT count(*) FROM tutor_bookings
    WHERE created_at IS NOT NULL AND created_at NOT LIKE '%Z' AND created_at LIKE '____-__-__ %'
  ) AS tutor_bookings__created_at;
