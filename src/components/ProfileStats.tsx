import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../App';
import { darkTheme, modalOverlayStyle, inputStyle, buttonPrimaryStyle } from '../theme';
import type { LeaderboardEntry } from '../types';

interface ProfileStatsProps {
  onClose: () => void;
  onEditProfile: () => void;
}

export default function ProfileStats({ onClose, onEditProfile }: ProfileStatsProps) {
  const { user, refreshUser } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [photoError, setPhotoError] = useState('');

  // Study stats (retrieval-based learning: streaks + learning points + due reviews)
  const [studyStats, setStudyStats] = useState<{
    current_streak: number;
    longest_streak: number;
    learning_points: number;
    due_count: number;
  } | null>(null);
  const [studyStatsLoading, setStudyStatsLoading] = useState(true);
  const [studyStatsError, setStudyStatsError] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the mount effect; behavior-preserving
    loadLeaderboard();
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the mount effect; behavior-preserving
    loadStudyStats();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const data = await api.getLeaderboard();
      const lb = data.leaderboard || [];
      const rank = lb.findIndex((u) => u.id === user?.id) + 1;
      setLeaderboard(lb);
      setUserRank(rank > 0 ? rank : null);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStudyStats = async () => {
    try {
      setStudyStatsError(false);
      const stats = await api.getStudyStats();
      setStudyStats({
        current_streak: stats?.current_streak || 0,
        longest_streak: stats?.longest_streak || 0,
        learning_points: stats?.learning_points || 0,
        due_count: stats?.due_count || 0,
      });
    } catch (error) {
      console.error('Failed to load study stats:', error);
      setStudyStatsError(true);
    } finally {
      setStudyStatsLoading(false);
    }
  };

  const getGradientColor = (index: number) => {
    const colors = [
      'linear-gradient(135deg, #ff6b6b, #ee5a6f)',
      'linear-gradient(135deg, #4ecdc4, #44a08d)',
      'linear-gradient(135deg, #f39c12, #e67e22)',
      'linear-gradient(135deg, #9b59b6, #8e44ad)',
      'linear-gradient(135deg, #3498db, #2980b9)',
    ];
    return colors[index % colors.length];
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setPhotoError('Image too large. Please choose an image smaller than 2MB.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          setSavingName(true);
          const base64String = reader.result as string;
          await api.updateProfile({ photo_url: base64String });
          await refreshUser();
          setPhotoError('');
        } catch (error: unknown) {
          setPhotoError(
            error instanceof Error ? error.message : 'Failed to update profile picture',
          );
        } finally {
          setSavingName(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveName = async () => {
    if (!newName.trim()) {
      setPhotoError('Name cannot be empty');
      return;
    }

    try {
      setSavingName(true);
      await api.updateProfile({ name: newName });
      await refreshUser();
      setEditingName(false);
      setPhotoError('');
    } catch (error: unknown) {
      setPhotoError(error instanceof Error ? error.message : 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div
        style={{
          ...modalOverlayStyle,
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: darkTheme.colors.bgPrimary,
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '500px',
            width: '100%',
            border: `1px solid ${darkTheme.colors.borderColor}`,
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'relative',
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
            }}
          >
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', margin: 0 }}>
              My Profile
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: darkTheme.colors.textSecondary,
                cursor: 'pointer',
                fontSize: '24px',
                transition: darkTheme.transitions.default,
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseOut={(e) => (e.currentTarget.style.color = darkTheme.colors.textSecondary)}
            >
              ✕
            </button>
          </div>

          {/* User Header with Edit Capabilities */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              marginBottom: '32px',
              paddingBottom: '24px',
              borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
            }}
          >
            {/* Editable Profile Picture */}
            <label style={{ cursor: 'pointer', position: 'relative', display: 'block' }}>
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  background: user?.photo_url
                    ? `url('${user.photo_url}') center/cover`
                    : `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '32px',
                  flexShrink: 0,
                  border: `2px solid ${darkTheme.colors.borderColor}`,
                  transition: 'all 0.3s ease',
                  position: 'relative',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.boxShadow = `0 0 20px ${darkTheme.colors.accent}`;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {!user?.photo_url && user?.name?.charAt(0).toUpperCase()}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    background: darkTheme.colors.accent,
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '14px',
                    border: `2px solid ${darkTheme.colors.bgPrimary}`,
                    transition: 'transform 0.2s ease',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'scale(1.15)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  ✏️
                </div>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={savingName}
                style={{ display: 'none' }}
              />
            </label>

            {/* Editable Name and Info */}
            <div style={{ flex: 1 }}>
              {editingName ? (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={savingName}
                    style={
                      {
                        ...inputStyle,
                        flex: 1,
                        padding: '6px 12px',
                        fontSize: '16px',
                      } as React.CSSProperties
                    }
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    style={{
                      padding: '6px 12px',
                      background: darkTheme.colors.accent,
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: savingName ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}
                  >
                    {savingName ? '...' : '✓'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setNewName(user?.name || '');
                    }}
                    disabled={savingName}
                    style={{
                      padding: '6px 12px',
                      background: 'transparent',
                      color: darkTheme.colors.textSecondary,
                      border: `1px solid ${darkTheme.colors.borderColor}`,
                      borderRadius: '6px',
                      cursor: savingName ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <h3
                  style={{
                    fontSize: '20px',
                    fontWeight: '700',
                    margin: '0 0 8px 0',
                    cursor: 'pointer',
                    transition: 'color 0.2s',
                    color: '#fff',
                  }}
                  onClick={() => setEditingName(true)}
                  onMouseOver={(e) => (e.currentTarget.style.color = darkTheme.colors.accent)}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#fff')}
                >
                  {user?.name}
                  <span style={{ fontSize: '14px', marginLeft: '8px', opacity: 0.6 }}>✏️</span>
                </h3>
              )}
              <p style={{ fontSize: '14px', color: darkTheme.colors.textSecondary, margin: 0 }}>
                {user?.class}
              </p>
              <p style={{ fontSize: '12px', color: darkTheme.colors.accent, margin: '4px 0 0 0' }}>
                {user?.role === 'admin' ? '👑 Admin' : '📚 Student'}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {photoError && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#fca5a5',
                padding: '10px 12px',
                borderRadius: darkTheme.borderRadius.md,
                fontSize: '12px',
                marginBottom: '16px',
              }}
            >
              {photoError}
            </div>
          )}

          {/* Points Highlight - Full Width */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706, #b45309)',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              color: 'white',
              marginBottom: '16px',
              boxShadow: '0 8px 32px rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
            }}
          >
            <div style={{ fontSize: '48px' }}>🪙</div>
            <div>
              <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '4px' }}>
                {Math.max(0, user?.points || 0)}
              </div>
              <div style={{ fontSize: '13px', opacity: 0.95, fontWeight: '500' }}>Points</div>
            </div>
          </div>

          {/* Study Streak Highlight (retrieval-based practice) */}
          {studyStatsError ? (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#fca5a5',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '13px',
                textAlign: 'center',
                marginBottom: '16px',
              }}
            >
              Gagal memuat statistik belajar.
            </div>
          ) : (
            <div
              style={{
                background: 'linear-gradient(135deg, #f97316, #ef4444, #dc2626)',
                borderRadius: '12px',
                padding: '20px 24px',
                color: 'white',
                marginBottom: '16px',
                boxShadow: '0 8px 32px rgba(249, 115, 22, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
              }}
            >
              <div style={{ fontSize: '44px', lineHeight: 1 }}>🔥</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '2px' }}>
                  {studyStatsLoading ? '…' : `${studyStats?.current_streak ?? 0}-day`}
                </div>
                <div style={{ fontSize: '13px', opacity: 0.95, fontWeight: '500' }}>
                  Study Streak
                </div>
                {!studyStatsLoading && (studyStats?.due_count ?? 0) > 0 && (
                  <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '6px' }}>
                    📅 {studyStats?.due_count} review{(studyStats?.due_count ?? 0) === 1 ? '' : 's'}{' '}
                    due
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Study Stats Grid (longest streak + learning points) */}
          {!studyStatsError && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              {/* Longest Streak */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #fb923c, #f97316)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  color: 'white',
                }}
              >
                <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {studyStatsLoading ? '…' : (studyStats?.longest_streak ?? 0)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>Longest Streak</div>
              </div>

              {/* Learning Points (retrieval-based) */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  color: 'white',
                }}
              >
                <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {studyStatsLoading ? '…' : (studyStats?.learning_points ?? 0)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>Learning Points</div>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
              marginBottom: '32px',
            }}
          >
            {/* Notes Created */}
            <div
              style={{
                background: getGradientColor(0),
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                color: 'white',
              }}
            >
              <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
                {user?.notes_count || 0}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>Notes Created</div>
            </div>

            {/* Likes Received */}
            <div
              style={{
                background: getGradientColor(1),
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                color: 'white',
              }}
            >
              <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
                {user?.total_likes || 0}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>Likes Received</div>
            </div>

            {/* Leaderboard Rank */}
            <div
              style={{
                background: getGradientColor(2),
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                color: 'white',
              }}
            >
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  marginBottom: '8px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {userRank ? `#${userRank}` : 'N/A'}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>Rank</div>
            </div>

            {/* Points */}
            <div
              style={{
                background: getGradientColor(3),
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                color: 'white',
              }}
            >
              <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
                {Math.max(0, user?.points || 0)}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>Points</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                onEditProfile();
                onClose();
              }}
              style={
                {
                  ...buttonPrimaryStyle,
                  flex: 1,
                  padding: '12px 20px',
                } as React.CSSProperties
              }
            >
              <i className="fas fa-edit" style={{ marginRight: '8px' }}></i>
              Edit Profile
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '12px 20px',
                background: darkTheme.colors.bgSecondary,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                borderRadius: darkTheme.borderRadius.md,
                color: darkTheme.colors.textPrimary,
                cursor: 'pointer',
                fontWeight: '500',
                transition: darkTheme.transitions.default,
                flex: 1,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
              onMouseOut={(e) => (e.currentTarget.style.background = darkTheme.colors.bgSecondary)}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
