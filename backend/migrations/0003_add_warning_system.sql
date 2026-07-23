-- Migration: Add warning system separate from suspension
-- Warnings show a yellow banner but don't block actions
-- Suspensions show red banner and block all actions

-- Add warning field (0 = no warning, 1 = has warning)
ALTER TABLE users ADD COLUMN warning INTEGER DEFAULT 0;

-- Add warning message field
ALTER TABLE users ADD COLUMN warning_message TEXT;

-- Verify the changes
SELECT 'Warning system migration complete' as status;
