-- Normalise every stored timestamp to ISO-8601 UTC with a trailing Z.
--
-- WHY: the app wrote two formats. SQLite's datetime-now yields
-- "2026-08-27 08:53:06" (space, no Z), which a browser parses as LOCAL time;
-- .toISOString() yields "...T...Z", parsed as UTC. The same instant therefore
-- rendered hours apart with no error — for a UTC+7 user base, a seven-hour
-- skew that just looked like a different plausible time.
--
-- They are also not comparable as strings on the same date: 'T' (0x54) sorts
-- after ' ' (0x20). Read thresholds in backend/src moved to the same strftime
-- form in the same change, or same-day comparisons would have inverted.
--
-- SAFETY: every statement is idempotent — the WHERE clause matches only the
-- space form, so re-running is a no-op and rows already in ISO are untouched.
--
-- DELIBERATELY EXCLUDED: users.last_study_date and usage_stats.stat_date are
-- DATE-only (YYYY-MM-DD) and must stay that way; the streak logic compares
-- them as calendar dates, not instants.


UPDATE users
   SET suspension_end_date = strftime('%Y-%m-%dT%H:%M:%SZ', suspension_end_date)
 WHERE suspension_end_date IS NOT NULL
   AND suspension_end_date NOT LIKE '%Z'
   AND suspension_end_date LIKE '____-__-__ %';

UPDATE users
   SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', last_seen_at)
 WHERE last_seen_at IS NOT NULL
   AND last_seen_at NOT LIKE '%Z'
   AND last_seen_at LIKE '____-__-__ %';

UPDATE users
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE users
   SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', updated_at)
 WHERE updated_at IS NOT NULL
   AND updated_at NOT LIKE '%Z'
   AND updated_at LIKE '____-__-__ %';

UPDATE subjects
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE notes
   SET scheduled_publish_at = strftime('%Y-%m-%dT%H:%M:%SZ', scheduled_publish_at)
 WHERE scheduled_publish_at IS NOT NULL
   AND scheduled_publish_at NOT LIKE '%Z'
   AND scheduled_publish_at LIKE '____-__-__ %';

UPDATE notes
   SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', deleted_at)
 WHERE deleted_at IS NOT NULL
   AND deleted_at NOT LIKE '%Z'
   AND deleted_at LIKE '____-__-__ %';

UPDATE notes
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE notes
   SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', updated_at)
 WHERE updated_at IS NOT NULL
   AND updated_at NOT LIKE '%Z'
   AND updated_at LIKE '____-__-__ %';

UPDATE note_likes
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE admin_note_likes
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE chat_sessions
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE chat_sessions
   SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', updated_at)
 WHERE updated_at IS NOT NULL
   AND updated_at NOT LIKE '%Z'
   AND updated_at LIKE '____-__-__ %';

UPDATE chat_messages
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE refresh_tokens
   SET expires_at = strftime('%Y-%m-%dT%H:%M:%SZ', expires_at)
 WHERE expires_at IS NOT NULL
   AND expires_at NOT LIKE '%Z'
   AND expires_at LIKE '____-__-__ %';

UPDATE refresh_tokens
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE admin_activity_log
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE usage_stats
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE oauth_tokens
   SET expires_at = strftime('%Y-%m-%dT%H:%M:%SZ', expires_at)
 WHERE expires_at IS NOT NULL
   AND expires_at NOT LIKE '%Z'
   AND expires_at LIKE '____-__-__ %';

UPDATE oauth_tokens
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE oauth_tokens
   SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', updated_at)
 WHERE updated_at IS NOT NULL
   AND updated_at NOT LIKE '%Z'
   AND updated_at LIKE '____-__-__ %';

UPDATE oauth_states
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE oauth_states
   SET expires_at = strftime('%Y-%m-%dT%H:%M:%SZ', expires_at)
 WHERE expires_at IS NOT NULL
   AND expires_at NOT LIKE '%Z'
   AND expires_at LIKE '____-__-__ %';

UPDATE grade_classes
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE grade_classes
   SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', updated_at)
 WHERE updated_at IS NOT NULL
   AND updated_at NOT LIKE '%Z'
   AND updated_at LIKE '____-__-__ %';

UPDATE notifications
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE notification_reads
   SET read_at = strftime('%Y-%m-%dT%H:%M:%SZ', read_at)
 WHERE read_at IS NOT NULL
   AND read_at NOT LIKE '%Z'
   AND read_at LIKE '____-__-__ %';

UPDATE quiz_attempts
   SET answered_at = strftime('%Y-%m-%dT%H:%M:%SZ', answered_at)
 WHERE answered_at IS NOT NULL
   AND answered_at NOT LIKE '%Z'
   AND answered_at LIKE '____-__-__ %';

UPDATE study_items
   SET due_at = strftime('%Y-%m-%dT%H:%M:%SZ', due_at)
 WHERE due_at IS NOT NULL
   AND due_at NOT LIKE '%Z'
   AND due_at LIKE '____-__-__ %';

UPDATE study_items
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE study_items
   SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', updated_at)
 WHERE updated_at IS NOT NULL
   AND updated_at NOT LIKE '%Z'
   AND updated_at LIKE '____-__-__ %';

UPDATE test_sessions
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE tutor_profiles
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE tutor_profiles
   SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', updated_at)
 WHERE updated_at IS NOT NULL
   AND updated_at NOT LIKE '%Z'
   AND updated_at LIKE '____-__-__ %';

UPDATE tutor_availability
   SET starts_at = strftime('%Y-%m-%dT%H:%M:%SZ', starts_at)
 WHERE starts_at IS NOT NULL
   AND starts_at NOT LIKE '%Z'
   AND starts_at LIKE '____-__-__ %';

UPDATE tutor_availability
   SET ends_at = strftime('%Y-%m-%dT%H:%M:%SZ', ends_at)
 WHERE ends_at IS NOT NULL
   AND ends_at NOT LIKE '%Z'
   AND ends_at LIKE '____-__-__ %';

UPDATE tutor_availability
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE tutor_sessions
   SET starts_at = strftime('%Y-%m-%dT%H:%M:%SZ', starts_at)
 WHERE starts_at IS NOT NULL
   AND starts_at NOT LIKE '%Z'
   AND starts_at LIKE '____-__-__ %';

UPDATE tutor_sessions
   SET ends_at = strftime('%Y-%m-%dT%H:%M:%SZ', ends_at)
 WHERE ends_at IS NOT NULL
   AND ends_at NOT LIKE '%Z'
   AND ends_at LIKE '____-__-__ %';

UPDATE tutor_sessions
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';

UPDATE tutor_sessions
   SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', updated_at)
 WHERE updated_at IS NOT NULL
   AND updated_at NOT LIKE '%Z'
   AND updated_at LIKE '____-__-__ %';

UPDATE tutor_bookings
   SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
 WHERE created_at IS NOT NULL
   AND created_at NOT LIKE '%Z'
   AND created_at LIKE '____-__-__ %';
