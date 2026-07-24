import { useNavigate } from 'react-router-dom';
import { darkTheme } from '../../theme';
import { useAuth } from '../../App';
import { safePhotoUrl } from '../../lib/safeUrl';

interface MobileMenuProps {
  isMobile: boolean;
  closeMobileMenu: () => void;
}

export default function MobileMenu({ isMobile, closeMobileMenu }: MobileMenuProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
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
              background: safePhotoUrl(user?.photo_url)
                ? `url('${safePhotoUrl(user?.photo_url)}') center/cover`
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
            {!safePhotoUrl(user?.photo_url) && user?.name?.charAt(0).toUpperCase()}
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
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
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
            onMouseOver={(e) => (e.currentTarget.style.background = darkTheme.colors.dangerHover)}
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
          <img src="/notarium-logo.jpg" alt="Notarium" style={{ height: '40px', width: 'auto' }} />
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
  );
}
