import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import api from '../../lib/api';
import type { Note, Subject, NotesBySubject } from './types';

export function useMyNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'published' | 'draft'>('published');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editScheduledDate, setEditScheduledDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [showFoundersModal, setShowFoundersModal] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the effect; behavior-preserving
    loadSubjects();
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the effect; behavior-preserving
    loadMyNotes();
  }, [activeTab]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
      if (window.innerWidth >= 640) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const loadSubjects = async () => {
    try {
      const response = await api.request('/api/subjects');
      setSubjects(response.subjects || []);
    } catch (err) {
      logger.error('my-notes', 'Failed to load subjects', err);
      toast.error('Failed to load subjects.');
    }
  };

  const loadMyNotes = async () => {
    try {
      setLoading(true);
      const response = await api.request(`/api/notes/my-notes?status=${activeTab}`);
      setNotes(response.notes || []);
    } catch (err) {
      logger.error('my-notes', 'Failed to load notes', err);
      toast.error('Failed to load your notes. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = () => {
    loadMyNotes();
    setShowUploadModal(false);
  };

  const handlePublishNote = async (noteId: number) => {
    try {
      setSaving(true);
      await api.request(`/api/notes/${noteId}/publish`, {
        method: 'POST',
      });
      loadMyNotes();
      toast.success('Note published successfully!');
    } catch (err) {
      logger.error('my-notes', 'Failed to publish note', err);
      toast.error('Failed to publish note.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (note: Note) => {
    setEditingNote(note);
    setEditTitle(note.title);
    setEditContent(note.extracted_text || '');
    setEditTags(note.tags || '');
  };

  const handleSave = async () => {
    if (!editingNote) return;

    try {
      setSaving(true);
      await api.request(`/api/notes/${editingNote.id}`, {
        method: 'PUT',
        body: {
          title: editTitle,
          extracted_text: editContent,
          tags: editTags,
        },
      });

      setNotes(
        notes.map((note) =>
          note.id === editingNote.id
            ? { ...note, title: editTitle, extracted_text: editContent, tags: editTags }
            : note,
        ),
      );

      setEditingNote(null);
    } catch (err) {
      logger.error('my-notes', 'Failed to save note', err);
      toast.error('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: number) => {
    if (!confirm('Are you sure you want to delete this note? Your points will decrease by 1.')) {
      return;
    }

    try {
      await api.request(`/api/notes/${noteId}`, {
        method: 'DELETE',
      });

      setNotes(notes.filter((note) => note.id !== noteId));
    } catch (err) {
      logger.error('my-notes', 'Failed to delete note', err);
      toast.error('Failed to delete note.');
    }
  };

  const notesBySubject: NotesBySubject = notes.reduce((acc, note) => {
    const subject = note.subject_name || note.subject || 'Other';
    if (!acc[subject]) {
      acc[subject] = [];
    }
    acc[subject].push(note);
    return acc;
  }, {} as NotesBySubject);

  return {
    notes,
    subjects,
    loading,
    activeTab,
    setActiveTab,
    showUploadModal,
    setShowUploadModal,
    editingNote,
    setEditingNote,
    editTitle,
    setEditTitle,
    editContent,
    setEditContent,
    editTags,
    setEditTags,
    editScheduledDate,
    setEditScheduledDate,
    saving,
    showProfileEditor,
    setShowProfileEditor,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    isMobile,
    showFoundersModal,
    setShowFoundersModal,
    closeMobileMenu,
    handleUploadSuccess,
    handlePublishNote,
    handleEdit,
    handleSave,
    handleDelete,
    notesBySubject,
  };
}
