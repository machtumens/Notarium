/**
 * People — the register, and every power the worker gives a moderator over it: warn, suspend,
 * unsuspend, reassign class, edit the profile fields, delete the account.
 *
 * Two guards are the worker's, not this screen's, and the UI states them rather than hiding them:
 *  - an account whose `role` is `admin` cannot be warned, suspended or deleted (403), so its row
 *    offers none of the three;
 *  - `role` on the edit form is written ONLY for a `super` token — a moderator's change to that one
 *    field is silently dropped while the rest of the patch lands, which is why it sits apart.
 *
 * NOT HERE, DELIBERATELY: anything to do with a password. No reset, no "set a temporary password",
 * no credential view. The worker has those routes behind `requireAdmin`; they stay a backend
 * operator's job and are not reachable from this dashboard.
 */
import { useMemo, useState } from 'react';
import { admin, type AdminUser } from '@/lib/admin-api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import {
  Async,
  Confirm,
  Field,
  INPUT,
  Panel,
  Said,
  Table,
  TINY,
  Tag,
  primary,
  useAction,
} from './kit';

type Filter = 'all' | 'suspended' | 'warned' | 'noclass' | 'staff';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'warned', label: 'Warned' },
  { key: 'noclass', label: 'No class' },
  { key: 'staff', label: 'Staff' },
];

const name = (u: AdminUser) => u.display_name || u.email.split('@')[0];

export function People() {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const users = useAsync(() => admin.users.list(500), []);
  const classes = useAsync(() => admin.classes.list(), []);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (users.data ?? []).filter((u) => {
      if (filter === 'suspended' && !u.suspended) return false;
      if (filter === 'warned' && !u.warning) return false;
      if (filter === 'noclass' && u.class) return false;
      if (filter === 'staff' && u.role === 'student') return false;
      if (!term) return true;
      return `${u.display_name ?? ''} ${u.email} ${u.class ?? ''}`.toLowerCase().includes(term);
    });
  }, [users.data, filter, q]);

  const open = rows.find((u) => u.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-9">
      <Panel
        title={`Register · ${rows.length} of ${users.data?.length ?? 0}`}
        note="Newest account first. Pick a row to act on it."
        right={
          <>
            <div className="flex gap-4 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="tabline"
                  data-on={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email or class"
              aria-label="Search the register"
              className={cn(INPUT, 'w-[220px] py-1.5 text-[13px]')}
            />
          </>
        }
      >
        <Async loading={users.loading} error={users.error} retry={users.retry}>
          <Table
            cols={[
              { key: 'who', label: 'Account' },
              { key: 'class', label: 'Class', w: '82px' },
              { key: 'role', label: 'Role', w: '92px' },
              { key: 'state', label: 'State', w: '160px' },
              { key: 'notes', label: 'Notes', num: true, w: '66px' },
              { key: 'points', label: 'Points', num: true, w: '70px' },
              { key: 'joined', label: 'Joined', w: '96px' },
              { key: 'act', label: '', w: '86px' },
            ]}
            rows={rows}
            keyOf={(u) => u.id}
            cell={(u, k) =>
              k === 'who' ? (
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-ink">{name(u)}</span>
                  <span className="text-[12px] text-neutral-600 break-all">{u.email}</span>
                </span>
              ) : k === 'class' ? (
                (u.class ?? <span className="text-neutral-500">none</span>)
              ) : k === 'role' ? (
                u.role === 'student' ? (
                  <span className="text-neutral-600">student</span>
                ) : (
                  <Tag on>{u.role}</Tag>
                )
              ) : k === 'state' ? (
                <span className="flex flex-wrap gap-1.5">
                  {u.suspended ? <Tag on>Suspended</Tag> : null}
                  {u.warning ? <Tag>Warned</Tag> : null}
                  {!u.suspended && !u.warning ? <span className="text-neutral-500">—</span> : null}
                </span>
              ) : k === 'notes' ? (
                u.notes_uploaded
              ) : k === 'points' ? (
                u.points
              ) : k === 'joined' ? (
                u.created_at?.slice(0, 10)
              ) : (
                <button
                  type="button"
                  className={TINY}
                  onClick={() => setOpenId(openId === u.id ? null : u.id)}
                >
                  {openId === u.id ? 'Close' : 'Manage'}
                </button>
              )
            }
            empty={q || filter !== 'all' ? 'No account matches that.' : 'The register is empty.'}
          />
        </Async>
      </Panel>

      {open && (
        <Manage
          key={open.id}
          user={open}
          classNames={(classes.data ?? []).filter((c) => c.is_active).map((c) => c.class_name)}
          onChanged={() => {
            users.retry();
          }}
        />
      )}
    </div>
  );
}

