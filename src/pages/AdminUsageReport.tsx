import { useState, useEffect } from 'react';
import api from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkTheme, cardStyle } from '../theme';

interface UsageStats {
  overview: {
    totalUsers: number;
    activeUsers7d: number;
    activeUsers30d: number;
    totalNotes: number;
    notes7d: number;
    notes30d: number;
    totalLikes: number;
    totalAdminUpvotes: number;
    totalChatSessions: number;
    chatSessions7d: number;
    chatSessions30d: number;
    suspendedUsers: number;
    warnedUsers: number;
  };
  topContributors: Array<{
    id: number;
    display_name: string;
    email: string;
    class: string;
    notes_uploaded: number;
    total_likes: number;
    total_admin_upvotes: number;
  }>;
  usersByClass: Array<{ class: string; count: number }>;
  notesByClass: Array<{ class: string; count: number }>;
  popularSubjects: Array<{
    id: number;
    name: string;
    icon: string;
    note_count: number;
    total_likes: number;
  }>;
  dailyActivity: Array<{ date: string; count: number }>;
  dailyRegistrations: Array<{ date: string; count: number }>;
}

export default function AdminUsageReport() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the mount effect; behavior-preserving
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.request('/api/admin/usage-stats', {
        method: 'GET',
      });
      setStats(response);
    } catch (error: unknown) {
      console.error('Failed to load usage statistics:', error);
      setError(error instanceof Error ? error.message : 'Failed to load usage statistics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading usage statistics..." />;
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ color: '#fca5a5', marginBottom: '16px' }}>Error: {error}</div>
        <button
          onClick={loadStats}
          style={{
            padding: '10px 20px',
            background: darkTheme.colors.accent,
            border: 'none',
            color: 'white',
            borderRadius: darkTheme.borderRadius.md,
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const {
    overview,
    topContributors,
    usersByClass,
    notesByClass,
    popularSubjects: _popularSubjects,
    dailyActivity,
    dailyRegistrations: _dailyRegistrations,
  } = stats;

  return (
    <div>
      <h2
        style={{
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '24px',
          color: 'white',
        }}
      >
        Usage Report
      </h2>

      {/* Overview Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div style={{ ...cardStyle, padding: '20px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
            {overview.totalUsers}
          </div>
          <div style={{ fontSize: '14px', color: 'white' }}>Total Users</div>
        </div>

        <div style={{ ...cardStyle, padding: '20px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
            {overview.activeUsers7d}
          </div>
          <div style={{ fontSize: '14px', color: 'white' }}>Active (7d)</div>
        </div>

        <div style={{ ...cardStyle, padding: '20px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
            {overview.activeUsers30d}
          </div>
          <div style={{ fontSize: '14px', color: 'white' }}>Active (30d)</div>
        </div>

        <div style={{ ...cardStyle, padding: '20px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
            {overview.totalNotes}
          </div>
          <div style={{ fontSize: '14px', color: 'white' }}>Total Notes</div>
        </div>

        <div style={{ ...cardStyle, padding: '20px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
            {overview.totalLikes}
          </div>
          <div style={{ fontSize: '14px', color: 'white' }}>Total Likes</div>
        </div>

        <div style={{ ...cardStyle, padding: '20px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
            {overview.totalAdminUpvotes}
          </div>
          <div style={{ fontSize: '14px', color: 'white' }}>Admin Likes</div>
        </div>

        <div style={{ ...cardStyle, padding: '20px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
            {overview.totalChatSessions}
          </div>
          <div style={{ fontSize: '14px', color: 'white' }}>Chat Sessions</div>
        </div>

        <div style={{ ...cardStyle, padding: '20px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
            {overview.suspendedUsers}
          </div>
          <div style={{ fontSize: '14px', color: 'white' }}>Suspended</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: 'white' }}>
          Recent Activity (Last 7 Days)
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '16px',
          }}
        >
          <div style={{ ...cardStyle, padding: '20px' }}>
            <div style={{ fontSize: '14px', color: 'white', marginBottom: '8px' }}>New Notes</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: 'white' }}>
              {overview.notes7d}
            </div>
          </div>
          <div style={{ ...cardStyle, padding: '20px' }}>
            <div style={{ fontSize: '14px', color: 'white', marginBottom: '8px' }}>
              New Chat Sessions
            </div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: 'white' }}>
              {overview.chatSessions7d}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        {/* Users by Class */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: 'white' }}>
            Users by Class
          </h3>
          {usersByClass.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {usersByClass.map((item) => (
                <div key={item.class}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>
                      {item.class}
                    </span>
                    <span style={{ fontSize: '14px', color: 'white' }}>{item.count}</span>
                  </div>
                  <div
                    style={{
                      height: '8px',
                      background: darkTheme.colors.bgSecondary,
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${(item.count / Math.max(...usersByClass.map((u) => u.count))) * 100}%`,
                        background: `linear-gradient(90deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'white', padding: '20px' }}>
              No data available
            </div>
          )}
        </div>

        {/* Notes by Class */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: 'white' }}>
            Notes by Class
          </h3>
          {notesByClass.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {notesByClass.map((item) => (
                <div key={item.class}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>
                      {item.class}
                    </span>
                    <span style={{ fontSize: '14px', color: 'white' }}>{item.count}</span>
                  </div>
                  <div
                    style={{
                      height: '8px',
                      background: darkTheme.colors.bgSecondary,
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${(item.count / Math.max(...notesByClass.map((n) => n.count))) * 100}%`,
                        background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'white', padding: '20px' }}>
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Top Contributors */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: 'white' }}>
          Top Contributors
        </h3>
        <div style={{ ...cardStyle, padding: 0, overflow: 'auto' }}>
          {topContributors.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead
                style={{ background: darkTheme.colors.bgSecondary, position: 'sticky', top: 0 }}
              >
                <tr>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: '600',
                      fontSize: '13px',
                      color: 'white',
                    }}
                  >
                    Rank
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: '600',
                      fontSize: '13px',
                      color: 'white',
                    }}
                  >
                    User
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: '600',
                      fontSize: '13px',
                      color: 'white',
                    }}
                  >
                    Class
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontWeight: '600',
                      fontSize: '13px',
                      color: 'white',
                    }}
                  >
                    Notes
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontWeight: '600',
                      fontSize: '13px',
                      color: 'white',
                    }}
                  >
                    Likes
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontWeight: '600',
                      fontSize: '13px',
                      color: 'white',
                    }}
                  >
                    Admin Likes
                  </th>
                </tr>
              </thead>
              <tbody>
                {topContributors.map((user, index) => (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                      transition: darkTheme.transitions.default,
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = darkTheme.colors.bgSecondary)
                    }
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background:
                            index === 0
                              ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                              : index === 1
                                ? 'linear-gradient(135deg, #d1d5db, #9ca3af)'
                                : index === 2
                                  ? 'linear-gradient(135deg, #f97316, #ea580c)'
                                  : darkTheme.colors.bgSecondary,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700',
                          fontSize: '14px',
                          color: 'white',
                        }}
                      >
                        {index + 1}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '500', fontSize: '14px', color: 'white' }}>
                        {user.display_name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'white' }}>{user.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: 'white' }}>
                      {user.class}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'white',
                      }}
                    >
                      {user.notes_uploaded}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'white',
                      }}
                    >
                      {user.total_likes}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'white',
                      }}
                    >
                      {user.total_admin_upvotes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: 'center', color: 'white', padding: '40px' }}>
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Daily Activity Chart */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: 'white' }}>
          Daily Notes Activity (Last 14 Days)
        </h3>
        <div style={{ ...cardStyle, padding: '24px' }}>
          {dailyActivity.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '200px' }}>
              {dailyActivity.map((day) => (
                <div
                  key={day.date}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'white' }}>
                    {day.count}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: `${(day.count / Math.max(...dailyActivity.map((d) => d.count))) * 150}px`,
                      minHeight: '4px',
                      background: `linear-gradient(180deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                      borderRadius: '4px 4px 0 0',
                      transition: 'all 0.3s ease',
                    }}
                    title={`${day.date}: ${day.count} notes`}
                  />
                  <div
                    style={{
                      fontSize: '10px',
                      color: 'white',
                      transform: 'rotate(-45deg)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {new Date(day.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'white', padding: '40px' }}>
              No activity data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
