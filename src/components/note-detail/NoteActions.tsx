import React from 'react';
import { darkTheme } from '../../theme';

interface NoteActionsProps {
  isLiked: boolean;
  likeCount: number;
  onLike: () => void;
  onGenerateSummary: () => void;
  isGeneratingSummary: boolean;
}

export const NoteActions: React.FC<NoteActionsProps> = ({
  isLiked,
  likeCount,
  onLike,
  onGenerateSummary,
  isGeneratingSummary,
}) => {
  return (
    <div style={{ padding: '0 32px' }}>
      {/* Stats */}
      <div
        style={{
          background: darkTheme.colors.bgSecondary,
          border: `1px solid ${darkTheme.colors.borderColor}`,
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <div>
            <div
              style={{
                fontSize: '12px',
                color: darkTheme.colors.textSecondary,
                marginBottom: '4px',
              }}
            >
              LIKES
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: darkTheme.colors.accent }}>
              {likeCount}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <button
          onClick={onLike}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: isLiked ? darkTheme.colors.accent : darkTheme.colors.bgSecondary,
            color: isLiked ? 'white' : darkTheme.colors.textPrimary,
            border: `1px solid ${isLiked ? darkTheme.colors.accent : darkTheme.colors.borderColor}`,
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '600',
            transition: 'all 0.3s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          onMouseOver={(e) => {
            if (!isLiked) {
              e.currentTarget.style.background = `${darkTheme.colors.accent}15`;
              e.currentTarget.style.borderColor = darkTheme.colors.accent;
            }
          }}
          onMouseOut={(e) => {
            if (!isLiked) {
              e.currentTarget.style.background = darkTheme.colors.bgSecondary;
              e.currentTarget.style.borderColor = darkTheme.colors.borderColor;
            }
          }}
        >
          <i className={`${isLiked ? 'fas' : 'far'} fa-heart`} style={{ fontSize: '16px' }}></i>
          {isLiked ? 'Liked' : 'Like'}
        </button>
      </div>

      {/* Summarize Button */}
      <button
        onClick={onGenerateSummary}
        disabled={isGeneratingSummary}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: darkTheme.colors.accent,
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          cursor: isGeneratingSummary ? 'not-allowed' : 'pointer',
          fontSize: '15px',
          fontWeight: '600',
          transition: 'all 0.3s',
          marginBottom: '12px',
          opacity: isGeneratingSummary ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
        onMouseOver={(e) => {
          if (!isGeneratingSummary) {
            e.currentTarget.style.opacity = '0.9';
          }
        }}
        onMouseOut={(e) => {
          if (!isGeneratingSummary) {
            e.currentTarget.style.opacity = '1';
          }
        }}
      >
        <i
          className={`fas fa-${isGeneratingSummary ? 'spinner fa-spin' : 'lightbulb'}`}
          style={{ fontSize: '16px' }}
        ></i>
        {isGeneratingSummary ? 'Generating Summary...' : 'Generate AI Summary'}
      </button>
    </div>
  );
};
