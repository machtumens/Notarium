/**
 * System — the switches that change the platform rather than its contents, and the log of every
 * admin action taken through it.
 *
 * The flags live in KV, not the database, so they take effect on the next request everywhere at
 * once and survive a redeploy. Absence means enabled: the worker reads `flag:uploads === 'off'`,
 * so turning one back on deletes the key rather than writing `'on'`.
 *
 * `requireTechnical` guards all of it, and the two routes under "Irreversible" additionally need
 * a `super` token — a technical admin gets a 403 there, which the panel says plainly.
 */
import { useState } from 'react';
import {
  admin,
  ops,
  FLAG_KEYS,
  RECOMPUTE_TARGETS,
  type FlagKey,
  type RecomputeTarget,
} from '@/lib/admin-api';
import { API_URL, token } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { Async, Confirm, Field, INPUT, Panel, Said, Table, TINY, Tag, useAction } from './kit';

const FLAG_COPY: Record<FlagKey, { label: string; on: string; off: string }> = {
  signups: {
    label: 'Sign-ups',
    on: 'New accounts can be created.',
    off: 'Sign-up is closed. Existing accounts still work.',
  },
  uploads: {
    label: 'Note uploads',
    on: 'Students can publish notes.',
    off: 'Publishing is blocked. Reading still works.',
  },
  ai_chat: {
    label: 'AI chat',
    on: 'The AI routes answer.',
    off: 'The AI routes are off, so no provider calls are billed.',
  },
};

const RECOMPUTE_COPY: Record<RecomputeTarget, string> = {
  subjects_note_count:
    'Recount each subject’s notes from the notes table. Fixes a rail or Discover count that has drifted.',
  user_notes_uploaded:
    'Recount each student’s notes. Fixes a leaderboard or profile figure that has drifted.',
  usage_snapshot:
    'Write today’s row into usage_stats. Skipped with a note on a database that never got that table.',
};

