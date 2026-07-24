export interface AdminUser {
  id: number;
  name: string;
  display_name?: string;
  email: string;
  class: string;
  role: string;
  suspended?: number;
  suspension_end_date?: string;
  suspension_reason?: string;
  warning?: number;
  warning_message?: string;
  notes_count?: number;
  notes_uploaded?: number;
  points?: number;
  total_likes?: number;
  total_admin_upvotes?: number;
  photo_url?: string;
}

export interface AdminNote {
  id: number;
  title: string;
  description: string;
  author_name: string;
  author_id: number;
  subject: string;
  subject_id: number;
  subject_name?: string;
  image_path?: string;
  tags?: string | string[];
  likes: number;
  admin_upvotes: number;
  created_at: string;
  admin_liked?: boolean;
}
