/**
 * The cockpit's judgement layer: raw probe results in, a launch-director style GO / NO-GO board out.
 * Pure on purpose — no fetch, no React — so the rules that decide what lights red are one readable
 * file with a test beside it.
 *
 * Three states are kept apart because they mean different things to an operator:
 *   NO-GO   a probe answered and the answer is bad (or the worker did not answer at all)
 *   N/A     the probe could not be read — a 403 for this admin's sub-role, or nothing yet
 *   CAUTION degraded but serving: single AI channel, maintenance on, stale data
 * A 403 is never NO-GO; the System/Nodes pages make the same distinction.
 */
import type {
  ActivityLog,
  CloudflareMetrics,
  Flags,
  Health,
  OpsMetrics,
  Point,
  TutorApplication,
  UsageStats,
} from '@/lib/admin-api';

export type Verdict = 'go' | 'caution' | 'nogo' | 'na';
export const WORD: Record<Verdict, string> = {
  go: 'GO',
  caution: 'CAUTION',
  nogo: 'NO-GO',
  na: 'N/A',
};

/** One probe's last result. `data` survives a failed refresh so a blip shows as stale, not as a blank. */
export type Reading<T> = {
  data: T | null;
  error: string | null;
  forbidden: boolean;
  at: number | null;
};
export const emptyReading = <T>(): Reading<T> => ({
  data: null,
  error: null,
  forbidden: false,
  at: null,
});

/** `/api/ready` answers 503 with the failing check; the client cannot see which, so `checks` is null then. */
export type ReadyView = { ok: boolean; checks: { db: boolean; kv: boolean } | null };

export type Snapshot = {
  health: Reading<Health>;
  ready: Reading<ReadyView>;
  flags: Reading<Flags>;
  metrics: Reading<OpsMetrics>;
  traffic24: Reading<Point[]>;
  requests7: Reading<Point[]>;
  errors7: Reading<Point[]>;
  ai14: Reading<Point[]>;
  signups14: Reading<Point[]>;
  notes14: Reading<Point[]>;
  cf: Reading<CloudflareMetrics>;
  stats: Reading<UsageStats>;
  activity: Reading<ActivityLog[]>;
  tutors: Reading<TutorApplication[]>;
};

export const emptySnapshot = (): Snapshot => ({
  health: emptyReading(),
  ready: emptyReading(),
  flags: emptyReading(),
  metrics: emptyReading(),
  traffic24: emptyReading(),
  requests7: emptyReading(),
  errors7: emptyReading(),
  ai14: emptyReading(),
  signups14: emptyReading(),
  notes14: emptyReading(),
  cf: emptyReading(),
  stats: emptyReading(),
  activity: emptyReading(),
  tutors: emptyReading(),
});

export type Station = { id: string; label: string; verdict: Verdict; detail: string };

/** Error share of requests over the window, in percent; null when nothing was logged. */
export function errorRate(requests: Point[] | null, errors: Point[] | null): number | null {
  const sum = (p: Point[] | null) => (p ?? []).reduce((a, x) => a + x.v, 0);
  const r = sum(requests);
  return r > 0 ? (sum(errors) / r) * 100 : null;
}

const unread = (
  r: Reading<unknown>,
  what = 'NOT REPORTED',
): { verdict: Verdict; detail: string } => ({
  verdict: 'na',
  detail: r.forbidden ? 'ROLE NOT CLEARED' : what,
});

function boolStation(
  id: string,
  label: string,
  value: boolean | undefined,
  src: Reading<unknown>,
  up: string,
  down: string,
): Station {
  if (value === undefined) return { id, label, ...unread(src) };
  return { id, label, verdict: value ? 'go' : 'nogo', detail: value ? up : down };
}

function aiStation(r: Reading<Health>): Station {
  const base = { id: 'ai', label: 'AI CHANNELS' };
  const h = r.data;
  if (!h || h.ai_configured === undefined) return { ...base, ...unread(r) };
  if (h.ai_keys) {
    const n = h.ai_keys.gemini + (h.ai_keys.deepseek ? 1 : 0);
    if (n === 0) return { ...base, verdict: 'nogo', detail: 'NO KEYS SET' };
    if (n === 1) return { ...base, verdict: 'caution', detail: 'ONE CHANNEL · NO FAILOVER' };
    return { ...base, verdict: 'go', detail: `${n} CHANNELS · FAILOVER ARMED` };
  }
  // A worker build older than the channel count only reports whether DeepSeek's key exists.
  return h.ai_configured
    ? { ...base, verdict: 'go', detail: 'DEEPSEEK KEY PRESENT' }
    : { ...base, verdict: 'caution', detail: 'NO DEEPSEEK KEY · GEMINI NOT VISIBLE' };
}

