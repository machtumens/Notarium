-- Focus subjects: the short list of subjects a student says they care about,
-- set in the profile step after Google sign-in and editable in Customize.
--
-- Stored as a JSON array of subject ids on the user row rather than a join
-- table: it is a per-user preference of at most five ids, only ever read
-- alongside the user, and never queried across users. Ids are validated
-- against the subjects table on write; a subject deleted later leaves a
-- stale id that the client drops when it maps ids to names.
ALTER TABLE users ADD COLUMN focus_subject_ids TEXT;
