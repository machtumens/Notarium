export interface Note {
  id: number;
  title: string;
  subject: string;
  subject_name: string;
  subject_id: number;
  extracted_text?: string;
  summary?: string;
  tags?: string;
  likes: number;
  admin_upvotes: number;
  created_at: string;
  image_path?: string;
  status?: string;
  scheduled_publish_at?: string;
}

export interface Subject {
  id: number;
  name: string;
  icon: string;
  note_count: number;
}

export interface NotesBySubject {
  [subject: string]: Note[];
}