/** The board. Order is the order the tiles are drawn in. */
export function stationsOf(s: Snapshot): Station[] {
  const h = s.health.data;
  const deep = h?.db !== undefined;
  const rc = s.ready.data?.checks;

  const worker: Station = (() => {
    const base = { id: 'worker', label: 'WORKER' };
    if (h?.status === 'ok')
      return s.health.error
        ? { ...base, verdict: 'caution' as const, detail: 'STALE · LAST ANSWER OK' }
        : { ...base, verdict: 'go' as const, detail: 'ANSWERING' };
    if (s.health.error) return { ...base, verdict: 'nogo' as const, detail: 'NO ANSWER' };
    return { ...base, ...unread(s.health, 'AWAITING FIRST PROBE') };
  })();

  const rate = errorRate(s.requests7.data, s.errors7.data);
  const errors: Station =
    rate === null
      ? { id: 'errors', label: 'ERROR RATE', ...unread(s.requests7, 'NO TRAFFIC LOGGED') }
      : {
          id: 'errors',
          label: 'ERROR RATE',
          verdict: rate < 2 ? 'go' : rate < 5 ? 'caution' : 'nogo',
          detail: `${rate.toFixed(2)}% OF 7D REQUESTS`,
        };

  const cf = s.cf.data;
  const edge: Station = (() => {
    const base = { id: 'edge', label: 'CF EDGE' };
    if (!cf) return { ...base, ...unread(s.cf) };
    if ('configured' in cf && cf.configured === false)
      return { ...base, verdict: 'na' as const, detail: 'NO API TOKEN ON WORKER' };
    if ('error' in cf && cf.error)
      return { ...base, verdict: 'caution' as const, detail: 'ANALYTICS API ERROR' };
    return { ...base, verdict: 'go' as const, detail: 'ANALYTICS ANSWERING' };
  })();

  const maint: Station = s.flags.data
    ? s.flags.data.maintenance
      ? { id: 'maint', label: 'MAINTENANCE', verdict: 'caution', detail: 'API READ-ONLY · HOLD' }
      : { id: 'maint', label: 'MAINTENANCE', verdict: 'go', detail: 'SERVING NORMALLY' }
    : { id: 'maint', label: 'MAINTENANCE', ...unread(s.flags) };

  return [
    worker,
    boolStation(
      'db',
      'D1 DATABASE',
      deep ? h?.db : rc?.db,
      deep ? s.health : s.ready,
      'QUERIES ANSWER',
      'NOT ANSWERING',
    ),
    boolStation(
      'kv',
      'KV STORE',
      deep ? h?.kv : rc?.kv,
      deep ? s.health : s.ready,
      'READS ANSWER',
      'NOT ANSWERING',
    ),
    boolStation(
      'ready',
      'READINESS',
      s.ready.data?.ok,
      s.ready,
      'ALL PROBES ANSWERED',
      'A PROBE FAILED',
    ),
    aiStation(s.health),
    boolStation(
      'oauth',
      'GOOGLE AUTH',
      h?.oauth_configured,
      s.health,
      'CLIENT ID PRESENT',
      'CLIENT ID MISSING',
    ),
    errors,
    edge,
    maint,
  ];
}

export type Overall = { verdict: Verdict; text: string };
export function overall(stations: Station[]): Overall {
  const bad = stations.filter((s) => s.verdict === 'nogo').length;
  const warn = stations.filter((s) => s.verdict === 'caution').length;
  if (bad) return { verdict: 'nogo', text: `${bad} STATION${bad > 1 ? 'S' : ''} NO-GO` };
  if (warn) return { verdict: 'caution', text: `HOLD · ${warn} ON CAUTION` };
  if (stations.every((s) => s.verdict === 'na'))
    return { verdict: 'na', text: 'AWAITING TELEMETRY' };
  return { verdict: 'go', text: 'ALL STATIONS GO' };
}

/** One line per station whose verdict changed — the cockpit's own event log. */
export function diffStations(prev: Station[] | null, next: Station[]): string[] {
  if (!prev) return [];
  const before = new Map(prev.map((s) => [s.id, s.verdict]));
  return next
    .filter((s) => before.has(s.id) && before.get(s.id) !== s.verdict)
    .map((s) => `${s.label}  ${WORD[before.get(s.id)!]} → ${WORD[s.verdict]}  ${s.detail}`);
}
