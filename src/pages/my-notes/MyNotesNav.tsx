import { useNavigate } from 'react-router-dom';
import { getCurrentTheme } from '../../theme';
import { useAuth } from '../../App';
import { safePhotoUrl } from '../../lib/safeUrl';
import { ExpandableTabs } from '../../components/ui/expandable-tabs';
import { Book, MessageSquare, Trophy, Settings, LogOut, BookOpen } from 'lucide-react';

interface MyNotesNavProps {
  isMobile: boolean;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  setShowProfileEditor: (open: boolean) => void;
}

export default function MyNotesNav({
  isMobile,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  setShowProfileEditor,
}: MyNotesNavProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const currentTheme = getCurrentTheme();

  return (
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
            <span style={{ fontSize: '20px', fontWeight: '700', color: '#fff', lineHeight: '1.2' }}>
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
          <img src="/notarium-logo.jpg" alt="Notarium" style={{ height: '44px', width: 'auto' }} />
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
  );
}
