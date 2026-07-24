import { useEffect, useState, Suspense } from 'react';
import api from '../lib/api';
import { safePhotoUrl } from '../lib/safeUrl';
import type { Subject } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkThemeStyles } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { ExpandableTabs } from '../components/ui/expandable-tabs';
import { BeamsBackground } from '../components/ui/beams-background';
import {
  Book,
  MessageSquare,
  Trophy,
  Settings,
  LogOut,
  BookOpen,
  Bell,
  GraduationCap,
} from 'lucide-react';
import NotificationPanel from '../components/NotificationPanel';
import { useAuth } from './AuthContext';
import {
  SubjectsPage,
  SubjectNotesPage,
  LeaderboardPage,
  ChatPage,
  AdminPage,
  OpsDashboard,
  ProfileEditor,
  ProfileStats,
  FoundersModal,
} from './lazyPages';
import { canModerate, canOps } from './roles';

export function HomePage() {
  const { user, logout } = useAuth();
  const { currentTheme } = useTheme();
  const [currentPage, setCurrentPage] = useState<
    'subjects' | 'subject-notes' | 'leaderboard' | 'chat' | 'admin' | 'ops'
  >('subjects');
  const [currentSubject, setCurrentSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showProfileStats, setShowProfileStats] = useState(false);
  const [showFoundersModal, setShowFoundersModal] = useState(false);
  const [_subjects, setSubjects] = useState<Subject[]>([]);
  const [_searchQuery, _setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [, forceUpdate] = useState({});
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const handleThemeChange = () => {
      forceUpdate({});
    };
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  const handleSelectSubject = (subject: Subject) => {
    setCurrentSubject(subject);
    setCurrentPage('subject-notes');
  };

  const handleBackToSubjects = () => {
    setCurrentPage('subjects');
    setCurrentSubject(null);
  };

  const loadSubjects = async () => {
    try {
      const data = await api.getSubjects();
      setSubjects(data.subjects || []);
    } catch (error) {
      console.error('Failed to load subjects:', error);
    }
  };

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

  const navigateTo = (page: typeof currentPage, subject?: Subject) => {
    if (subject) {
      setCurrentSubject(subject);
    }
    setCurrentPage(page);
    closeMobileMenu();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader sets loading/data state on mount; behavior-preserving
    loadSubjects();
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchCount = () => {
      api.notifications
        .getUnreadCount()
        .then((res) => setUnreadCount(res.count || 0))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <BeamsBackground className="fixed inset-0" intensity="medium" />
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          minHeight: '100vh',
          color: currentTheme.colors.textPrimary,
        }}
      >
        <style>{darkThemeStyles}</style>

        {/* Navigation */}
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
              onClick={() => {
                navigateTo('subjects');
                setCurrentSubject(null);
              }}
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
              onClick={() => {
                navigateTo('subjects');
                setCurrentSubject(null);
              }}
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
                  { title: 'Review', icon: GraduationCap },
                  ...(canModerate(user) ? [{ title: 'Admin', icon: Settings }] : []),
                  ...(canOps(user) ? [{ title: 'Ops', icon: Settings }] : []),
                  { type: 'separator' as const },
                  { title: 'My Notes', icon: BookOpen },
                  { title: 'Logout', icon: LogOut },
                ]}
                onChange={(index) => {
                  if (index === null) return;

                  const pages = ['subjects', 'chat', 'leaderboard'];
                  const reviewIndex = 3;
                  let cursor = 4;
                  const adminIndex = canModerate(user) ? cursor++ : -1;
                  const opsIndex = canOps(user) ? cursor++ : -1;
                  // cursor now points at the separator; My Notes is one past it.
                  const myNotesIndex = cursor + 1;
                  const logoutIndex = myNotesIndex + 1;

                  if (index < pages.length) {
                    navigateTo(pages[index] as typeof currentPage);
                  } else if (index === reviewIndex) {
                    window.location.href = '/review';
                  } else if (index === adminIndex) {
                    navigateTo('admin');
                  } else if (index === opsIndex) {
                    navigateTo('ops');
                  } else if (index === myNotesIndex) {
                    window.location.href = '/my-notes';
                  } else if (index === logoutIndex) {
                    logout();
                  }
                }}
              />
            </div>
          )}

          {/* Bell Notification Icon */}
          <button
            onClick={() => setShowNotifications((v) => !v)}
            style={{
              position: 'relative',
              background: 'rgba(0, 0, 0, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'white',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: '#ef4444',
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  borderRadius: '9999px',
                  minWidth: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

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
                  background: safePhotoUrl(user?.photo_url)
                    ? `url('${safePhotoUrl(user?.photo_url)}') center/cover`
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
                {!safePhotoUrl(user?.photo_url) && user?.name?.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: '13px', fontWeight: '500' }}>{user?.name}</span>
            </button>
          )}
        </nav>

        {/* Notification Panel */}
        {showNotifications && (
          <NotificationPanel
            onClose={() => setShowNotifications(false)}
            onCountChange={setUnreadCount}
          />
        )}

        {/* Warning Banner (Yellow) */}
        {user?.warning && user?.warning_message && !user?.suspended && (
          <div
            style={{
              position: 'fixed',
              top: isMobile ? '64px' : '76px',
              left: 0,
              right: 0,
              background:
                'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))',
              backdropFilter: 'blur(10px)',
              borderBottom: '2px solid rgba(245, 158, 11, 0.5)',
              padding: '14px 20px',
              zIndex: 999,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ fontSize: '22px', flexShrink: 0 }}>⚠️</div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: '700',
                      marginBottom: '6px',
                      color: 'white',
                    }}
                  >
                    Account Warning
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      padding: '10px',
                      background: 'rgba(0, 0, 0, 0.15)',
                      borderRadius: '6px',
                      color: 'rgba(255, 255, 255, 0.95)',
                      borderLeft: '3px solid rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    {user.warning_message}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      marginTop: '8px',
                      color: 'rgba(255, 255, 255, 0.85)',
                      fontStyle: 'italic',
                    }}
                  >
                    This is a warning. Repeated violations may result in account suspension.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Suspension Banner (Red) - Blocks Actions */}
        {user?.suspended && (user?.suspension_end_date || user?.suspension_reason) && (
          <div
            style={{
              position: 'fixed',
              top: isMobile ? '64px' : '76px',
              left: 0,
              right: 0,
              background:
                'linear-gradient(135deg, rgba(220, 38, 38, 0.95), rgba(153, 27, 27, 0.95))',
              backdropFilter: 'blur(10px)',
              borderBottom: '2px solid rgba(239, 68, 68, 0.5)',
              padding: '16px 20px',
              zIndex: 999,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ fontSize: '24px', flexShrink: 0 }}>⚠️</div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: '700',
                      marginBottom: '6px',
                      color: 'white',
                    }}
                  >
                    Account Suspended
                  </div>
                  {user.suspension_end_date && (
                    <div
                      style={{
                        fontSize: '14px',
                        marginBottom: '6px',
                        color: 'rgba(255, 255, 255, 0.95)',
                      }}
                    >
                      Your account is suspended until{' '}
                      {new Date(user.suspension_end_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                  {user.suspension_reason && (
                    <div
                      style={{
                        fontSize: '13px',
                        padding: '10px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: '6px',
                        marginTop: '8px',
                        color: 'rgba(255, 255, 255, 0.9)',
                        borderLeft: '3px solid rgba(255, 255, 255, 0.5)',
                      }}
                    >
                      <strong>Reason:</strong> {user.suspension_reason}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: '12px',
                      marginTop: '10px',
                      color: 'rgba(255, 255, 255, 0.8)',
                    }}
                  >
                    You can still view content but cannot upload notes or interact during this time.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Menu Overlay */}
        {isMobile && isMobileMenuOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              zIndex: 999,
              top: '60px',
            }}
            onClick={closeMobileMenu}
          />
        )}

        {/* Mobile Menu */}
        {isMobile && (
          <div
            style={{
              position: 'fixed',
              left: 0,
              top: '64px',
              width: '280px',
              height: 'calc(100vh - 64px)',
              background: 'rgba(10, 10, 10, 0.95)',
              backdropFilter: 'blur(10px)',
              borderRight: `1px solid ${currentTheme.colors.borderColor}`,
              zIndex: 1001,
              transform: isMobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Profile Section - Top (Full Width) */}
            <div
              style={{
                padding: '24px 16px',
                borderBottom: `2px solid ${currentTheme.colors.borderColor}`,
                background: `linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1))`,
                textAlign: 'center',
                cursor: 'pointer',
                transition: currentTheme.transitions.default,
              }}
              onClick={() => {
                setShowProfileStats(true);
                closeMobileMenu();
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.background = `linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))`)
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.background = `linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1))`)
              }
            >
              {/* Profile Picture */}
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  background: safePhotoUrl(user?.photo_url)
                    ? `url('${safePhotoUrl(user?.photo_url)}') center/cover`
                    : `linear-gradient(135deg, ${currentTheme.colors.accent}, #8b5cf6)`,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '36px',
                  margin: '0 auto 12px',
                  flexShrink: 0,
                  border: `2px solid ${currentTheme.colors.borderColor}`,
                }}
              >
                {!safePhotoUrl(user?.photo_url) && user?.name?.charAt(0).toUpperCase()}
              </div>

              {/* User Name and Class */}
              <h3
                style={{
                  margin: '0 0 2px 0',
                  fontSize: '18px',
                  fontWeight: '800',
                  color: '#fff',
                  letterSpacing: '0.5px',
                }}
              >
                {user?.name || 'User'}
              </h3>
              <p
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '13px',
                  color: currentTheme.colors.textSecondary,
                  fontWeight: '500',
                }}
              >
                {user?.class ? `📚 ${user.class}` : ''}
              </p>

              {/* Description */}
              {user?.description && (
                <p
                  style={{
                    margin: '8px 0',
                    fontSize: '12px',
                    color: currentTheme.colors.textSecondary,
                    fontStyle: 'italic',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  "{user.description}"
                </p>
              )}

              {/* Points Display - Only show when user has uploaded notes */}
              {(user?.points || 0) > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    margin: '8px 0',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>🪙</span>
                  <span>{Math.max(0, user?.points || 0)} Points</span>
                </div>
              )}

              {/* Badges - Dynamic based on points */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '12px',
                  flexWrap: 'wrap',
                }}
              >
                {/* Bronze Badge (100+ notes) */}
                {(user?.points || 0) >= 100 && (
                  <div
                    title="Bronze Badge - 100+ Points"
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'linear-gradient(135deg, #CD7F32, #8B4513)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '16px',
                      animation: 'badgeBounce 0.6s ease-out',
                      boxShadow: '0 4px 12px rgba(205, 127, 50, 0.4)',
                    }}
                  >
                    🥉
                  </div>
                )}

                {/* Silver Badge (250+ notes) */}
                {(user?.points || 0) >= 250 && (
                  <div
                    title="Silver Badge - 250+ Points"
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'linear-gradient(135deg, #C0C0C0, #808080)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '16px',
                      animation: 'badgeBounce 0.6s ease-out 0.1s both',
                      boxShadow: '0 4px 12px rgba(192, 192, 192, 0.4)',
                    }}
                  >
                    🥈
                  </div>
                )}

                {/* Gold Badge (500+ notes) */}
                {(user?.points || 0) >= 500 && (
                  <div
                    title="Gold Badge - 500+ Points"
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '16px',
                      animation: 'badgeBounce 0.6s ease-out 0.2s both',
                      boxShadow: '0 4px 12px rgba(255, 215, 0, 0.6)',
                    }}
                  >
                    🥇
                  </div>
                )}

                {/* Platinum Badge (1000+ notes) */}
                {(user?.points || 0) >= 1000 && (
                  <div
                    title="Platinum Badge - 1000+ Points"
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'linear-gradient(135deg, #E5E4E2, #36454F)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '16px',
                      animation: 'badgeBounce 0.6s ease-out 0.3s both',
                      boxShadow: '0 4px 12px rgba(229, 228, 226, 0.6)',
                    }}
                  >
                    👑
                  </div>
                )}
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
                onClick={() => navigateTo('subjects')}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background:
                    currentPage === 'subjects' ? currentTheme.colors.accent : 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: currentTheme.transitions.default,
                  borderRadius: currentTheme.borderRadius.md,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) =>
                  !currentPage.includes('subjects') &&
                  (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')
                }
                onMouseOut={(e) =>
                  !currentPage.includes('subjects') &&
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                <i className="fas fa-book" style={{ width: '20px' }}></i>Subjects
              </button>

              <button
                onClick={() => navigateTo('chat')}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: currentPage === 'chat' ? currentTheme.colors.accent : 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: currentTheme.transitions.default,
                  borderRadius: currentTheme.borderRadius.md,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) =>
                  currentPage !== 'chat' &&
                  (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')
                }
                onMouseOut={(e) =>
                  currentPage !== 'chat' && (e.currentTarget.style.background = 'transparent')
                }
              >
                <i className="fas fa-comments" style={{ width: '20px' }}></i>Chat
              </button>

              <button
                onClick={() => navigateTo('leaderboard')}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background:
                    currentPage === 'leaderboard' ? currentTheme.colors.accent : 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: currentTheme.transitions.default,
                  borderRadius: currentTheme.borderRadius.md,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) =>
                  currentPage !== 'leaderboard' &&
                  (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')
                }
                onMouseOut={(e) =>
                  currentPage !== 'leaderboard' &&
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                <i className="fas fa-trophy" style={{ width: '20px' }}></i>Leaderboard
              </button>

              <button
                onClick={() => {
                  closeMobileMenu();
                  window.location.href = '/review';
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
                  transition: currentTheme.transitions.default,
                  borderRadius: currentTheme.borderRadius.md,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="fas fa-graduation-cap" style={{ width: '20px' }}></i>Review
              </button>

              {canModerate(user) && (
                <button
                  onClick={() => navigateTo('admin')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background:
                      currentPage === 'admin' ? currentTheme.colors.accent : 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: '500',
                    transition: currentTheme.transitions.default,
                    borderRadius: currentTheme.borderRadius.md,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                  onMouseOver={(e) =>
                    currentPage !== 'admin' &&
                    (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')
                  }
                  onMouseOut={(e) =>
                    currentPage !== 'admin' && (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <i className="fas fa-cog" style={{ width: '20px' }}></i>Admin
                </button>
              )}

              {canOps(user) && (
                <button
                  onClick={() => navigateTo('ops')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: currentPage === 'ops' ? currentTheme.colors.accent : 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: '500',
                    transition: currentTheme.transitions.default,
                    borderRadius: currentTheme.borderRadius.md,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                  onMouseOver={(e) =>
                    currentPage !== 'ops' &&
                    (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')
                  }
                  onMouseOut={(e) =>
                    currentPage !== 'ops' && (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <i className="fas fa-chart-line" style={{ width: '20px' }}></i>Ops
                </button>
              )}

              {/* Divider */}
              <div
                style={{
                  height: '1px',
                  background: currentTheme.colors.borderColor,
                  margin: '8px 0',
                }}
              ></div>

              {/* My Notes Button */}
              <button
                onClick={() => {
                  closeMobileMenu();
                  window.location.href = '/my-notes';
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
                  transition: currentTheme.transitions.default,
                  borderRadius: currentTheme.borderRadius.md,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
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
                  background: currentTheme.colors.danger,
                  border: 'none',
                  color: 'white',
                  borderRadius: currentTheme.borderRadius.md,
                  cursor: 'pointer',
                  transition: currentTheme.transitions.default,
                  fontSize: '15px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = currentTheme.colors.dangerHover)
                }
                onMouseOut={(e) => (e.currentTarget.style.background = currentTheme.colors.danger)}
              >
                <i className="fas fa-sign-out-alt" style={{ width: '20px' }}></i>Logout
              </button>
            </div>

            {/* Notarium.Site Footer - Bottom */}
            <div
              style={{
                padding: '16px',
                borderTop: `2px solid ${currentTheme.colors.borderColor}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                transition: currentTheme.transitions.default,
                marginTop: 'auto',
              }}
              onClick={() => {
                navigateTo('subjects');
                setCurrentSubject(null);
                closeMobileMenu();
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <img
                src="/notarium-logo.jpg"
                alt="Notarium"
                style={{ height: '40px', width: 'auto' }}
              />
              <div>
                <h4 style={{ margin: '0', fontSize: '14px', fontWeight: 'bold' }}>
                  Notarium<span style={{ color: currentTheme.colors.accent }}>.Site</span>
                </h4>
                <p
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '10px',
                    color: currentTheme.colors.textSecondary,
                  }}
                >
                  Share Your Notes
                </p>
              </div>
            </div>

            {/* Badge Unlock Animation Keyframes */}
            <style>{`
            @keyframes badgeBounce {
              0% {
                transform: scale(0) rotate(-180deg);
                opacity: 0;
              }
              50% {
                transform: scale(1.2) rotate(0deg);
              }
              100% {
                transform: scale(1) rotate(0deg);
                opacity: 1;
              }
            }
          `}</style>
          </div>
        )}

        {/* Main Content */}
        <main
          style={{ marginTop: isMobile ? '78px' : '92px', padding: isMobile ? '16px' : '32px' }}
        >
          {currentPage === 'subjects' && (
            <SubjectsPage
              onSelectSubject={handleSelectSubject}
              isLoading={loading}
              setIsLoading={setLoading}
            />
          )}

          {currentPage === 'subject-notes' && (
            <SubjectNotesPage
              subject={currentSubject}
              onBack={handleBackToSubjects}
              isLoading={loading}
              setIsLoading={setLoading}
            />
          )}

          {currentPage === 'leaderboard' && (
            <LeaderboardPage isLoading={loading} setIsLoading={setLoading} />
          )}

          {currentPage === 'chat' && <ChatPage />}

          {currentPage === 'admin' && canModerate(user) && <AdminPage />}
          {currentPage === 'ops' && canOps(user) && <OpsDashboard />}
        </main>

        {/* Profile Stats Modal - Mobile only */}
        {showProfileStats && (
          <Suspense fallback={<LoadingSpinner />}>
            <ProfileStats
              onClose={() => setShowProfileStats(false)}
              onEditProfile={() => setShowProfileEditor(true)}
            />
          </Suspense>
        )}

        {/* Profile Editor Modal - Desktop only */}
        {showProfileEditor && !showProfileStats && (
          <Suspense fallback={<LoadingSpinner />}>
            <ProfileEditor onClose={() => setShowProfileEditor(false)} />
          </Suspense>
        )}

        {/* Copyright Footer */}
        <footer
          style={{
            textAlign: 'center',
            padding: '16px 20px',
            border: `1px solid ${currentTheme.colors.borderColor}`,
            color: currentTheme.colors.textSecondary,
            fontSize: '13px',
            marginTop: '48px',
            marginBottom: '24px',
            background: currentTheme.colors.bgSecondary,
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
              background: currentTheme.colors.accent,
              border: `2px solid ${currentTheme.colors.accent}`,
              color: '#fff',
              borderRadius: currentTheme.borderRadius.md,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              transition: currentTheme.transitions.default,
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(139, 92, 246, 0.8)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.6)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = currentTheme.colors.accent;
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
    </div>
  );
}
