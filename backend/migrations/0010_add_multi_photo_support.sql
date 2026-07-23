-- Migration: Add multi-photo support to notes table
-- Date: 2025-11-15

-- Add parent_note_id column for continuation notes
ALTER TABLE notes ADD COLUMN parent_note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE;

-- Add part_number column to track which part this is
ALTER TABLE notes ADD COLUMN part_number INTEGER;

-- Create index for parent_note_id for better query performance
CREATE INDEX IF NOT EXISTS idx_notes_parent_note_id ON notes(parent_note_id);

-- Note: image_path column already exists and will now store JSON array of base64 images
-- Existing single images will be automatically wrapped in an array by the backend