export function System() {
  const flags = useAsync(() => ops.flags(), []);
  const logs = useAsync(() => admin.activity(100), []);
  const act = useAction(() => {
    flags.retry();
    logs.retry();
  });
  const [purgeDays, setPurgeDays] = useState(30);

  const f = flags.data;

  /** The CSV download is a plain GET that needs the bearer, so fetch it and hand the blob over. */
  const [exporting, setExporting] = useState(false);
  const exportLog = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/api/ops/activity-log.csv`, {
        headers: { Authorization: `Bearer ${token.get() ?? ''}` },
      });
      if (!res.ok)
        throw new Error(
          res.status === 403
            ? 'Your admin role does not cover the export.'
            : `The worker answered ${res.status}.`,
        );
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `notarium-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      void act.run('', () => Promise.reject(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-9">
      <Said said={act.said} />

      <Panel
        title="Maintenance mode"
        note="Turns the whole API read-only: everything but health, readiness and the ops routes answers 503. Use it while a migration runs, not as a way to close the school."
      >
        <Async loading={flags.loading} error={flags.error} retry={flags.retry}>
          {f && (
            <div className="flex flex-wrap items-center gap-4">
              <Tag on={f.maintenance}>
                {f.maintenance ? 'Maintenance is ON' : 'Serving normally'}
              </Tag>
              {f.maintenance ? (
                <button
                  type="button"
                  disabled={act.busy}
                  className={cn(TINY, 'bg-ink text-accent-100 border-ink')}
                  onClick={() =>
                    void act.run('Maintenance mode off — the API is serving again.', () =>
                      ops.setMaintenance(false),
                    )
                  }
                >
                  Turn maintenance off
                </button>
              ) : (
                <Confirm
                  label="Turn maintenance on"
                  confirmLabel="Take the whole API down — confirm"
                  disabled={act.busy}
                  onConfirm={() =>
                    void act.run('Maintenance mode on — the API is answering 503.', () =>
                      ops.setMaintenance(true),
                    )
                  }
                />
              )}
            </div>
          )}
        </Async>
      </Panel>

      <Panel
        title="Feature switches"
        note="Each one takes effect on the next request, across every client. They live outside the database, so a redeploy does not reset them."
      >
        <Async loading={flags.loading} error={flags.error} retry={flags.retry}>
          {f && (
            <div className="flex flex-col">
              {FLAG_KEYS.map((key) => {
                const on = f[key];
                const copy = FLAG_COPY[key];
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-neutral-300 py-3"
                  >
                    <span className="flex-1 min-w-[min(100%,220px)] flex flex-col gap-0.5">
                      <span className="text-[14.5px] font-extrabold tracking-[-0.02em] text-ink">
                        {copy.label}
                      </span>
                      <span className="text-[12.5px] text-neutral-700 [text-wrap:pretty]">
                        {on ? copy.on : copy.off}
                      </span>
                    </span>
                    <Tag on={on}>{on ? 'On' : 'Off'}</Tag>
                    <button
                      type="button"
                      disabled={act.busy}
                      className={TINY}
                      onClick={() =>
                        void act.run(`${copy.label} turned ${on ? 'off' : 'on'}.`, () =>
                          ops.setFlag(key, !on),
                        )
                      }
                    >
                      Turn {on ? 'off' : 'on'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Async>
      </Panel>

      <Panel
        title="Recompute counters"
        quiet
        note="The denormalised counts the app shows are maintained incrementally, so a failed write can leave one a little wrong. These rebuild them from the source rows and are safe to run any number of times."
      >
        <div className="flex flex-col">
          {RECOMPUTE_TARGETS.map((t) => (
            <div
              key={t}
              className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-neutral-300 py-3"
            >
              <span className="flex-1 min-w-[min(100%,240px)] flex flex-col gap-0.5">
                <span data-num className="text-[13px] font-extrabold text-ink">
                  {t}
                </span>
                <span className="text-[12.5px] text-neutral-700 [text-wrap:pretty]">
                  {RECOMPUTE_COPY[t]}
                </span>
              </span>
              <button
                type="button"
                disabled={act.busy}
                className={TINY}
                onClick={() =>
                  void act.run(`Recomputed ${t}.`, () =>
                    ops.recompute(t).then((r) => {
                      if (r.skipped) throw new Error(r.reason ?? 'skipped');
                      return r;
                    }),
                  )
                }
              >
                Run
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title={`Admin activity · ${logs.data?.length ?? 0}`}
        note="Every suspend, warn, edit, delete, feature and flag change, with the admin who did it. Written by the worker, not by this screen."
        right={
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportLog()}
            className={TINY}
          >
            {exporting ? 'Preparing…' : 'Download CSV'}
          </button>
        }
      >
        <Async loading={logs.loading} error={logs.error} retry={logs.retry}>
          <Table
            cols={[
              { key: 'when', label: 'When', w: '142px' },
              { key: 'who', label: 'Admin', w: '190px' },
              { key: 'what', label: 'Action', w: '128px' },
              { key: 'target', label: 'Target', w: '120px' },
              { key: 'details', label: 'Details' },
            ]}
            rows={logs.data ?? []}
            keyOf={(l) => l.id}
            cell={(l, k) =>
              k === 'when' ? (
                <span data-num>{l.created_at?.replace('T', ' ').slice(0, 16)}</span>
              ) : k === 'who' ? (
                <span className="break-all">{l.admin_email}</span>
              ) : k === 'what' ? (
                <Tag on={/delete|suspend|purge|revoke/.test(l.action_type)}>{l.action_type}</Tag>
              ) : k === 'target' ? (
                <span data-num className="text-neutral-700">
                  {l.target_type} #{l.target_id}
                </span>
              ) : (
                <span className="[text-wrap:pretty]">{l.details || '—'}</span>
              )
            }
            empty="Nothing has been done through the admin surface yet."
          />
        </Async>
      </Panel>

      <Panel
        title="Irreversible"
        note="Both need a super-admin token; a technical admin gets a refusal, which is the designed answer and not a bug. Neither can be undone from anywhere in this app."
      >
        <div className="flex flex-wrap gap-x-10 gap-y-6">
          <div className="flex-[1_1_300px] min-w-[min(100%,280px)] flex flex-col gap-3 border-t border-neutral-300 pt-3">
            <span className="text-[14.5px] font-extrabold tracking-[-0.02em] text-ink">
              Empty the note bin
            </span>
            <p className="text-[12.5px] text-neutral-700 [text-wrap:pretty]">
              Hard-deletes every soft-deleted note older than the cutoff. Content in the bin can
              still be restored under Content; after this it cannot.
            </p>
            <Field label="Older than (days)" className="grow-0">
              <input
                type="number"
                min={0}
                value={purgeDays}
                onChange={(e) => setPurgeDays(Number(e.target.value))}
                className={cn(INPUT, 'max-w-[130px]')}
              />
            </Field>
            <Confirm
              label="Purge the bin"
              confirmLabel={`Purge notes binned over ${purgeDays}d ago — confirm`}
              disabled={act.busy}
              className="self-start"
              onConfirm={() =>
                void act.run('Bin purged.', () =>
                  ops.purgeNotes(purgeDays).then((r) => {
                    act.clear();
                    return r;
                  }),
                )
              }
            />
          </div>
          <div className="flex-[1_1_300px] min-w-[min(100%,280px)] flex flex-col gap-3 border-t border-neutral-300 pt-3">
            <span className="text-[14.5px] font-extrabold tracking-[-0.02em] text-ink">
              Revoke every session
            </span>
            <p className="text-[12.5px] text-neutral-700 [text-wrap:pretty]">
              Empties the refresh-token table, so every client holding one has to sign in again.
              Reach for it after a leak, not after a bad day.
            </p>
            <Confirm
              label="Revoke all sessions"
              confirmLabel="Sign everyone out — confirm"
              disabled={act.busy}
              className="self-start"
              onConfirm={() =>
                void act.run('Every refresh token revoked.', () => ops.revokeTokens())
              }
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Not on this dashboard"
        quiet
        note="Deliberate gaps, so nobody goes looking for them."
      >
        <ul className="flex flex-col gap-1.5 text-[13px] text-neutral-800 list-none p-0 m-0">
          {[
            'Passwords. No reset, no temporary password, no credential view — the worker has those routes, and they stay a backend operator’s job.',
            'Two-factor secrets, recovery codes and OAuth tokens. Never read, never shown.',
            'A student’s private note content beyond what a moderator must read to moderate it.',
            'Anything that writes a student’s display name on a Google account — Google owns that field and re-reads it at every sign-in.',
          ].map((line) => (
            <li key={line} className="border-t border-neutral-300 pt-1.5 [text-wrap:pretty]">
              {line}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
