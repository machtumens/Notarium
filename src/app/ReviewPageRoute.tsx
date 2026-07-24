import { Suspense } from 'react';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkThemeStyles } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { BeamsBackground } from '../components/ui/beams-background';
import { ReviewPage } from './lazyPages';

export function ReviewPageRoute() {
  const { currentTheme } = useTheme();
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
        {/* Top bar */}
        <nav
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            backdropFilter: 'blur(10px)',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: 1000,
            minHeight: '68px',
            background: 'rgba(10, 10, 10, 0.6)',
          }}
        >
          <button
            onClick={() => {
              window.location.href = '/';
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(0, 0, 0, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: currentTheme.colors.textPrimary,
              cursor: 'pointer',
              padding: '8px 16px',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: '500',
              transition: currentTheme.transitions.default,
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          >
            <i className="fas fa-arrow-left"></i>
            Kembali
          </button>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Review</span>
        </nav>

        <main
          style={{
            marginTop: '84px',
            padding: '16px',
            maxWidth: '760px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <Suspense fallback={<LoadingSpinner message="Loading..." size="lg" />}>
            <ReviewPage />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
