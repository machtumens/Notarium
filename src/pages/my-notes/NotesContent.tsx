import { darkTheme } from '../../theme';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { Note, NotesBySubject } from './types';

interface NotesContentProps {
  loading: boolean;
  isMobile: boolean;
  notes: Note[];
  activeTab: 'published' | 'draft';
  setActiveTab: (tab: 'published' | 'draft') => void;
  setShowUploadModal: (open: boolean) => void;
  notesBySubject: NotesBySubject;
  saving: boolean;
  handlePublishNote: (noteId: number) => void;
  handleEdit: (note: Note) => void;
  handleDelete: (noteId: number) => void;
}

export default function NotesContent({
  loading,
  isMobile,
  notes,
  activeTab,
  setActiveTab,
  setShowUploadModal,
  notesBySubject,
  saving,
  handlePublishNote,
  handleEdit,
  handleDelete,
}: NotesContentProps) {
  return (
    <div
      style={{
        marginTop: isMobile ? '78px' : '92px',
        padding: isMobile ? '16px' : '24px',
      }}
    >
      {loading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
          }}
        >
          <LoadingSpinner message="Loading your notes..." size="lg" />
        </div>
      ) : (
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
          }}
        >
          {/* Header with Upload Button */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  marginBottom: '8px',
                  color: darkTheme.colors.textPrimary,
                }}
              >
                <i
                  className="fas fa-book"
                  style={{ marginRight: '12px', color: darkTheme.colors.accent }}
                ></i>
                My Notes
              </h1>
              <p
                style={{
                  color: darkTheme.colors.textSecondary,
                  marginBottom: 0,
                }}
              >
                {notes.length} {activeTab} notes
              </p>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              style={{
                padding: '12px 24px',
                background: darkTheme.colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: darkTheme.borderRadius.md,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: darkTheme.transitions.default,
              }}
              onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <i className="fas fa-plus"></i>
              Upload Note
            </button>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '24px',
              borderBottom: `2px solid ${darkTheme.colors.borderColor}`,
            }}
          >
            <button
              onClick={() => setActiveTab('published')}
              style={{
                padding: '12px 24px',
                background:
                  activeTab === 'published' ? darkTheme.colors.bgSecondary : 'transparent',
                color:
                  activeTab === 'published'
                    ? darkTheme.colors.accent
                    : darkTheme.colors.textSecondary,
                border: 'none',
                borderBottom:
                  activeTab === 'published' ? `3px solid ${darkTheme.colors.accent}` : 'none',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: '600',
                transition: darkTheme.transitions.default,
                borderRadius: `${darkTheme.borderRadius.md} ${darkTheme.borderRadius.md} 0 0`,
              }}
            >
              <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i>
              Published
            </button>
            <button
              onClick={() => setActiveTab('draft')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'draft' ? darkTheme.colors.bgSecondary : 'transparent',
                color:
                  activeTab === 'draft' ? darkTheme.colors.accent : darkTheme.colors.textSecondary,
                border: 'none',
                borderBottom:
                  activeTab === 'draft' ? `3px solid ${darkTheme.colors.accent}` : 'none',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: '600',
                transition: darkTheme.transitions.default,
                borderRadius: `${darkTheme.borderRadius.md} ${darkTheme.borderRadius.md} 0 0`,
              }}
            >
              <i className="fas fa-file-alt" style={{ marginRight: '8px' }}></i>
              Drafts
            </button>
          </div>

          {notes.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: darkTheme.colors.textSecondary,
              }}
            >
              <i
                className="fas fa-folder-open"
                style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.3 }}
              ></i>
              <p>You haven't uploaded any notes yet.</p>
            </div>
          ) : (
            Object.entries(notesBySubject).map(([subject, subjectNotes]) => (
              <div
                key={subject}
                style={{
                  marginBottom: '32px',
                  background: darkTheme.colors.bgSecondary,
                  borderRadius: darkTheme.borderRadius.lg,
                  padding: '24px',
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                }}
              >
                <h2
                  style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    marginBottom: '16px',
                    color: darkTheme.colors.textPrimary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span>{subject}</span>
                  <span
                    style={{
                      fontSize: '14px',
                      color: darkTheme.colors.textSecondary,
                      fontWeight: 'normal',
                    }}
                  >
                    ({subjectNotes.length})
                  </span>
                </h2>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {subjectNotes.map((note) => (
                    <div
                      key={note.id}
                      style={{
                        background: darkTheme.colors.bgTertiary,
                        borderRadius: darkTheme.borderRadius.md,
                        padding: '16px',
                        border: `1px solid ${darkTheme.colors.borderColor}`,
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = darkTheme.colors.accent;
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = darkTheme.colors.borderColor;
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <h3
                        style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          marginBottom: '8px',
                          color: darkTheme.colors.textPrimary,
                          wordBreak: 'break-word',
                        }}
                      >
                        {note.title}
                      </h3>

                      {note.summary && (
                        <p
                          style={{
                            fontSize: '13px',
                            color: darkTheme.colors.textSecondary,
                            marginBottom: '12px',
                            lineHeight: '1.5',
                          }}
                        >
                          {note.summary}
                        </p>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          gap: '12px',
                          marginBottom: '12px',
                          fontSize: '12px',
                          color: darkTheme.colors.textSecondary,
                        }}
                      >
                        <span>👤 {note.likes}</span>
                        <span>⭐ {note.admin_upvotes}</span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {activeTab === 'draft' && (
                          <button
                            onClick={() => handlePublishNote(note.id)}
                            disabled={saving}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: darkTheme.borderRadius.sm,
                              cursor: saving ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                              fontWeight: '500',
                              opacity: saving ? 0.6 : 1,
                            }}
                          >
                            <i className="fas fa-paper-plane" style={{ marginRight: '4px' }}></i>
                            Publish
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(note)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: darkTheme.colors.accent,
                            color: 'white',
                            border: 'none',
                            borderRadius: darkTheme.borderRadius.sm,
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500',
                          }}
                        >
                          <i className="fas fa-edit" style={{ marginRight: '4px' }}></i>
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: darkTheme.borderRadius.sm,
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500',
                          }}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
