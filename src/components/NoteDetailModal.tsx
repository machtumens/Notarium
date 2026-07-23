import { useState, useEffect } from 'react';
import { Note } from '../pages/SubjectNotesPage';
import { User } from '../lib/api';
import { darkTheme } from '../theme';
import { useNoteInteractions } from '../hooks/useNoteInteractions';
import { useStudyFeatures } from '../hooks/useStudyFeatures';
import { NoteHeader } from './note-detail/NoteHeader';
import { NoteContent } from './note-detail/NoteContent';
import { NoteActions } from './note-detail/NoteActions';
import { SummaryDisplay } from './note-detail/SummaryDisplay';
import { CloseButton } from './note-detail/CloseButton';

interface NoteDetailModalProps {
  note: Note | null;
  onClose: () => void;
  onLike?: (noteId: number) => void;
  currentUser?: User | null;
}

export default function NoteDetailModal({
  note,
  onClose,
  onLike,
  currentUser,
}: NoteDetailModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  const { isLiked, likeCount, handleLike } = useNoteInteractions({
    noteId: note?.id ?? 0,
    initialLiked: note?.liked_by_me || false,
    initialLikeCount: note?.likes ?? 0,
  });

  const { summary, isGeneratingSummary, generateSummary } = useStudyFeatures({
    noteId: note?.id ?? 0,
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!note) return null;

  const images = (() => {
    if (!note.image) return [];
    if (typeof note.image === 'string') {
      if (note.image.startsWith('[')) {
        try {
          return JSON.parse(note.image);
        } catch {
          return [note.image];
        }
      }
      return [note.image];
    }
    if (Array.isArray(note.image)) {
      return note.image;
    }
    return [];
  })();

  const handleGenerateSummary = async () => {
    await generateSummary({
      title: note.title,
      description: note.description,
      content: note.content,
    });
  };

  const handleLikeWithCallback = () => {
    handleLike(onLike);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: darkTheme.colors.bgPrimary,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '700px',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: darkTheme.colors.textPrimary,
          boxShadow: darkTheme.shadows.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with close button */}
        <NoteHeader note={note} onClose={onClose} />

        {/* Note content with images and text */}
        <NoteContent
          title={note.title}
          description={note.description}
          content={note.content}
          images={images}
          tags={note.tags}
          isMobile={isMobile}
        />

        {/* Like and action buttons */}
        <NoteActions
          isLiked={isLiked}
          likeCount={likeCount}
          onLike={handleLikeWithCallback}
          onGenerateSummary={handleGenerateSummary}
          isGeneratingSummary={isGeneratingSummary}
        />

        {/* AI Summary Display */}
        <SummaryDisplay summary={summary} isMobile={isMobile} />

        {/* Close button */}
        <CloseButton onClose={onClose} />
      </div>
    </div>
  );
}
