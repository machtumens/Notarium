-- Add warning tracking fields
ALTER TABLE users ADD COLUMN warning_first_viewed TEXT;
ALTER TABLE users ADD COLUMN warning_view_count INTEGER DEFAULT 0;
