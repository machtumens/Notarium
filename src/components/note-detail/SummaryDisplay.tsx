import React from 'react';
import { darkTheme } from '../../theme';

interface SummaryDisplayProps {
  summary: string | null;
  isMobile: boolean;
}

export const SummaryDisplay: React.FC<SummaryDisplayProps> = ({ summary, isMobile }) => {
  if (!summary) return null;

  return (
    <div style={{ padding: '0 32px', marginBottom: '12px' }}>
      <div
        style={{
          background: darkTheme.colors.bgSecondary,
          border: `1px solid ${darkTheme.colors.accent}`,
          borderRadius: '12px',
          padding: '16px',
          color: darkTheme.colors.textPrimary,
          fontSize: isMobile ? '12px' : '14px',
          lineHeight: '1.6',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: '600',
            marginBottom: '8px',
            color: darkTheme.colors.accent,
            textTransform: 'uppercase',
          }}
        >
          AI Summary
        </div>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{summary}</p>
      </div>
    </div>
  );
};
