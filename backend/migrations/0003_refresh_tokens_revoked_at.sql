-- 0003 — W2.1: `revoked_at` retires a refresh row (rotation, logout, reuse detection) instead of
-- deleting it, so a replayed token can be recognised. Same once-per-database rule as 0002.
ALTER TABLE refresh_tokens ADD COLUMN revoked_at DATETIME;
