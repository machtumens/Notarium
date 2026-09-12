import { useMemo, useState } from 'react';
import type { AdminUser } from './types';
import { safePhotoUrl } from '../../lib/safeUrl';
import { formatDateTime } from '../../lib/datetime';
import {
  Avatar,
  Button,
  EmptyState,
  Filters,
  Panel,
  Pill,
  RowActions,
  SelectField,
  TableWrap,
  TextField,
  type Tone,
} from '../../components/ops/ConsoleKit';
import {
  ink,
  monoFace,
  rowSubStyle,
  tdNumStyle,
  tdStyle,
  thStyle,
} from '../../components/ops/tokens';

interface UsersTabProps {
  users: AdminUser[];
  actionLoading: number | null;
  setSelectedUser: React.Dispatch<React.SetStateAction<AdminUser | null>>;
  setWarningUser: React.Dispatch<React.SetStateAction<AdminUser | null>>;
  setSuspendingUser: React.Dispatch<React.SetStateAction<AdminUser | null>>;
  handleUnsuspendUser: (userId: number) => Promise<void>;
  handleDeleteUser: (userId: number) => Promise<void>;
  activityLogs: any[];
  showActivityLog: boolean;
  setShowActivityLog: React.Dispatch<React.SetStateAction<boolean>>;
}

type StateFilter = 'all' | 'warned' | 'suspended' | 'clean';
type SortKey = 'name' | 'notes' | 'points';

const ACTION_TONE: Record<string, Tone> = {
  like: 'ok',
  edit: 'info',
  delete: 'crit',
  suspend: 'crit',
  warn: 'warn',
};

