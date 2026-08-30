import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Flame, Trophy, CalendarClock } from 'lucide-react';
import api from '../lib/api';
import { logger } from '../lib/logger';
import { safePhotoUrl } from '../lib/safeUrl';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkTheme, cardStyle } from '../theme';
import LevelRing from '../components/campus/LevelRing';
import BadgeShelf from '../components/campus/BadgeShelf';

interface LeaderboardEntry {
  name?: string;
  display_name?: string;
  class?: string;
  learning_points?: number;
  photo_url?: string;
}

interface PersonalStats {
  current_streak: number;
  learning_points: number;
  due_count: number;
}

const EMPTY_PERSONAL_STATS: PersonalStats = {
  current_streak: 0,
  learning_points: 0,
  due_count: 0,
};

interface LeaderboardPageProps {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function LeaderboardPage({ isLoading, setIsLoading }: LeaderboardPageProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  // Personal study snapshot is fetched independently of the ranked list and has
  // its OWN loading flag — the isLoading/setIsLoading props gate only the ranking.
  const [personalStats, setPersonalStats] = useState<PersonalStats>(EMPTY_PERSONAL_STATS);
  const [statsLoading, setStatsLoading] = useState(true);

  const getLearningPoints = (entry: LeaderboardEntry): number =>
    Math.max(0, entry.learning_points || 0);

  // Backend now returns the list already ordered by learning_points DESC, so no
  // client-side re-sort is needed — render the server order directly, top 20.
  const topEntries = leaderboard.slice(0, 20);

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

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        setStatsLoading(true);
        const stats = await api.getStudyStats().catch(() => EMPTY_PERSONAL_STATS);
        if (cancelled) return;
        setPersonalStats({
          current_streak: stats.current_streak || 0,
          learning_points: stats.learning_points || 0,
          due_count: stats.due_count || 0,
        });
      } catch (err) {
        if (cancelled) return;
        logger.error('leaderboard', 'Failed to load personal study stats', err);
        setPersonalStats(EMPTY_PERSONAL_STATS);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };

    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const personalChips = [
    {
      key: 'streak',
      icon: <Flame size={20} />,
      value: personalStats.current_streak,
      label: 'day streak',
      color: '#b98a3f', // Honey — streak is a "you" stat
    },
    {
      key: 'learning',
      icon: <Trophy size={20} />,
      value: personalStats.learning_points,
      label: 'learning points',
      color: '#63a37f', // Moss
    },
    {
      key: 'due',
      icon: <CalendarClock size={20} />,
      value: personalStats.due_count,
      label: 'cards due',
      color: darkTheme.colors.accent,
    },
  ];

  return (
    <div>
      <h2
        style={{
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '8px',
          color: darkTheme.colors.textPrimary,
        }}
      >
        Progress
      </h2>

      <p
        style={{
          margin: '0 0 20px 0',
          fontSize: '13px',
          color: darkTheme.colors.textSecondary,
        }}
      >
        Peringkat berdasarkan poin belajar dari kuis & review — bukan sekadar unggah catatan.
      </p>

      {/* Level ring — redesign option 2g. Derived from learning_points, so it
          always agrees with the ranking below it. */}
      {!statsLoading && (
        <div
          style={{
            background: 'rgba(255,255,255,.55)',
            backdropFilter: 'blur(26px) saturate(1.3)',
            border: '1px solid rgba(255,255,255,.75)',
            boxShadow: '0 18px 40px rgba(20,44,30,.18)',
            borderRadius: 16,
            padding: '18px 20px',
            marginBottom: '16px',
          }}
        >
          <LevelRing points={personalStats.learning_points} />
        </div>
      )}

      <BadgeShelf />

      {/* Personal study snapshot — reuses the existing /api/study/stats endpoint */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '28px',
        }}
      >
        {personalChips.map((chip) => (
          <div
            key={chip.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              background: darkTheme.colors.bgSecondary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: darkTheme.borderRadius.md,
              minWidth: '140px',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: `${chip.color}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: chip.color,
                flexShrink: 0,
              }}
            >
              {chip.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: '22px',
                  fontWeight: '800',
                  lineHeight: 1,
                  color: darkTheme.colors.textPrimary,
                }}
              >
                {statsLoading ? '…' : chip.value}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginTop: '4px',
                }}
              >
                {chip.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner message="Loading leaderboard..." />
      ) : topEntries.length === 0 ? (
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
          {topEntries.map((entry, index) => (
            <div
              key={index}
              style={{
                padding: '16px 20px',
                borderBottom:
                  index < topEntries.length - 1
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
                  <span style={{ fontSize: '18px' }}>🧠</span>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#63a37f', // Moss
                    }}
                  >
                    {getLearningPoints(entry)}
                  </p>
                </div>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '12px',
                    color: darkTheme.colors.textSecondary,
                  }}
                >
                  learning points
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
