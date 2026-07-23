-- Reset all user stats to 0 (excluding admins)
-- New system: 1 note = 1 diamond, admin upvotes = 4.5 points
UPDATE users SET notes_uploaded = 0, total_likes = 0, total_admin_upvotes = 0, diamonds = 0 WHERE role != 'admin';
