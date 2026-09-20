-- 0004 — data backfill the old runtime re-ran on every cold start: notes written before `status`
-- and `visibility` existed (or by a client that sent the string "undefined") become published /
-- visible to everyone, which is what every reader already assumes. Idempotent.
UPDATE notes SET status = 'published' WHERE status IS NULL OR status = '' OR status = 'undefined';
UPDATE notes SET visibility = 'everyone' WHERE visibility IS NULL OR visibility = '' OR visibility = 'undefined';
