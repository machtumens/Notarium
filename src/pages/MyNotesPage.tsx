import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { logger } from '../lib/logger';
import { darkTheme, getCurrentTheme } from '../theme';
import { useAuth } from '../App';
import api from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ProfileEditor from '../components/ProfileEditor';
import UploadNoteModal from '../components/UploadNoteModal';
import { ExpandableTabs } from '../components/ui/expandable-tabs';
import { Book, MessageSquare, Trophy, Settings, LogOut, BookOpen } from 'lucide-react';

const FoundersModal = lazy(() => import('../components/FoundersModal'));

interface Note {
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

interface Subject {
  id: number;
  name: string;
  icon: string;
  note_count: number;
}

interface NotesBySubject {
  [subject: string]: Note[];
}

export default function MyNotesPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const currentTheme = getCurrentTheme();
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

  // Handle responsive design
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

      // Update local state
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

      // Remove from local state
      setNotes(notes.filter((note) => note.id !== noteId));
    } catch (err) {
      logger.error('my-notes', 'Failed to delete note', err);
      toast.error('Failed to delete note.');
    }
  };

  // Group notes by subject
  const notesBySubject: NotesBySubject = notes.reduce((acc, note) => {
    const subject = note.subject_name || note.subject || 'Other';
    if (!acc[subject]) {
      acc[subject] = [];
    }
    acc[subject].push(note);
    return acc;
  }, {} as NotesBySubject);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: darkTheme.colors.bgPrimary,
        color: darkTheme.colors.textPrimary,
      }}
    >
      {/* Navigation Bar */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          backdropFilter: 'blur(10px)',
          padding: isMobile ? '12px 16px' : '16px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 1000,
          gap: '16px',
          minHeight: isMobile ? '64px' : '76px',
        }}
      >
        {/* Mobile: Hamburger Button */}
        {isMobile && (
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            style={{
              background: 'none',
              border: 'none',
              color: currentTheme.colors.textPrimary,
              cursor: 'pointer',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              padding: '8px',
              transition: currentTheme.transitions.default,
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.7')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <i className="fas fa-bars"></i>
          </button>
        )}

        {/* Logo with Text - Desktop only */}
        {!isMobile && (
          <button
            onClick={() => navigate('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: currentTheme.transitions.default,
              padding: 0,
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <img
              src="/notarium-logo.jpg"
              alt="Notarium"
              style={{ height: '48px', width: 'auto', borderRadius: '8px' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span
                style={{ fontSize: '20px', fontWeight: '700', color: '#fff', lineHeight: '1.2' }}
              >
                Notarium
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontWeight: '500',
                  letterSpacing: '0.5px',
                }}
              >
                Share Your Notes
              </span>
            </div>
          </button>
        )}

        {/* Mobile Logo */}
        {isMobile && (
          <button
            onClick={() => navigate('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: currentTheme.transitions.default,
              padding: 0,
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <img
              src="/notarium-logo.jpg"
              alt="Notarium"
              style={{ height: '44px', width: 'auto' }}
            />
          </button>
        )}

        {/* Desktop Navigation with black theme */}
        {!isMobile && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <ExpandableTabs
              className="bg-black/95 border-white/10 backdrop-blur-xl shadow-2xl"
              tabs={[
                { title: 'Subjects', icon: Book },
                { title: 'Chat', icon: MessageSquare },
                { title: 'Leaderboard', icon: Trophy },
                ...(user?.role === 'admin' ? [{ title: 'Admin', icon: Settings }] : []),
                { type: 'separator' as const },
                { title: 'My Notes', icon: BookOpen },
                { title: 'Logout', icon: LogOut },
              ]}
              onChange={(index) => {
                if (index === null) return;

                const pages = ['subjects', 'chat', 'leaderboard'];
                if (user?.role === 'admin') pages.push('admin');

                const actionIndex = user?.role === 'admin' ? 5 : 4;

                if (index < pages.length) {
                  navigate('/');
                } else if (index === actionIndex) {
                  // Already on My Notes page
                } else if (index === actionIndex + 1) {
                  logout();
                }
              }}
            />
          </div>
        )}

        {/* Account Avatar - Desktop only */}
        {!isMobile && (
          <button
            onClick={() => setShowProfileEditor(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(0, 0, 0, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: currentTheme.colors.textPrimary,
              cursor: 'pointer',
              transition: currentTheme.transitions.default,
              padding: '8px 16px',
              borderRadius: '9999px',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.95)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                background: user?.photo_url
                  ? `url('${user.photo_url}') center/cover`
                  : `linear-gradient(135deg, ${currentTheme.colors.accent}, #8b5cf6)`,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '16px',
                flexShrink: 0,
              }}
            >
              {!user?.photo_url && user?.name?.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: '13px', fontWeight: '500' }}>{user?.name}</span>
          </button>
        )}
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          style={{
            position: 'fixed',
            top: isMobile ? '64px' : '76px',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(4px)',
            zIndex: 999,
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={closeMobileMenu}
        >
          <div
            style={{
              width: '280px',
              height: '100%',
              background: darkTheme.colors.bgSecondary,
              borderRight: `1px solid ${darkTheme.colors.borderColor}`,
              animation: 'slideInLeft 0.3s ease-out',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Profile Section */}
            <div
              style={{
                padding: '24px 16px',
                borderBottom: `2px solid ${darkTheme.colors.borderColor}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                background: `linear-gradient(135deg, ${darkTheme.colors.bgPrimary}, ${darkTheme.colors.bgSecondary})`,
              }}
            >
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  background: user?.photo_url
                    ? `url('${user.photo_url}') center/cover`
                    : `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '28px',
                  border: `3px solid ${darkTheme.colors.accent}`,
                  boxShadow: darkTheme.shadows.default,
                }}
              >
                {!user?.photo_url && user?.name?.charAt(0).toUpperCase()}
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: darkTheme.colors.textPrimary,
                  }}
                >
                  {user?.name}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: darkTheme.colors.textSecondary,
                  }}
                >
                  {user?.email}
                </p>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  background: 'rgba(255, 215, 0, 0.15)',
                  borderRadius: darkTheme.borderRadius.full,
                  border: '1px solid rgba(255, 215, 0, 0.3)',
                }}
              >
                <span style={{ fontSize: '18px' }}>🪙</span>
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: '#FFD700',
                  }}
                >
                  {user?.points || 0}
                </span>
              </div>
            </div>

            {/* Menu Items */}
            <div
              style={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                flex: 1,
              }}
            >
              <button
                onClick={() => {
                  navigate('/');
                  closeMobileMenu();
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: darkTheme.transitions.default,
                  borderRadius: darkTheme.borderRadius.md,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="fas fa-book" style={{ width: '20px' }}></i>Subjects
              </button>

              <button
                onClick={() => {
                  navigate('/');
                  closeMobileMenu();
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: darkTheme.transitions.default,
                  borderRadius: darkTheme.borderRadius.md,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="fas fa-comments" style={{ width: '20px' }}></i>Chat
              </button>

              <button
                onClick={() => {
                  navigate('/');
                  closeMobileMenu();
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: darkTheme.transitions.default,
                  borderRadius: darkTheme.borderRadius.md,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="fas fa-trophy" style={{ width: '20px' }}></i>Leaderboard
              </button>

              {user?.role === 'admin' && (
                <button
                  onClick={() => {
                    navigate('/');
                    closeMobileMenu();
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: '500',
                    transition: darkTheme.transitions.default,
                    borderRadius: darkTheme.borderRadius.md,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <i className="fas fa-cog" style={{ width: '20px' }}></i>Admin
                </button>
              )}

              {/* Divider */}
              <div
                style={{
                  height: '1px',
                  background: darkTheme.colors.borderColor,
                  margin: '8px 0',
                }}
              ></div>

              {/* My Notes Button - Highlighted */}
              <button
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: darkTheme.colors.accent,
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: darkTheme.transitions.default,
                  borderRadius: darkTheme.borderRadius.md,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <i className="fas fa-book" style={{ width: '20px' }}></i>My Notes
              </button>

              {/* Logout Button */}
              <button
                onClick={() => {
                  closeMobileMenu();
                  logout();
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: darkTheme.colors.danger,
                  border: 'none',
                  color: 'white',
                  borderRadius: darkTheme.borderRadius.md,
                  cursor: 'pointer',
                  transition: darkTheme.transitions.default,
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = darkTheme.colors.dangerHover)
                }
                onMouseOut={(e) => (e.currentTarget.style.background = darkTheme.colors.danger)}
              >
                <i className="fas fa-sign-out-alt" style={{ width: '20px' }}></i>Logout
              </button>
            </div>

            {/* Notarium.Site Footer */}
            <div
              style={{
                padding: '16px',
                borderTop: `2px solid ${darkTheme.colors.borderColor}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                transition: darkTheme.transitions.default,
                marginTop: 'auto',
              }}
              onClick={() => {
                navigate('/');
                closeMobileMenu();
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <img
                src="/notarium-logo.jpg"
                alt="Notarium"
                style={{ height: '40px', width: 'auto' }}
              />
              <div>
                <h4 style={{ margin: '0', fontSize: '14px', fontWeight: 'bold' }}>
                  Notarium<span style={{ color: darkTheme.colors.accent }}>.Site</span>
                </h4>
                <p
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '10px',
                    color: darkTheme.colors.textSecondary,
                  }}
                >
                  Share Your Notes
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
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
                    activeTab === 'draft'
                      ? darkTheme.colors.accent
                      : darkTheme.colors.textSecondary,
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

      {/* Edit Modal */}
      {editingNote && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: darkTheme.colors.bgSecondary,
              borderRadius: darkTheme.borderRadius.lg,
              padding: '24px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h2
                style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: darkTheme.colors.textPrimary,
                }}
              >
                Edit Note
              </h2>
              <button
                onClick={() => setEditingNote(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: darkTheme.colors.textSecondary,
                  cursor: 'pointer',
                  fontSize: '24px',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: darkTheme.colors.bgTertiary,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: darkTheme.borderRadius.md,
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                Content
              </label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={10}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: darkTheme.colors.bgTertiary,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: darkTheme.borderRadius.md,
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: darkTheme.colors.bgTertiary,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: darkTheme.borderRadius.md,
                  color: darkTheme.colors.textPrimary,
                  fontSize: '14px',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
              }}
            >
              <button
                onClick={() => setEditingNote(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: darkTheme.colors.bgTertiary,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: darkTheme.borderRadius.md,
                  color: darkTheme.colors.textPrimary,
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: darkTheme.colors.accent,
                  border: 'none',
                  borderRadius: darkTheme.borderRadius.md,
                  color: 'white',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Note Modal */}
      {showUploadModal && (
        <UploadNoteModal
          onClose={() => setShowUploadModal(false)}
          subjects={subjects}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* Profile Editor Modal */}
      {showProfileEditor && <ProfileEditor onClose={() => setShowProfileEditor(false)} />}

      {/* Footer */}
      <footer
        style={{
          textAlign: 'center',
          padding: '16px 20px',
          border: `1px solid ${darkTheme.colors.borderColor}`,
          color: darkTheme.colors.textSecondary,
          fontSize: '13px',
          marginTop: '48px',
          marginBottom: '24px',
          background: darkTheme.colors.bgSecondary,
          borderRadius: isMobile ? '12px' : '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          width: isMobile ? '90%' : '60%',
          marginLeft: 'auto',
          marginRight: 'auto',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        }}
      >
        <p style={{ margin: 0 }}>© 2025 Notarium. All rights reserved.</p>
        <button
          onClick={() => setShowFoundersModal(true)}
          style={{
            padding: '8px 18px',
            background: darkTheme.colors.accent,
            border: `2px solid ${darkTheme.colors.accent}`,
            color: '#fff',
            borderRadius: darkTheme.borderRadius.md,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            transition: darkTheme.transitions.default,
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.8)';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.6)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = darkTheme.colors.accent;
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
          }}
        >
          Meet the Team
        </button>
      </footer>

      {/* Founders Modal */}
      {showFoundersModal && (
        <Suspense fallback={<LoadingSpinner />}>
          <FoundersModal onClose={() => setShowFoundersModal(false)} />
        </Suspense>
      )}
    </div>
  );
}
