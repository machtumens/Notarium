import { useState, useEffect } from 'react';
import api from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import MiniChart from '../components/ops/MiniChart';
import {
  BarList,
  Button,
  Callout,
  EmptyState,
  Panel,
  Pill,
  Readout,
  Readouts,
  TableWrap,
} from '../components/ops/ConsoleKit';
import { ink, rowSubStyle, tdNumStyle, tdStyle, thStyle } from '../components/ops/tokens';
import { formatCalendarDate } from '../lib/datetime';
import { darkTheme } from '../theme';

const t = darkTheme;

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

const num = (n: number | undefined) => (n ?? 0).toLocaleString();

/** Share of the roll, phrased so it needs no second glance. */
function share(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}% of the roll`;
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
    return <LoadingSpinner message="Loading usage statistics…" />;
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Callout tone="crit">{error}</Callout>
        <div>
          <Button variant="primary" onClick={loadStats}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const {
    overview,
    topContributors,
    usersByClass,
    notesByClass,
    popularSubjects,
    dailyActivity,
    dailyRegistrations,
  } = stats;

  const activityPoints = dailyActivity.map((d) => ({ t: d.date, v: d.count }));
  const registrationPoints = dailyRegistrations.map((d) => ({ t: d.date, v: d.count }));
  const busiest = dailyActivity.reduce(
    (best, d) => (d.count > best.count ? d : best),
    dailyActivity[0] ?? { date: '', count: 0 },
  );
  const quietClasses = usersByClass.filter((c) => {
    const notes = notesByClass.find((n) => n.class === c.class)?.count ?? 0;
    return c.count > 0 && notes === 0;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Readouts>
        <Readout
          label="Students"
          value={num(overview.totalUsers)}
          delta={`${num(overview.activeUsers30d)} active in 30 days`}
        />
        <Readout
          label="Active 7d"
          value={num(overview.activeUsers7d)}
          delta={share(overview.activeUsers7d, overview.totalUsers)}
        />
        <Readout
          label="Notes"
          value={num(overview.totalNotes)}
          delta={`${num(overview.notes7d)} added this week`}
        />
        <Readout label="Notes 30d" value={num(overview.notes30d)} />
        <Readout label="Likes given" value={num(overview.totalLikes)} />
        <Readout label="Admin upvotes" value={num(overview.totalAdminUpvotes)} />
        <Readout
          label="Chat sessions"
          value={num(overview.totalChatSessions)}
          delta={`${num(overview.chatSessions7d)} this week`}
        />
        <Readout
          label="Suspended"
          value={num(overview.suspendedUsers)}
          state={overview.suspendedUsers > 0 ? 'crit' : undefined}
        />
        <Readout
          label="Warned"
          value={num(overview.warnedUsers)}
          state={overview.warnedUsers > 0 ? 'warn' : undefined}
        />
      </Readouts>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '14px',
        }}
      >
        <Panel
          legend="Notes added"
          sub={`${dailyActivity.length} days`}
          actions={
            busiest?.date ? (
              <Pill tone="info" bare>
                busiest {formatCalendarDate(busiest.date)} · {busiest.count}
              </Pill>
            ) : undefined
          }
        >
          {activityPoints.length === 0 ? (
            <EmptyState>No uploads recorded in this window.</EmptyState>
          ) : (
            <MiniChart points={activityPoints} color={t.colors.accent} />
          )}
        </Panel>

        <Panel legend="New students" sub={`${dailyRegistrations.length} days`}>
          {registrationPoints.length === 0 ? (
            <EmptyState>No sign-ups recorded in this window.</EmptyState>
          ) : (
            <MiniChart
              points={registrationPoints}
              color={t.palette?.juniper ?? '#3e7d8c'}
              variant="bar"
            />
          )}
        </Panel>

        <Panel legend="Students by class" sub={`${usersByClass.length} classes`}>
          <BarList
            rows={usersByClass.map((c) => ({ label: c.class || 'No class', value: c.count }))}
            empty="No classes have students yet."
          />
        </Panel>

        <Panel legend="Notes by class" sub="who is actually uploading">
          <BarList
            tone="info"
            rows={notesByClass.map((c) => ({ label: c.class || 'No class', value: c.count }))}
            empty="No notes filed against a class yet."
          />
        </Panel>

        <Panel legend="Subjects" sub="by notes filed">
          <BarList
            rows={popularSubjects.map((s) => ({
              label: (
                <span>
                  {s.icon ? `${s.icon} ` : ''}
                  {s.name}
                </span>
              ),
              value: s.note_count,
              note: `${num(s.note_count)} · ${num(s.total_likes)} likes`,
            }))}
            empty="No subjects have notes yet."
          />
        </Panel>

        <Panel legend="Engagement" sub="last 30 days">
          <BarList
            rows={[
              { label: 'Active students', value: overview.activeUsers30d },
              { label: 'Notes added', value: overview.notes30d },
              { label: 'Chat sessions', value: overview.chatSessions30d },
            ]}
          />
          <div style={{ marginTop: '12px', fontSize: '11px', color: ink.fainter }}>
            {share(overview.activeUsers30d, overview.totalUsers)} opened Notarium in the last month.
          </div>
        </Panel>
      </div>

      {quietClasses.length > 0 && (
        <Callout tone="warn">
          <strong>
            {quietClasses.length} class{quietClasses.length === 1 ? '' : 'es'} with students but no
            notes:
          </strong>{' '}
          {quietClasses.map((c) => c.class || 'No class').join(', ')}. Worth an announcement.
        </Callout>
      )}

      <Panel legend="Top contributors" sub={`${topContributors.length} students`} bodyPadding="0">
        {topContributors.length === 0 ? (
          <EmptyState>Nobody has uploaded a note yet.</EmptyState>
        ) : (
          <TableWrap maxHeight="460px">
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '44px', textAlign: 'right' }}>#</th>
                <th style={thStyle}>Student</th>
                <th style={thStyle}>Class</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Notes</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Likes</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Upvotes</th>
              </tr>
            </thead>
            <tbody>
              {topContributors.map((user, index) => (
                <tr key={user.id} className="ops-row">
                  <td style={{ ...tdNumStyle, color: index < 3 ? t.colors.accent : ink.fainter }}>
                    {index + 1}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{user.display_name}</div>
                    <div style={rowSubStyle}>{user.email}</div>
                  </td>
                  <td style={tdStyle}>{user.class || '—'}</td>
                  <td style={tdNumStyle}>{num(user.notes_uploaded)}</td>
                  <td style={tdNumStyle}>{num(user.total_likes)}</td>
                  <td style={tdNumStyle}>{num(user.total_admin_upvotes)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={loadStats}>Refresh</Button>
      </div>
    </div>
  );
}
