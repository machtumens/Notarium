/**
 * Nodes — what the platform itself is doing. "Node" here means every moving part the worker can
 * actually report on: the Worker, its D1 database, its KV namespace, the two configured providers
 * (DeepSeek, Google OAuth) and the Cloudflare edge numbers behind them.
 *
 * All of it is `requireTechnical`. `/api/health` is the exception worth knowing: a non-technical
 * token still gets a 200, just the shallow `{status,time}` — so a missing `db` field means "your
 * role does not cover this", not "the database is gone". The panel says which.
 */
import { useState } from 'react';
import { ops, type TimeseriesMetric } from '@/lib/admin-api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { Async, Bars, Panel, Stat, StatRow, Table, Tag } from './kit';

/** A dependency's light. `undefined` is "not reported", which is not the same as down. */
function Light({
  name,
  state,
  detail,
}: {
  name: string;
  state: boolean | undefined;
  detail?: string;
}) {
  const word = state === undefined ? 'Not reported' : state ? 'Up' : 'Down';
  return (
    <div className="flex flex-col gap-1.5 border-t border-neutral-300 pt-2.5 min-w-[136px] flex-1">
      <span className="meta">{name}</span>
      <span className="flex items-center gap-2">
        {/* Shape, not colour: a filled square is up, a hairline square is not. */}
        <span
          aria-hidden
          className={cn(
            'w-2.5 h-2.5 flex-none',
            state === undefined
              ? 'border border-neutral-400'
              : state
                ? 'bg-ink'
                : 'border-2 border-ink',
          )}
        />
        <span className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">{word}</span>
      </span>
      {detail && (
        <span data-num className="text-[11.5px] text-neutral-600">
          {detail}
        </span>
      )}
    </div>
  );
}

const METRICS: { key: TimeseriesMetric; label: string; note: string }[] = [
  {
    key: 'requests',
    label: 'Requests',
    note: 'Every request the worker logged to `request_metrics`.',
  },
  { key: 'errors', label: 'Errors', note: 'Requests that answered 400 or worse.' },
  {
    key: 'ai',
    label: 'AI calls',
    note: 'Rows in `ai_usage` — one per model call the worker made.',
  },
  { key: 'signups', label: 'Sign-ups', note: 'New accounts per day.' },
  { key: 'notes', label: 'Notes', note: 'Notes created per day.' },
];
const RANGES = [1, 7, 14, 30, 90];

