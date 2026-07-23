import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../lib/api';
import { logger } from '../lib/logger';
import LoadingSpinner from '../components/LoadingSpinner';
import UploadNoteModal from '../components/UploadNoteModal';
import NoteDetailModal from '../components/NoteDetailModal';
import GradeClassFilter from '../components/GradeClassFilter';
import { useAuth } from '../App';
import { Subject } from './SubjectsPage';
import { darkTheme } from '../theme';

export interface Note {
  id: number;
  title: string;
  description: string;
  content?: string;
  author_name: string;
  author_class: string;
  author_photo?: string;
  subject_id: number;
  image?: string;
  tags?: string[];
  likes: number;
  admin_upvotes: number;
  created_at: string;
  liked_by_me?: boolean;
  upvoted_by_me?: boolean;
  parent_note_id?: number | null;
  part_number?: number | null;
}

interface SubjectNotesPageProps {
  subject: Subject | null;
  onBack: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function SubjectNotesPage({
  subject,
  onBack,
  isLoading,
  setIsLoading,
}: SubjectNotesPageProps) {
  const { user: currentUser } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<'my_class' | 'my_grade'>('my_grade');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the effect; behavior-preserving
    loadNotes();
  }, [subject, gradeFilter]);

  const loadNotes = async () => {
    if (!subject) return;

    try {
      setIsLoading(true);

      const filterParam = currentUser?.grade ? `?filter=${gradeFilter}` : '';
      const response = await api.request(`/api/notes/subject/${subject.id}${filterParam}`, {
        method: 'GET',
      });

      if (response.notes) {
        const loadedNotes: Note[] = response.notes.map((note: Note) => ({
          id: note.id,
          title: note.title,
          description: note.description || note.summary,
          content: note.extracted_text,
          author_name: note.author_name || 'Anonymous',
          author_class: note.author_class || 'Unknown',
          author_photo: note.author_photo,
          subject_id: note.subject_id,
          image: note.image_path || '📄', // Use uploaded image or default icon
          tags: note.tags
            ? typeof note.tags === 'string'
              ? JSON.parse(note.tags)
              : note.tags
            : [],
          likes: note.likes || 0,
          admin_upvotes: note.admin_upvotes || 0,
          created_at: note.created_at,
          liked_by_me: note.liked_by_me || false,
          upvoted_by_me: note.upvoted_by_me || false,
          parent_note_id: note.parent_note_id,
          part_number: note.part_number,
        }));

        setNotes(loadedNotes);

        const tags = new Set<string>();
        loadedNotes.forEach((note) => {
          note.tags?.forEach((tag) => tags.add(tag));
        });
        setAllTags(Array.from(tags));
      } else {
        setNotes([]);
        setAllTags([]);
      }
    } catch (err) {
      logger.error('subject-notes', 'Failed to load notes', err);
      toast.error('Failed to load notes. Please try again.');
      setNotes([]);
      setAllTags([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadSuccess = () => {
    loadNotes();
  };

  const filteredAndSortedNotes = notes
    .filter((note) => filterTag === 'all' || note.tags?.includes(filterTag))
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'popular') {
        return b.likes - a.likes;
      }
      return 0;
    });

  const toggleLike = async (noteId: number) => {
    try {
      const response = await api.likeNote(noteId);
      if (response.success) {
        await loadNotes();
      }
    } catch (err) {
      logger.error('subject-notes', 'Failed to toggle like', err);
      toast.error('Failed to like note. Please try again.');
    }
  };

  const handleAdminLike = async (noteId: number) => {
    try {
      setIsLoading(true);
      await api.admin.likeNote(noteId);
      await loadNotes();
    } catch (err) {
      logger.error('subject-notes', 'Failed to admin like', err);
      toast.error('Failed to apply admin like.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      setIsLoading(true);
      await api.admin.deleteNote(noteId);
      setNotes(notes.filter((note) => note.id !== noteId));
    } catch (err) {
      logger.error('subject-notes', 'Failed to delete note', err);
      toast.error('Failed to delete note. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!subject) return null;

  return (
    <div>
      {/* Back Button */}
      <button
        onClick={onBack}
        style={{
          padding: '8px 16px',
          background: 'transparent',
          border: 'none',
          color: darkTheme.colors.accent,
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          marginBottom: '24px',
          transition: darkTheme.transitions.default,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onMouseOver={(e) => (e.currentTarget.style.opacity = '0.8')}
        onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
      >
        <i className="fas fa-arrow-left"></i>Back to Subjects
      </button>

      {/* Header with Upload Button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '32px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h2
            style={{
              fontSize: 'clamp(24px, 5vw, 32px)',
              fontWeight: 'bold',
              margin: '0 0 8px 0',
              color: darkTheme.colors.textPrimary,
            }}
          >
            {subject.name}
          </h2>
          <p style={{ margin: 0, color: darkTheme.colors.textSecondary, fontSize: '14px' }}>
            {notes.length} note{notes.length !== 1 ? 's' : ''} in this subject
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          style={{
            padding: '10px 20px',
            background: `linear-gradient(135deg, ${darkTheme.colors.accent} 0%, #27ae60 100%)`,
            border: 'none',
            color: 'white',
            borderRadius: darkTheme.borderRadius.md,
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: 'clamp(13px, 2vw, 15px)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.3s',
            boxShadow: darkTheme.shadows.default,
            whiteSpace: 'nowrap',
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <i className="fas fa-plus"></i>
          <span style={{ display: 'none' }}>Add Note</span>
          <span style={{ display: 'inline' }}>Add</span>
        </button>
      </div>

      {/* Grade/Class Filter */}
      {currentUser?.grade && (
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: darkTheme.colors.textSecondary }}>Showing:</span>
          <GradeClassFilter
            value={gradeFilter}
            onChange={setGradeFilter}
            userClass={currentUser.class}
            userGrade={currentUser.grade}
          />
        </div>
      )}

      {/* Sorting and Filtering */}
      {notes.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginBottom: '32px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {/* Sort Dropdown */}
          <div>
            <label
              style={{
                fontSize: '14px',
                fontWeight: '500',
                marginRight: '8px',
                color: darkTheme.colors.textSecondary,
              }}
            >
              Sort by:
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: '8px 12px',
                background: darkTheme.colors.bgSecondary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                borderRadius: darkTheme.borderRadius.sm,
                color: darkTheme.colors.textPrimary,
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              <option value="newest">Newest</option>
              <option value="popular">Most Liked</option>
            </select>
          </div>

          {/* Tag Filter */}
          {allTags.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: darkTheme.colors.textSecondary,
                }}
              >
                Tags:
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setFilterTag('all')}
                  style={{
                    padding: '6px 14px',
                    background:
                      filterTag === 'all' ? darkTheme.colors.accent : darkTheme.colors.bgSecondary,
                    border: `1px solid ${filterTag === 'all' ? darkTheme.colors.accent : darkTheme.colors.borderColor}`,
                    color: filterTag === 'all' ? 'white' : darkTheme.colors.textPrimary,
                    borderRadius: darkTheme.borderRadius.sm,
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                  }}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setFilterTag(tag)}
                    style={{
                      padding: '6px 14px',
                      background:
                        filterTag === tag ? darkTheme.colors.accent : darkTheme.colors.bgSecondary,
                      border: `1px solid ${filterTag === tag ? darkTheme.colors.accent : darkTheme.colors.borderColor}`,
                      color: filterTag === tag ? 'white' : darkTheme.colors.textPrimary,
                      borderRadius: darkTheme.borderRadius.sm,
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes Grid */}
      {isLoading ? (
        <LoadingSpinner message="Loading notes..." />
      ) : filteredAndSortedNotes.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 40px',
            color: darkTheme.colors.textSecondary,
          }}
        >
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>📚</div>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>No notes yet</p>
          <p style={{ fontSize: '14px' }}>Be the first to add a note in this subject!</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
            gap: 'clamp(12px, 3vw, 24px)',
          }}
        >
          {filteredAndSortedNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => setSelectedNote(note)}
              style={{
                background: darkTheme.colors.bgSecondary,
                borderRadius: darkTheme.borderRadius.md,
                overflow: 'hidden',
                transition: darkTheme.transitions.default,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                boxShadow: darkTheme.shadows.default,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = darkTheme.shadows.lg;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = darkTheme.shadows.default;
              }}
            >
              {/* Image Section */}
              <div
                style={{
                  height: 'clamp(140px, 30vw, 200px)',
                  background: (() => {
                    if (!note.image)
                      return `linear-gradient(135deg, ${darkTheme.colors.accent}20, ${darkTheme.colors.accent}05)`;
                    if (note.image.startsWith('[')) {
                      try {
                        const images = JSON.parse(note.image);
                        if (
                          Array.isArray(images) &&
                          images.length > 0 &&
                          images[0].startsWith('data:')
                        ) {
                          return `url(${images[0]}) center/cover no-repeat`;
                        }
                      } catch {}
                    }
                    if (note.image.startsWith('data:')) {
                      return `url(${note.image}) center/cover no-repeat`;
                    }
                    return `linear-gradient(135deg, ${darkTheme.colors.accent}20, ${darkTheme.colors.accent}05)`;
                  })(),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: (() => {
                    if (!note.image) return 'clamp(48px, 10vw, 64px)';
                    if (note.image.startsWith('[')) {
                      try {
                        const images = JSON.parse(note.image);
                        return Array.isArray(images) && images[0]?.startsWith('data:')
                          ? '0'
                          : 'clamp(48px, 10vw, 64px)';
                      } catch {}
                    }
                    return note.image.startsWith('data:') ? '0' : 'clamp(48px, 10vw, 64px)';
                  })(),
                  color: darkTheme.colors.accent,
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                {/* Show emoji only if no actual image */}
                {(() => {
                  if (!note.image) return '📄';
                  if (note.image.startsWith('[')) {
                    try {
                      const images = JSON.parse(note.image);
                      return Array.isArray(images) && !images[0]?.startsWith('data:')
                        ? images[0] || '📄'
                        : null;
                    } catch {}
                  }
                  return !note.image.startsWith('data:') ? note.image : null;
                })()}

                {/* Photo count indicator */}
                {(() => {
                  let imageCount = 1;
                  let hasRealImage = false;
                  if (note.image && note.image.startsWith('[')) {
                    try {
                      const images = JSON.parse(note.image);
                      if (Array.isArray(images)) {
                        imageCount = images.length;
                        hasRealImage = images[0]?.startsWith('data:');
                      }
                    } catch {}
                  } else if (note.image && note.image.startsWith('data:')) {
                    hasRealImage = true;
                  }
                  return imageCount > 1 && hasRealImage ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(4px)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        zIndex: 10,
                      }}
                    >
                      <i className="fas fa-images"></i> {imageCount}
                    </div>
                  ) : null;
                })()}

                {/* Continuation note indicator */}
                {note.part_number && note.part_number > 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '12px',
                      background: `${darkTheme.colors.accent}E6`,
                      backdropFilter: 'blur(4px)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '600',
                      zIndex: 10,
                    }}
                  >
                    Part {note.part_number}
                  </div>
                )}

                {/* Fullscreen zoom button */}
                {(() => {
                  let hasRealImage = false;
                  let firstImage = note.image;
                  if (note.image && note.image.startsWith('[')) {
                    try {
                      const images = JSON.parse(note.image);
                      if (Array.isArray(images) && images[0]?.startsWith('data:')) {
                        hasRealImage = true;
                        firstImage = images[0];
                      }
                    } catch {}
                  } else if (note.image && note.image.startsWith('data:')) {
                    hasRealImage = true;
                  }
                  return hasRealImage ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullScreenImage(firstImage);
                      }}
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(4px)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: 'white',
                        fontSize: '14px',
                        cursor: 'zoom-in',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.3s',
                        zIndex: 10,
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(0,0,0,0.8)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(0,0,0,0.6)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      <i className="fas fa-expand"></i>
                      <span style={{ fontSize: '12px' }}>Zoom</span>
                    </button>
                  ) : null;
                })()}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: `linear-gradient(to right, ${darkTheme.colors.accent}, #27ae60)`,
                  }}
                ></div>
              </div>

              {/* Content Section */}
              <div
                style={{
                  padding: 'clamp(12px, 3vw, 20px)',
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                }}
              >
                {/* Title */}
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    margin: '0 0 8px 0',
                    color: darkTheme.colors.textPrimary,
                    lineHeight: '1.3',
                  }}
                >
                  {note.title}
                </h3>

                {/* Author and Class */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      background: note.author_photo
                        ? `url('${note.author_photo}') center/cover`
                        : `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      flexShrink: 0,
                    }}
                  >
                    {!note.author_photo && note.author_name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: '500',
                        color: darkTheme.colors.textPrimary,
                      }}
                    >
                      {note.author_name}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0 0',
                        fontSize: '12px',
                        color: darkTheme.colors.textSecondary,
                      }}
                    >
                      Class {note.author_class}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <p
                  style={{
                    fontSize: '14px',
                    color: darkTheme.colors.textSecondary,
                    margin: '0 0 12px 0',
                    lineHeight: '1.5',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {note.description}
                </p>

                {/* Tags */}
                {note.tags && note.tags.length > 0 && (
                  <div
                    style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}
                  >
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: '4px 10px',
                          background: `${darkTheme.colors.accent}15`,
                          color: darkTheme.colors.accent,
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '500',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Divider */}
                <div
                  style={{
                    height: '1px',
                    background: darkTheme.colors.borderColor,
                    margin: '12px 0',
                  }}
                ></div>

                {/* Actions */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 'auto',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Admin Like Button (Orange with Crown) - Only for Admins */}
                    {currentUser?.role === 'admin' ||
                    currentUser?.email?.endsWith('@notarium.site') ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdminLike(note.id);
                        }}
                        style={{
                          background: note.upvoted_by_me
                            ? 'rgba(245, 158, 11, 0.25)'
                            : 'rgba(245, 158, 11, 0.15)',
                          border: `2px solid ${note.upvoted_by_me ? 'rgba(245, 158, 11, 1)' : 'rgba(245, 158, 11, 0.5)'}`,
                          color: '#f59e0b',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: darkTheme.transitions.default,
                          padding: '8px 14px',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: '600',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(245, 158, 11, 0.35)';
                          e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 1)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = note.upvoted_by_me
                            ? 'rgba(245, 158, 11, 0.25)'
                            : 'rgba(245, 158, 11, 0.15)';
                          e.currentTarget.style.borderColor = note.upvoted_by_me
                            ? 'rgba(245, 158, 11, 1)'
                            : 'rgba(245, 158, 11, 0.5)';
                        }}
                        title="Admin Like (+5 points)"
                      >
                        <i className="fas fa-crown"></i>
                        {note.admin_upvotes}
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(note.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: note.liked_by_me
                            ? darkTheme.colors.accent
                            : darkTheme.colors.textSecondary,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: darkTheme.transitions.default,
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: '500',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = note.liked_by_me
                            ? `${darkTheme.colors.accent}10`
                            : `rgba(255,255,255,0.1)`;
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'none';
                        }}
                      >
                        <i className={`fas fa-heart${note.liked_by_me ? '' : '-o'}`}></i>
                        {note.likes}
                      </button>
                    )}

                    {/* Admin Delete Button */}
                    {(currentUser?.role === 'admin' ||
                      currentUser?.email?.endsWith('@notarium.site')) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            confirm(
                              'Are you sure you want to delete this note? This cannot be undone.',
                            )
                          ) {
                            handleDeleteNote(note.id);
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: darkTheme.colors.danger,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: darkTheme.transitions.default,
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: '500',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = `${darkTheme.colors.danger}15`;
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'none';
                        }}
                        title="Delete this note"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>

                  {/* Date */}
                  <span
                    style={{
                      fontSize: '12px',
                      color: darkTheme.colors.textSecondary,
                    }}
                  >
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Note Modal */}
      {showUploadModal && (
        <UploadNoteModal
          onClose={() => setShowUploadModal(false)}
          subjects={[subject]}
          onSuccess={handleUploadSuccess}
          preselectedSubject={subject.id}
        />
      )}

      {/* Note Detail Modal */}
      {selectedNote && (
        <NoteDetailModal
          note={selectedNote}
          onClose={() => setSelectedNote(null)}
          onLike={toggleLike}
          currentUser={currentUser}
        />
      )}

      {/* Fullscreen Image Overlay */}
      {fullScreenImage && (
        <div
          onClick={() => setFullScreenImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            backdropFilter: 'blur(8px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            cursor: 'zoom-out',
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setFullScreenImage(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(4px)',
              border: 'none',
              color: 'white',
              fontSize: '32px',
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s',
              zIndex: 2001,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ×
          </button>

          {/* Full size image */}
          <img
            src={fullScreenImage}
            alt="Full screen view"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          />

          {/* Help text */}
          <div
            style={{
              position: 'absolute',
              bottom: '30px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '24px',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              pointerEvents: 'none',
            }}
          >
            <i className="fas fa-info-circle"></i>
            Click anywhere to close
          </div>
        </div>
      )}
    </div>
  );
}
