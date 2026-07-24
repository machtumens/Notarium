import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../lib/api';
import { logger } from '../lib/logger';
import { safePhotoUrl } from '../lib/safeUrl';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkTheme, cardStyle } from '../theme';

interface LeaderboardEntry {
  name?: string;
  display_name?: string;
  class?: string;
  points?: number;
  score?: number;
  total_likes?: number;
  learning_points?: number;
  photo_url?: string;
}

type LeaderboardTab = 'contributors' | 'learners';

interface LeaderboardPageProps {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function LeaderboardPage({ isLoading, setIsLoading }: LeaderboardPageProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('contributors');

  const getContributionPoints = (entry: LeaderboardEntry): number =>
    Math.max(0, entry.points || entry.score || entry.total_likes || 0);

  const getLearningPoints = (entry: LeaderboardEntry): number =>
    Math.max(0, entry.learning_points || 0);

  const rankedLeaderboard = [...leaderboard].sort((a, b) =>
    activeTab === 'learners'
      ? getLearningPoints(b) - getLearningPoints(a)
      : getContributionPoints(b) - getContributionPoints(a),
  );

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        setIsLoading(true);
        const leaderboardData = await api.getLeaderboard();
        logger.debug('leaderboard', 'data loaded:', leaderboardData);

        const normalizedLeaderboard = Array.isArray(leaderboardData)
          ? leaderboardData
          : leaderboardData?.leaderboard || [];

        setLeaderboard(normalizedLeaderboard);
      } catch (err) {
        logger.error('leaderboard', 'Failed to load leaderboard', err);
        toast.error('Failed to load leaderboard. Please refresh.');
        setLeaderboard([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadLeaderboard();
  }, [setIsLoading]);

  return (
    <div>
      <h2
        style={{
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '24px',
          color: darkTheme.colors.textPrimary,
        }}
      >
        Leaderboard
      </h2>

      {/* Dimension toggle: contribution vs retrieval-based learning */}
      <div
        style={{
          display: 'inline-flex',
          gap: '4px',
          padding: '4px',
          marginBottom: '24px',
          background: darkTheme.colors.bgSecondary,
          border: `1px solid ${darkTheme.colors.borderColor}`,
          borderRadius: darkTheme.borderRadius.lg,
        }}
      >
        {(
          [
            { key: 'contributors', label: '🪙 Contributors' },
            { key: 'learners', label: '🧠 Top Learners' },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 18px',
                border: 'none',
                borderRadius: darkTheme.borderRadius.md,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: darkTheme.transitions.default,
                background: isActive
                  ? `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`
                  : 'transparent',
                color: isActive ? '#fff' : darkTheme.colors.textSecondary,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'learners' && (
        <p
          style={{
            margin: '-12px 0 20px 0',
            fontSize: '13px',
            color: darkTheme.colors.textSecondary,
          }}
        >
          Peringkat berdasarkan poin belajar dari kuis & review — bukan sekadar unggah catatan.
        </p>
      )}

      {isLoading ? (
        <LoadingSpinner message="Loading leaderboard..." />
      ) : leaderboard.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 40px',
            color: darkTheme.colors.textSecondary,
          }}
        >
          <p style={{ fontSize: '16px' }}>No leaderboard data available</p>
        </div>
      ) : (
        <div
          style={
            {
              ...cardStyle,
              padding: 0,
              overflow: 'hidden',
            } as React.CSSProperties
          }
        >
          {rankedLeaderboard.slice(0, 20).map((entry, index) => (
            <div
              key={index}
              style={{
                padding: '16px 20px',
                borderBottom:
                  index < rankedLeaderboard.length - 1
                    ? `1px solid ${darkTheme.colors.borderColor}`
                    : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                transition: darkTheme.transitions.default,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = darkTheme.colors.bgTertiary)}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: darkTheme.colors.accent,
                  minWidth: '30px',
                }}
              >
                {index + 1}
              </div>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  background: safePhotoUrl(entry.photo_url)
                    ? `url('${safePhotoUrl(entry.photo_url)}') center/cover`
                    : `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  flexShrink: 0,
                  color: '#fff',
                  fontSize: '14px',
                }}
              >
                {!safePhotoUrl(entry.photo_url) &&
                  (entry.display_name?.charAt(0).toUpperCase() ||
                    entry.name?.charAt(0).toUpperCase() ||
                    'U')}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: '500' }}>
                  {entry.display_name || entry.name || 'Unknown'}
                </p>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '12px',
                    color: darkTheme.colors.textSecondary,
                  }}
                >
                  Class {entry.class || 'N/A'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    justifyContent: 'flex-end',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{activeTab === 'learners' ? '🧠' : '🪙'}</span>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: activeTab === 'learners' ? '#22c55e' : darkTheme.colors.accent,
                    }}
                  >
                    {activeTab === 'learners'
                      ? getLearningPoints(entry)
                      : getContributionPoints(entry)}
                  </p>
                </div>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '12px',
                    color: darkTheme.colors.textSecondary,
                  }}
                >
                  {activeTab === 'learners' ? 'learning points' : 'points'}
                </p>
                {/* Secondary dimension badge so both are always visible */}
                <p
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '11px',
                    color: darkTheme.colors.textSecondary,
                    opacity: 0.75,
                  }}
                >
                  {activeTab === 'learners'
                    ? `🪙 ${getContributionPoints(entry)} pts`
                    : `🧠 ${getLearningPoints(entry)} LP`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
