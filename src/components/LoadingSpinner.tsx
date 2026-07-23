import { darkTheme } from '../theme';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function LoadingSpinner({
  message = 'Loading...',
  size = 'md',
}: LoadingSpinnerProps) {
  const sizes = {
    sm: { width: 30, height: 30, borderWidth: 2 },
    md: { width: 40, height: 40, borderWidth: 3 },
    lg: { width: 60, height: 60, borderWidth: 4 },
  };

  const { width, height, borderWidth } = sizes[size];

  return (
    <div
      style={{
        textAlign: 'center',
        color: darkTheme.colors.textSecondary,
        padding: '40px',
        minHeight: '200px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          width: `${width}px`,
          height: `${height}px`,
          border: `${borderWidth}px solid ${darkTheme.colors.borderColor}`,
          borderTop: `${borderWidth}px solid ${darkTheme.colors.accent}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: message ? '16px' : 0,
        }}
      ></div>
      {message && <p style={{ margin: 0, fontSize: '14px' }}>{message}</p>}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
