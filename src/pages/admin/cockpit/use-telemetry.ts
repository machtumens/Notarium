/**
 * The cockpit's data feed. Every call is a route the live worker already serves (admin-api.ts).
 *
 * Cadence is a budget, not a taste: each tick is D1 and KV reads on the school's own quota, and a
 * cockpit left open on a second monitor would otherwise poll all night. So —
 *   fast  every 20 s   health, readiness, flags      (a SELECT 1 and a few KV gets)
 *   mid   every 60 s   ops metrics                   (table counts)
 *   slow  every 5 min  time series, edge, stats, log (the heavy aggregates)
 * — nothing is fetched while the tab is hidden, and after 30 minutes the feed stands down until
 * someone presses RESUME. [guess] the 30 min figure; it is one constant if it needs to move.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { admin, ops } from '@/lib/admin-api';
import { ApiError, getCache } from '@/lib/api';
import {
  diffStations,
  emptySnapshot,
  stationsOf,
  type Reading,
  type Snapshot,
  type Station,
} from './stations';

export const FAST_MS = 20_000;
const MID_EVERY = 3;
const SLOW_EVERY = 15;
export const STANDBY_MS = 30 * 60_000;
const RTT_KEEP = 60;
const EVENTS_KEEP = 40;
/** getCache keys are `"<token> <path>"`; these are the paths the cockpit polls. */
const PROBED = / \/api\/(health|ready|ops|admin)\b/;

export type LogLine = { at: number; text: string };
type Data<K extends keyof Snapshot> = Snapshot[K] extends Reading<infer T> ? T : never;

async function read<T>(fn: () => Promise<T>): Promise<Reading<T>> {
  try {
    return { data: await fn(), error: null, forbidden: false, at: Date.now() };
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    const error = e instanceof Error ? e.message : 'Probe failed';
    return { data: null, error, forbidden: status === 403, at: Date.now() };
  }
}

/** A failed refresh keeps the last good data and its timestamp, and only records the error. */
function keep<T>(prev: Reading<T>, next: Reading<T>): Reading<T> {
  return next.error && !next.forbidden ? { ...prev, error: next.error } : next;
}

/** `/api/ready` answers 503 for "a dependency is down" — a verdict, not a failed probe. */
const ready = () =>
  ops
    .ready()
    .then((r) => ({ ok: r.ok, checks: r.checks }))
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 503) return { ok: false, checks: null };
      throw e;
    });

export function useTelemetry() {
  const [snap, setSnap] = useState<Snapshot>(emptySnapshot);
  const [rtt, setRtt] = useState<(number | null)[]>([]);
  const [events, setEvents] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [standby, setStandby] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const latest = useRef<Snapshot>(snap);
  const board = useRef<Station[] | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    startedAt.current ??= Date.now();
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let n = 0;

    const run = async (tick: number) => {
      // `api.ts` shares every GET for 30 s, which would hand a 20 s poll the previous answer (and
      // make RE-PROBE a no-op). A probe has to be a real round trip, so drop the cockpit's own keys.
      for (const key of getCache.keys()) if (PROBED.test(key)) getCache.delete(key);
      const next: Partial<Snapshot> = {};
      const job = <K extends keyof Snapshot>(key: K, fn: () => Promise<Data<K>>) =>
        read(fn).then((r) => {
          next[key] = keep(latest.current[key] as Reading<Data<K>>, r) as Snapshot[K];
        });
      const jobs: Promise<void>[] = [];
      let elapsed: number | null = null;

      const t0 = performance.now();
      jobs.push(
        job('health', async () => {
          const h = await ops.health();
          elapsed = Math.round(performance.now() - t0);
          return h;
        }),
        job('ready', ready),
        job('flags', () => ops.flags()),
      );
      if (tick % MID_EVERY === 0) jobs.push(job('metrics', () => ops.metrics()));
      if (tick % SLOW_EVERY === 0)
        jobs.push(
          job('traffic24', () => ops.timeseries('requests', 1)),
          job('requests7', () => ops.timeseries('requests', 7)),
          job('errors7', () => ops.timeseries('errors', 7)),
          job('ai14', () => ops.timeseries('ai', 14)),
          job('signups14', () => ops.timeseries('signups', 14)),
          job('notes14', () => ops.timeseries('notes', 14)),
          job('cf', () => ops.cloudflare(7)),
          job('stats', () => admin.stats()),
          job('activity', () => admin.activity(24)),
          job('tutors', () => admin.tutors.pending()),
        );
      await Promise.all(jobs);
      if (!live) return;

      latest.current = { ...latest.current, ...next };
      const stations = stationsOf(latest.current);
      const lines =
        tick === 0 && !board.current
          ? ['TELEMETRY ACQUIRED']
          : diffStations(board.current, stations);
      board.current = stations;
      const at = Date.now();
      setSnap(latest.current);
      setRtt((r) => [...r, elapsed].slice(-RTT_KEEP));
      if (lines.length)
        setEvents((e) =>
          [...lines.map((text) => ({ at, text })).reverse(), ...e].slice(0, EVENTS_KEEP),
        );
    };

    const loop = async () => {
      if (!live) return;
      if (Date.now() - (startedAt.current ?? Date.now()) > STANDBY_MS) {
        setStandby(true);
        return;
      }
      if (!document.hidden) await run(n++);
      if (live) timer = setTimeout(() => void loop(), FAST_MS);
    };
    void loop();

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [paused, epoch]);

  /** Re-probe everything now (the effect restarts at tick 0, which runs every tier). */
  const refresh = useCallback(() => setEpoch((n) => n + 1), []);
  const resume = useCallback(() => {
    startedAt.current = Date.now();
    setStandby(false);
    setPaused(false);
    setEpoch((n) => n + 1);
  }, []);
  const togglePause = useCallback(() => setPaused((p) => !p), []);

  return { snap, rtt, events, paused, standby, refresh, resume, togglePause };
}
