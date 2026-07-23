-- Migration: Add suspension end date and reason fields
-- Allows admins to suspend users for specific durations with custom warnings

-- Add suspension_end_date field
ALTER TABLE users ADD COLUMN suspension_end_date TEXT;

-- Add suspension_reason field
ALTER TABLE users ADD COLUMN suspension_reason TEXT;

-- Verify the changes
SELECT 'Migration complete' as status;