export function Nodes() {
  const [metric, setMetric] = useState<TimeseriesMetric>('requests');
  const [range, setRange] = useState(14);

  const health = useAsync(() => ops.health(), []);
  // 503 is this endpoint's way of saying "a dependency is down", and `request` turns it into a
  // thrown ApiError — so read it back as a verdict rather than letting it land in `error`.
  const ready = useAsync(
    () => ops.ready().catch(() => ({ ok: false, checks: { db: false, kv: false } })),
    [],
  );
  const metrics = useAsync(() => ops.metrics(), []);
  const series = useAsync(() => ops.timeseries(metric, range), [metric, range]);
  const cf = useAsync(() => ops.cloudflare(Math.min(range, 30)), [range]);

  const h = health.data;
  const deep = h?.db !== undefined;
  const cfData = cf.data && 'workers' in cf.data ? cf.data : null;
  const cfUnconfigured = cf.data?.configured === false;
  const wTotals = (cfData?.workers ?? []).reduce(
    (a, w) => ({
      requests: a.requests + w.requests,
      errors: a.errors + w.errors,
      subrequests: a.subrequests + w.subrequests,
      cpuP99: Math.max(a.cpuP99, w.cpuP99),
    }),
    { requests: 0, errors: 0, subrequests: 0, cpuP99: 0 },
  );

  return (
    <div className="flex flex-col gap-9">
      <Panel
        title="Dependencies"
        note={
          deep
            ? 'Probed live on this request. Readiness is the same check an uptime monitor sees.'
            : 'Your admin role returns the shallow health answer only, so the per-dependency detail below is not reported to you. Reachability is still real.'
        }
        right={
          <button
            type="button"
            onClick={() => {
              health.retry();
              ready.retry();
              metrics.retry();
            }}
            className="text-[12.5px] font-bold underline underline-offset-[3px] decoration-neutral-400 hover:decoration-ink"
          >
            Re-probe
          </button>
        }
      >
        <Async loading={health.loading} error={health.error} retry={health.retry}>
          <div className="flex flex-wrap gap-x-7 gap-y-4">
            <Light
              name="Worker"
              state={h?.status === 'ok'}
              detail={h?.time?.replace('T', ' ').slice(0, 19)}
            />
            <Light name="D1 database" state={deep ? h?.db : ready.data?.checks.db} />
            <Light name="KV namespace" state={deep ? h?.kv : ready.data?.checks.kv} />
            <Light
              name="AI provider"
              state={h?.ai_configured}
              detail={deep ? 'DeepSeek key present' : undefined}
            />
            <Light
              name="Google OAuth"
              state={h?.oauth_configured}
              detail={deep ? 'Client id present' : undefined}
            />
            <Light
              name="Readiness"
              state={ready.data?.ok}
              detail={ready.data?.ok ? 'All probes answered' : 'A probe did not answer'}
            />
          </div>
        </Async>
        {deep && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 border-t border-neutral-300 pt-2.5">
            <span className="meta">Schema</span>
            <span data-num className="text-[13px] font-semibold text-ink">
              version {String(h?.schema_version ?? '—')}
            </span>
            <span data-num className="text-[13px] text-neutral-700">
              latest migration {String(h?.latest_migration ?? '—')}
            </span>
          </div>
        )}
      </Panel>

      <Panel
        title="Database size"
        note="Row counts straight off the tables, including soft-deleted notes — this is storage, not content."
      >
        <Async loading={metrics.loading} error={metrics.error} retry={metrics.retry}>
          {metrics.data && (
            <StatRow>
              <Stat label="users" value={metrics.data.table_rows.users} />
              <Stat
                label="notes"
                value={metrics.data.table_rows.notes}
                sub={`${metrics.data.moderation.soft_deleted_notes} soft-deleted`}
              />
              <Stat label="chat_messages" value={metrics.data.table_rows.chat_messages} />
              <Stat label="study_items" value={metrics.data.table_rows.study_items} />
              <Stat label="quiz attempts" value={metrics.data.totals.quiz_attempts} />
              <Stat label="featured notes" value={metrics.data.moderation.featured_notes} />
            </StatRow>
          )}
        </Async>
      </Panel>

      <Panel
        title="Traffic"
        note={METRICS.find((m) => m.key === metric)?.note}
        right={
          <>
            <div className="flex gap-4 flex-wrap">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="tabline"
                  data-on={metric === m.key}
                  onClick={() => setMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span aria-hidden className="h-4 w-px bg-neutral-300" />
            <div className="flex gap-3 flex-wrap">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="tabline"
                  data-on={range === r}
                  onClick={() => setRange(r)}
                >
                  {r}d
                </button>
              ))}
            </div>
          </>
        }
      >
        <Async loading={series.loading} error={series.error} retry={series.retry}>
          <Bars
            points={series.data ?? []}
            label={METRICS.find((m) => m.key === metric)?.label ?? 'Points'}
          />
          {range === 1 && metric === 'requests' && (
            <p className="text-[12px] text-neutral-600">
              Hourly buckets — the worker switches granularity at a one-day range.
            </p>
          )}
        </Async>
      </Panel>

      <Panel
        title="Cloudflare edge"
        note="Straight from the Analytics API for this worker script. Independent of the app's own counters, so a gap between the two is worth reading."
        quiet
      >
        <Async loading={cf.loading} error={cf.error} retry={cf.retry}>
          {cfUnconfigured && (
            <p className="text-[14px] text-neutral-700 [text-wrap:pretty]">
              The worker has no Cloudflare API token configured, so edge metrics are unavailable.
              Everything above comes from the database instead.
            </p>
          )}
          {cfData?.error && (
            <p className="text-[14px] text-neutral-800 [text-wrap:pretty]">
              Cloudflare answered with an error: {cfData.error}
            </p>
          )}
          {cfData && !cfData.error && (
            <div className="flex flex-col gap-6">
              <StatRow>
                <Stat
                  label={`Invocations · ${Math.min(range, 30)}d`}
                  value={wTotals.requests.toLocaleString()}
                />
                <Stat
                  label="Errors"
                  value={wTotals.errors.toLocaleString()}
                  sub={
                    wTotals.requests
                      ? `${((wTotals.errors / wTotals.requests) * 100).toFixed(2)}%`
                      : undefined
                  }
                />
                <Stat label="Subrequests" value={wTotals.subrequests.toLocaleString()} />
                <Stat
                  label="CPU p99"
                  value={Math.round(wTotals.cpuP99).toLocaleString()}
                  sub="microseconds, worst hour"
                />
              </StatRow>
              <Table
                cols={[
                  { key: 't', label: 'Day' },
                  { key: 'reads', label: 'D1 reads', num: true },
                  { key: 'writes', label: 'D1 writes', num: true },
                  { key: 'rowsRead', label: 'Rows read', num: true },
                  { key: 'rowsWritten', label: 'Rows written', num: true },
                ]}
                rows={(cfData.d1 ?? []).slice().reverse()}
                keyOf={(r) => r.t}
                cell={(r, k) =>
                  k === 't'
                    ? r.t
                    : k === 'reads'
                      ? r.readQueries.toLocaleString()
                      : k === 'writes'
                        ? r.writeQueries.toLocaleString()
                        : k === 'rowsRead'
                          ? r.rowsRead.toLocaleString()
                          : r.rowsWritten.toLocaleString()
                }
                empty="Cloudflare reported no D1 activity in this window."
              />
            </div>
          )}
        </Async>
      </Panel>

      <Panel
        title="Moderation load"
        note="What is waiting on a person rather than on the platform."
        quiet
      >
        <Async loading={metrics.loading} error={metrics.error} retry={metrics.retry}>
          {metrics.data && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
              <Tag on={metrics.data.totals.suspended_users > 0}>
                {metrics.data.totals.suspended_users} suspended
              </Tag>
              <Tag on={metrics.data.totals.active_warnings > 0}>
                {metrics.data.totals.active_warnings} open warnings
              </Tag>
              <Tag on={metrics.data.moderation.soft_deleted_notes > 0}>
                {metrics.data.moderation.soft_deleted_notes}{' '}
                {metrics.data.moderation.soft_deleted_notes === 1 ? 'note' : 'notes'} in the bin
              </Tag>
              <Tag>{metrics.data.totals.chat_sessions} chat sessions</Tag>
            </div>
          )}
        </Async>
      </Panel>
    </div>
  );
}