export default function UsersTab({
  users,
  actionLoading,
  setSelectedUser,
  setWarningUser,
  setSuspendingUser,
  handleUnsuspendUser,
  handleDeleteUser,
  activityLogs,
  showActivityLog,
  setShowActivityLog,
}: UsersTabProps) {
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [classFilter, setClassFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('name');

  const classes = useMemo(() => {
    const seen = new Set(users.map((u) => u.class).filter(Boolean));
    return Array.from(seen).sort();
  }, [users]);

  // Filtering client-side is fine at school scale (~1-2k rows) and keeps the
  // list responsive as you type. Swap for a server query if the roll grows.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = users.filter((u) => {
      if (stateFilter === 'warned' && !u.warning) return false;
      if (stateFilter === 'suspended' && !u.suspended) return false;
      if (stateFilter === 'clean' && (u.warning || u.suspended)) return false;
      if (classFilter !== 'all' && u.class !== classFilter) return false;
      if (!q) return true;
      return (
        (u.display_name || u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    });
    return [...rows].sort((a, b) => {
      if (sort === 'notes') {
        return (b.notes_uploaded || b.notes_count || 0) - (a.notes_uploaded || a.notes_count || 0);
      }
      if (sort === 'points') return (b.points || 0) - (a.points || 0);
      return (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '');
    });
  }, [users, query, stateFilter, classFilter, sort]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Panel
        legend="Students"
        sub={
          visible.length === users.length
            ? `${users.length} on the roll`
            : `${visible.length} of ${users.length}`
        }
        bodyPadding="0"
        actions={
          <Filters>
            <TextField
              type="search"
              label="Search students"
              placeholder="Name or email"
              value={query}
              onChange={setQuery}
              width="200px"
            />
            <SelectField
              label="Filter by class"
              value={classFilter}
              onChange={setClassFilter}
              options={[
                { value: 'all', label: 'All classes' },
                ...classes.map((c) => ({ value: c, label: c })),
              ]}
            />
            <SelectField<StateFilter>
              label="Filter by standing"
              value={stateFilter}
              onChange={setStateFilter}
              options={[
                { value: 'all', label: 'Any standing' },
                { value: 'clean', label: 'Good standing' },
                { value: 'warned', label: 'Warned' },
                { value: 'suspended', label: 'Suspended' },
              ]}
            />
            <SelectField<SortKey>
              label="Sort"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'name', label: 'By name' },
                { value: 'notes', label: 'Most notes' },
                { value: 'points', label: 'Most points' },
              ]}
            />
          </Filters>
        }
      >
        {visible.length === 0 ? (
          <EmptyState>
            {users.length === 0
              ? 'No students yet.'
              : 'No student matches those filters. Clear the search or widen the standing filter.'}
          </EmptyState>
        ) : (
          <TableWrap maxHeight="620px">
            <thead>
              <tr>
                <th style={thStyle}>Student</th>
                <th style={thStyle}>Class</th>
                <th style={thStyle}>Standing</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Notes</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Points</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Likes</th>
                <th style={thStyle} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => {
                const name = user.display_name || user.name;
                const isBusy = actionLoading === user.id;
                return (
                  <tr key={user.id} className="ops-row">
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <Avatar name={name} photoUrl={safePhotoUrl(user.photo_url)} size={30} />
                        <div style={{ minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={() => setSelectedUser(user)}
                            className="ops-focus"
                            style={{
                              border: 0,
                              background: 'none',
                              padding: 0,
                              font: 'inherit',
                              fontWeight: 500,
                              color: 'inherit',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            {name}
                          </button>
                          <div style={rowSubStyle}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>{user.class || '—'}</td>
                    <td style={tdStyle}>
                      {user.suspended ? (
                        <Pill tone="crit">Suspended</Pill>
                      ) : user.warning ? (
                        <Pill tone="warn">Warned</Pill>
                      ) : (
                        <Pill tone="ok">Good standing</Pill>
                      )}
                    </td>
                    <td style={tdNumStyle}>{user.notes_uploaded || user.notes_count || 0}</td>
                    <td style={tdNumStyle}>{(user.points || 0).toLocaleString()}</td>
                    <td style={tdNumStyle}>{(user.total_likes || 0).toLocaleString()}</td>
                    <td style={tdStyle}>
                      <RowActions>
                        <Button size="xs" onClick={() => setSelectedUser(user)}>
                          Open
                        </Button>
                        {!user.suspended && !user.warning && (
                          <Button size="xs" disabled={isBusy} onClick={() => setWarningUser(user)}>
                            Warn
                          </Button>
                        )}
                        {user.suspended ? (
                          <Button
                            size="xs"
                            disabled={isBusy}
                            onClick={() => handleUnsuspendUser(user.id)}
                          >
                            Lift
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            variant="danger"
                            disabled={isBusy}
                            onClick={() => setSuspendingUser(user)}
                          >
                            Suspend
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="danger"
                          disabled={isBusy}
                          onClick={() => handleDeleteUser(user.id)}
                        >
                          Delete
                        </Button>
                      </RowActions>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <Panel
        legend="Activity log"
        sub={`${activityLogs.length} recent actions`}
        bodyPadding={showActivityLog ? '0' : '14px'}
        actions={
          <Button onClick={() => setShowActivityLog(!showActivityLog)}>
            {showActivityLog ? 'Hide' : 'Show'}
          </Button>
        }
      >
        {!showActivityLog ? (
          <span style={{ fontSize: '12.5px', color: ink.faint }}>
            Every moderator action, written by the server. It cannot be edited from here.
          </span>
        ) : activityLogs.length === 0 ? (
          <EmptyState>No moderator actions recorded yet.</EmptyState>
        ) : (
          <TableWrap maxHeight="480px">
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Account</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {activityLogs.map((log) => (
                <tr key={log.id} className="ops-row">
                  <td style={{ ...tdStyle, fontFamily: monoFace, whiteSpace: 'nowrap' }}>
                    {formatDateTime(log.created_at)}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: monoFace }}>{log.admin_email}</td>
                  <td style={tdStyle}>
                    <Pill tone={ACTION_TONE[log.action_type] ?? 'mute'}>{log.action_type}</Pill>
                  </td>
                  <td style={{ ...tdStyle, color: ink.faint }}>{log.details}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
