import React from 'react';
import { darkTheme } from '../../theme';

interface CloseButtonProps {
  onClose: () => void;
}

export const CloseButton: React.FC<CloseButtonProps> = ({ onClose }) => {
  return (
    <div style={{ padding: '0 32px 32px 32px' }}>
      <button
        onClick={onClose}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: darkTheme.colors.bgSecondary,
          color: darkTheme.colors.textPrimary,
          border: `1px solid ${darkTheme.colors.borderColor}`,
          borderRadius: '12px',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: '600',
          transition: 'all 0.3s',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = `${darkTheme.colors.accent}20`;
          e.currentTarget.style.borderColor = darkTheme.colors.accent;
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = darkTheme.colors.bgSecondary;
          e.currentTarget.style.borderColor = darkTheme.colors.borderColor;
        }}
      >
        Close
      </button>
    </div>
  );
};
