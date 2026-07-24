export interface Subject {
  id: number;
  name: string;
  icon?: string;
  note_count?: number;
}

export interface UploadNoteModalProps {
  onClose: () => void;
  subjects: Subject[];
  onSuccess?: () => void;
  preselectedSubject?: number;
}

export type ViewMode = 'image' | 'text';

export type Visibility = 'everyone' | 'class';
