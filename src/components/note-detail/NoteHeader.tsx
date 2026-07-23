import React from 'react';
import { Note } from '../../pages/SubjectNotesPage';
import { darkTheme } from '../../theme';

interface NoteHeaderProps {
  note: Note;
  onClose: () => void;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const NoteHeader: React.FC<NoteHeaderProps> = ({ note, onClose }) => {
  return (
    <>
      {/* Top close button bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '24px',
          borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
          position: 'sticky',
          top: 0,
          background: darkTheme.colors.bgPrimary,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ fontSize: '20px', fontFamily: 'Playfair Display, serif', margin: 0 }}>
            Note Details
          </h2>
        </div>
        <button
          onClick={onClose}
          style={{
            fontSize: '24px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: darkTheme.colors.textSecondary,
          }}
        >
          ×
        </button>
      </div>

      {/* Title */}
      <div style={{ padding: '32px', paddingBottom: '0' }}>
        <h1
          style={{
            fontSize: '28px',
            fontFamily: 'Playfair Display, serif',
            margin: '0 0 16px 0',
            color: darkTheme.colors.textPrimary,
          }}
        >
          {note.title}
        </h1>

        {/* Author Info */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              background: note.author_photo
                ? `url('${note.author_photo}') center/cover`
                : `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '18px',
            }}
          >
            {!note.author_photo && note.author_name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>{note.author_name}</div>
            <div
              style={{
                fontSize: '13px',
                color: darkTheme.colors.textSecondary,
                background: `${darkTheme.colors.accent}20`,
                padding: '4px 10px',
                borderRadius: '12px',
                display: 'inline-block',
                marginTop: '4px',
              }}
            >
              Class {note.author_class}
            </div>
          </div>
          <div
            style={{ marginLeft: 'auto', fontSize: '13px', color: darkTheme.colors.textSecondary }}
          >
            {formatDate(note.created_at)}
          </div>
        </div>
      </div>
    </>
  );
};
