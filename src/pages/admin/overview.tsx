/**
 * Overview — the whole school in one screenful, read-only. Everything here comes from
 * `/api/admin/usage-stats` (requireModerator) plus `/api/ops/metrics` (requireTechnical), so an
 * admin with only one of the two sub-roles sees that half and a plain line where the other was.
 */
import { admin, ops } from '@/lib/admin-api';
import { useAsync } from '@/lib/use-async';
import { Async, Bars, Panel, Stat, StatRow, Table } from './kit';

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}% of all` : '—';

export function Overview() {
  const stats = useAsync(() => admin.stats(), []);
  const metrics = useAsync(() => ops.metrics(), []);
  const s = stats.data;
  const m = metrics.data;

  return (
    <div className="flex flex-col gap-9">
      <Panel
        title="Live right now"
        note="Signed-in accounts by last activity. The worker stamps `last_seen_at` on every authenticated request, so this is real traffic, not a session count."
      >
        <Async loading={metrics.loading} error={metrics.error} retry={metrics.retry}>
          {m && (
            <StatRow>
              <Stat label="Last 5 minutes" value={m.live_users.m5} />
              <Stat label="Last hour" value={m.live_users.h1} />
              <Stat
                label="Last 24 hours"
                value={m.live_users.d1}
                sub={pct(m.live_users.d1, m.totals.users)}
              />
              <Stat label="Accounts" value={m.totals.users} />
              <Stat label="Notes" value={m.totals.notes} sub="not deleted" />
            </StatRow>
          )}
        </Async>
      </Panel>

      <Panel
        title="People and work"
        note="Activity counts a student who wrote a note, opened a chat session or liked a note inside the window."
      >
        <Async loading={stats.loading} error={stats.error} retry={stats.retry}>
          {s && (
            <div className="flex flex-col gap-6">
              <StatRow>
                <Stat label="Accounts" value={s.overview.totalUsers} />
                <Stat
                  label="Active · 7 days"
                  value={s.overview.activeUsers7d}
                  sub={pct(s.overview.activeUsers7d, s.overview.totalUsers)}
                />
                <Stat
                  label="Active · 30 days"
                  value={s.overview.activeUsers30d}
                  sub={pct(s.overview.activeUsers30d, s.overview.totalUsers)}
                />
                <Stat label="Suspended" value={s.overview.suspendedUsers} />
                <Stat label="Open warnings" value={s.overview.warnedUsers} />
              </StatRow>
              <StatRow>
                <Stat label="Notes" value={s.overview.totalNotes} />
                <Stat label="Notes · 7 days" value={s.overview.notes7d} />
                <Stat label="Notes · 30 days" value={s.overview.notes30d} />
                <Stat label="Student likes" value={s.overview.totalLikes} />
                <Stat label="Admin upvotes" value={s.overview.totalAdminUpvotes} />
              </StatRow>
            </div>
          )}
        </Async>
      </Panel>

      <div className="flex flex-wrap gap-x-10 gap-y-9">
        <Panel
          title="Notes written · last 14 days"
          className="flex-[1_1_320px] min-w-[min(100%,300px)]"
        >
          <Async loading={stats.loading} error={stats.error} retry={stats.retry}>
            {s && (
              <Bars
                points={s.dailyActivity.map((d) => ({ t: d.date, v: d.count }))}
                label="Notes"
              />
            )}
          </Async>
        </Panel>
        <Panel title="Sign-ups · last 14 days" className="flex-[1_1_320px] min-w-[min(100%,300px)]">
          <Async loading={stats.loading} error={stats.error} retry={stats.retry}>
            {s && (
              <Bars
                points={s.dailyRegistrations.map((d) => ({ t: d.date, v: d.count }))}
                label="Sign-ups"
              />
            )}
          </Async>
        </Panel>
      </div>

      <Panel
        title="Top contributors"
        note="Students only — admin accounts are excluded by the query."
      >
        <Async loading={stats.loading} error={stats.error} retry={stats.retry}>
          {s && (
            <Table
              cols={[
                { key: 'name', label: 'Student' },
                { key: 'class', label: 'Class', w: '88px' },
                { key: 'notes', label: 'Notes', num: true, w: '72px' },
                { key: 'likes', label: 'Likes', num: true, w: '72px' },
                { key: 'upvotes', label: 'Upvotes', num: true, w: '88px' },
              ]}
              rows={s.topContributors}
              keyOf={(r) => r.id}
              cell={(r, k) =>
                k === 'name' ? (
                  <span className="font-semibold text-ink">{r.display_name || '—'}</span>
                ) : k === 'class' ? (
                  (r.class ?? '—')
                ) : k === 'notes' ? (
                  r.notes_uploaded
                ) : k === 'likes' ? (
                  r.total_likes
                ) : (
                  r.total_admin_upvotes
                )
              }
              empty="No student has written a note yet."
            />
          )}
        </Async>
      </Panel>

      <div className="flex flex-wrap gap-x-10 gap-y-9">
        <Panel title="Notes by subject" className="flex-[1_1_300px] min-w-[min(100%,280px)]">
          <Async loading={stats.loading} error={stats.error} retry={stats.retry}>
            {s && (
              <Table
                cols={[
                  { key: 'name', label: 'Subject' },
                  { key: 'notes', label: 'Notes', num: true, w: '72px' },
                  { key: 'likes', label: 'Likes', num: true, w: '72px' },
                ]}
                rows={s.popularSubjects}
                keyOf={(r) => r.id}
                cell={(r, k) =>
                  k === 'name' ? r.name : k === 'notes' ? r.note_count : (r.total_likes ?? 0)
                }
              />
            )}
          </Async>
        </Panel>
        <Panel
          title="Students and notes by class"
          className="flex-[1_1_300px] min-w-[min(100%,280px)]"
        >
          <Async loading={stats.loading} error={stats.error} retry={stats.retry}>
            {s && (
              <Table
                cols={[
                  { key: 'class', label: 'Class' },
                  { key: 'students', label: 'Students', num: true, w: '84px' },
                  { key: 'notes', label: 'Notes', num: true, w: '72px' },
                ]}
                rows={s.usersByClass}
                keyOf={(r) => r.class}
                cell={(r, k) =>
                  k === 'class'
                    ? r.class
                    : k === 'students'
                      ? r.count
                      : (s.notesByClass.find((n) => n.class === r.class)?.count ?? 0)
                }
                empty="No class has any students assigned."
              />
            )}
          </Async>
        </Panel>
      </div>
    </div>
  );
}
