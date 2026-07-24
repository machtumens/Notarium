import { darkTheme } from '../../theme';

interface MyNotesFooterProps {
  isMobile: boolean;
  setShowFoundersModal: (open: boolean) => void;
}

export default function MyNotesFooter({ isMobile, setShowFoundersModal }: MyNotesFooterProps) {
  return (
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
  );
}