/** Everything that can be done to one account, in the order it is usually needed. */
function Manage({
  user,
  classNames,
  onChanged,
}: {
  user: AdminUser;
  classNames: string[];
  onChanged: () => void;
}) {
  const act = useAction(onChanged);
  const isStaff = user.role === 'admin';

  const [warning, setWarning] = useState('');
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [notify, setNotify] = useState(true);
  const [edit, setEdit] = useState({
    display_name: user.display_name ?? '',
    diamonds: String(user.diamonds ?? 0),
    learning_points: '',
    role: user.role,
  });

  const saveProfile = () => {
    const patch: Parameters<typeof admin.users.update>[1] = {};
    if (edit.display_name.trim() && edit.display_name.trim() !== (user.display_name ?? ''))
      patch.display_name = edit.display_name.trim();
    if (edit.diamonds !== String(user.diamonds ?? 0) && edit.diamonds !== '')
      patch.diamonds = Number(edit.diamonds);
    if (edit.learning_points !== '') patch.learning_points = Number(edit.learning_points);
    if (edit.role !== user.role) patch.role = edit.role;
    if (Object.keys(patch).length === 0) return;
    void act.run(`Saved ${Object.keys(patch).join(', ')} for ${name(user)}.`, () =>
      admin.users.update(user.id, patch),
    );
  };

  return (
    <div className="flex flex-col gap-7 border-t-2 border-ink pt-4">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-1">
          <h2 className="text-[clamp(24px,3vw,36px)] max-w-[22ch] [text-wrap:balance]">
            {name(user)}
          </h2>
          <p data-num className="text-[13px] text-neutral-700 break-all">
            {user.email} · id {user.id} · {user.class ?? 'no class'} · joined{' '}
            {user.created_at?.slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.suspended ? (
            <Tag on>Suspended until {user.suspension_end_date?.slice(0, 10)}</Tag>
          ) : null}
          {user.warning ? <Tag>Warning open</Tag> : null}
          {isStaff ? <Tag on>Protected · staff account</Tag> : null}
        </div>
      </div>

      {(user.suspension_reason || user.warning_message) && (
        <div className="flex flex-col gap-2 border-t border-neutral-300 pt-2.5">
          {user.suspension_reason && (
            <p className="text-[13.5px] text-neutral-800 [text-wrap:pretty]">
              <span className="meta mr-2">Suspension reason</span>
              {user.suspension_reason}
            </p>
          )}
          {user.warning_message && (
            <p className="text-[13.5px] text-neutral-800 [text-wrap:pretty]">
              <span className="meta mr-2">Warning text</span>
              {user.warning_message}
            </p>
          )}
        </div>
      )}

      <Said said={act.said} />

      <div className="flex flex-wrap gap-x-10 gap-y-7">
        <Panel
          title="Warn"
          quiet
          note={
            isStaff
              ? 'The worker refuses to warn a staff account.'
              : 'Sets the warning flag and sends them a notification they have to read.'
          }
          className="flex-[1_1_300px] min-w-[min(100%,280px)]"
        >
          <textarea
            value={warning}
            onChange={(e) => setWarning(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="What they did, and what to do instead."
            aria-label="Warning message"
            className={cn(INPUT, 'resize-y')}
            disabled={isStaff}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isStaff || act.busy || !warning.trim()}
              onClick={() =>
                void act.run(`Warned ${name(user)}.`, () =>
                  admin.users.warn(user.id, warning.trim()).then(() => setWarning('')),
                )
              }
              className={cn(
                primary,
                'px-4 py-2 text-[13px] disabled:opacity-40 disabled:pointer-events-none',
              )}
            >
              Send warning
            </button>
            <span data-num className="text-[11.5px] text-neutral-600">
              {warning.length}/500
            </span>
          </div>
        </Panel>

        <Panel
          title={user.suspended ? 'Suspension' : 'Suspend'}
          quiet
          note={
            isStaff
              ? 'The worker refuses to suspend a staff account.'
              : 'They keep the account and lose access until the end date.'
          }
          className="flex-[1_1_300px] min-w-[min(100%,280px)]"
        >
          {user.suspended ? (
            <button
              type="button"
              disabled={act.busy}
              onClick={() =>
                void act.run(`Lifted the suspension on ${name(user)}.`, () =>
                  admin.users.unsuspend(user.id),
                )
              }
              className={cn(primary, 'self-start px-4 py-2 text-[13px]')}
            >
              Lift the suspension
            </button>
          ) : (
            <>
              <div className="flex flex-wrap gap-4">
                <Field label="Days" hint="1 to 365">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className={cn(INPUT, 'max-w-[110px]')}
                    disabled={isStaff}
                  />
                </Field>
                <Field label="Reason" hint="They see this.">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    placeholder="Repeated plagiarism"
                    className={INPUT}
                    disabled={isStaff}
                  />
                </Field>
              </div>
              <Confirm
                label="Suspend"
                confirmLabel={`Suspend for ${days}d — confirm`}
                disabled={isStaff || act.busy}
                className="self-start"
                onConfirm={() =>
                  void act.run(`Suspended ${name(user)} for ${days} days.`, () =>
                    admin.users.suspend(user.id, days, reason.trim() || 'Suspended by admin'),
                  )
                }
              />
            </>
          )}
        </Panel>

        <Panel
          title="Class"
          quiet
          note="Moves them and their grade together; the class must be active."
          className="flex-[1_1_260px] min-w-[min(100%,240px)]"
        >
          <Field label="Move to" className="grow-0">
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={INPUT}>
              <option value="">Pick a class…</option>
              {classNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2.5 text-[13px] font-semibold text-neutral-800">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="accent-ink w-4 h-4"
            />
            Tell them about the move
          </label>
          <button
            type="button"
            disabled={act.busy || !moveTo}
            onClick={() =>
              void act.run(`Moved ${name(user)} to ${moveTo}.`, () =>
                admin.users.reassign(user.id, moveTo, notify),
              )
            }
            className={cn(
              primary,
              'self-start px-4 py-2 text-[13px] disabled:opacity-40 disabled:pointer-events-none',
            )}
          >
            Reassign
          </button>
        </Panel>

        <Panel
          title="Profile"
          quiet
          note="Blank fields are left alone. Points and diamonds are the gamification counters, not computed values."
          className="flex-[1_1_320px] min-w-[min(100%,300px)]"
        >
          <div className="flex flex-wrap gap-4">
            <Field label="Display name">
              <input
                value={edit.display_name}
                onChange={(e) => setEdit((s) => ({ ...s, display_name: e.target.value }))}
                className={INPUT}
              />
            </Field>
            <Field label="Diamonds">
              <input
                type="number"
                min={0}
                value={edit.diamonds}
                onChange={(e) => setEdit((s) => ({ ...s, diamonds: e.target.value }))}
                className={cn(INPUT, 'max-w-[120px]')}
              />
            </Field>
            <Field label="Learning points" hint="Leave blank to keep what they have.">
              <input
                type="number"
                min={0}
                value={edit.learning_points}
                onChange={(e) => setEdit((s) => ({ ...s, learning_points: e.target.value }))}
                className={cn(INPUT, 'max-w-[140px]')}
              />
            </Field>
          </div>
          <Field
            label="Role"
            className="grow-0"
            hint="Only a super-admin token can change this; anyone else's change to it is dropped and the rest still saves."
          >
            <select
              value={edit.role}
              onChange={(e) => setEdit((s) => ({ ...s, role: e.target.value }))}
              className={INPUT}
            >
              <option value="student">student</option>
              <option value="admin">admin</option>
            </select>
          </Field>
          <button
            type="button"
            disabled={act.busy}
            onClick={saveProfile}
            className={cn(primary, 'self-start px-4 py-2 text-[13px]')}
          >
            Save profile
          </button>
        </Panel>
      </div>

      <Panel
        title="Delete the account"
        quiet
        note={
          isStaff
            ? 'The worker refuses to delete a staff account, and refuses outright if it would leave no admin behind.'
            : 'Removes the account, every note they wrote, their likes and their log entries. There is no undo and no export — read the register row before you press it.'
        }
      >
        <Confirm
          label="Delete this account"
          confirmLabel={`Delete ${name(user)} and their notes — confirm`}
          disabled={isStaff || act.busy}
          className="self-start"
          onConfirm={() =>
            void act.run(`Deleted ${name(user)}.`, () => admin.users.remove(user.id))
          }
        />
      </Panel>
    </div>
  );
}
