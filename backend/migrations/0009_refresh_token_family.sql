-- One rotation chain per device. Logging out, or replaying a spent refresh
-- token, revokes a family rather than every session the user has.
-- Nullable so the ALTER works on a table that already holds rows (it does not
-- in production — refresh_tokens has never been written to).
ALTER TABLE refresh_tokens ADD COLUMN family TEXT;
