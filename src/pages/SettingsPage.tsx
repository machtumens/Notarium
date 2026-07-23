import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { BeamsBackground } from '../components/ui/beams-background';
import { darkThemeStyles } from '../theme';
import GoogleLinkCard from '../components/settings/GoogleLinkCard';

export default function SettingsPage() {
  const navigate = useNavigate();
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
        <div style={{ maxWidth: '560px', margin: '0 auto', padding: '80px 20px 40px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: currentTheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: '14px',
              marginBottom: '24px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ← Back
          </button>

          <h1
            style={{
              margin: '0 0 24px',
              fontSize: '22px',
              fontWeight: '800',
              color: currentTheme.colors.textPrimary,
            }}
          >
            Settings
          </h1>

          <GoogleLinkCard />
        </div>
      </div>
    </div>
  );
}
