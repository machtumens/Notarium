-- wipe all user-generated data; subjects stay (they are system config)
-- run: npx wrangler d1 execute notarium-db --file=backend/reset-data.sql

DELETE FROM chat_messages;
DELETE FROM chat_sessions;
DELETE FROM admin_note_likes;
DELETE FROM note_likes;
DELETE FROM notes;
DELETE FROM admin_activity_log;
DELETE FROM usage_stats;
DELETE FROM refresh_tokens;
DELETE FROM users;

-- reset autoincrement counters
DELETE FROM sqlite_sequence WHERE name IN (
  'users', 'notes', 'note_likes', 'chat_sessions',
  'chat_messages', 'admin_note_likes', 'refresh_tokens',
  'admin_activity_log', 'usage_stats'
);
