/**
 * Cockpit — the admin console as a flight-control room. One screen, every number the worker will
 * tell an admin, refreshed on a budgeted clock (see use-telemetry.ts).
 *
 * It adds no backend surface. Everything is a call `admin-api.ts` already makes; the cockpit's own
 * contribution is the judgement layer (stations.ts) and the instruments (parts.tsx). The control
 * panel is limited to what the System page already treats as reversible — feature flags,
 * maintenance, counter rebuilds. The two irreversible actions stay on System, deliberately unarmed here.
 */
import { Link } from 'react-router-dom';
import { ops, RECOMPUTE_TARGETS } from '@/lib/admin-api';
import { useAction } from '../kit';
import {
  Dial,
  fmt,
  HBar,
  Lamp,
  Panel,
  Readout,
  Scope,
  Switch,
  toneOf,
  useNow,
  type Tone,
} from './parts';
import { errorRate, overall, stationsOf, type Reading, type Snapshot } from './stations';
import { STANDBY_MS, useTelemetry } from './use-telemetry';
import './cockpit.css';

/** STATE.md: "Live. 12 Sep 2026". The hour is not recorded, so MET counts from local midnight. */
const GO_LIVE = Date.parse('2026-09-12T00:00:00+07:00');
const pad = (n: number) => String(n).padStart(2, '0');
const hhmmss = (d: Date) => d.toISOString().slice(11, 19);

function Clocks() {
  const now = useNow();
  const met = Math.max(now - GO_LIVE, 0);
  const s = Math.floor(met / 1000);
  const wib = new Date(now).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
  });
  return (
    <div className="ck-clocks">
      <Readout
        label="MISSION ELAPSED"
        tone="amber"
        value={`T+${Math.floor(s / 86400)}d ${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`}
      />
      <Readout label="UTC" value={hhmmss(new Date(now))} />
      <Readout label="WIB · UTC+7" value={wib} />
    </div>
  );
}

const last = <T,>(a: T[]) => (a.length ? a[a.length - 1] : null);
const series = (r: Reading<{ v: number }[]>) => (r.data ?? []).map((p) => p.v);
const stamp = (t: string) => t?.replace('T', ' ').slice(5, 16) ?? '';

function linkState(snap: Snapshot, paused: boolean, standby: boolean, now: number) {
  if (standby) return { word: 'STANDBY', tone: 'amber' as Tone };
  if (paused) return { word: 'HELD', tone: 'amber' as Tone };
  const h = snap.health;
  if (h.error && !h.data) return { word: 'LINK LOST', tone: 'red' as Tone };
  if (!h.at) return { word: 'ACQUIRING', tone: 'dim' as Tone };
  if (h.error || now - h.at > 75_000) return { word: 'STALE', tone: 'amber' as Tone };
  return { word: 'NOMINAL', tone: 'green' as Tone };
}

function TopBar({
  nav,
  snap,
  tele,
}: {
  nav: { to: string; label: string }[];
  snap: Snapshot;
  tele: ReturnType<typeof useTelemetry>;
}) {
  const now = useNow();
  const link = linkState(snap, tele.paused, tele.standby, now);
  const age = snap.health.at ? Math.max(Math.round((now - snap.health.at) / 1000), 0) : null;
  return (
    <header className="ck-top">
      <div className="ck-brand">
        <span className="ck-brand-mark" aria-hidden />
        <div>
          <p className="ck-brand-name">NOTARIUM · MISSION CONTROL</p>
          <p className="ck-sub">ADMIN COCKPIT · LIVE TELEMETRY</p>
        </div>
      </div>
      <Clocks />
      <div className="ck-top-right">
        <div className="ck-link" data-tone={link.tone} role="status">
          <span className="ck-led" aria-hidden />
          <span>
            <span className="ck-cap">DOWNLINK</span>
            <span className="ck-link-word">{link.word}</span>
          </span>
          <span className="ck-sub">{age === null ? '—' : `${age}s AGO`}</span>
        </div>
        <button type="button" className="ck-btn" onClick={tele.refresh} disabled={tele.paused}>
          RE-PROBE
        </button>
        <button type="button" className="ck-btn" onClick={tele.togglePause} data-on={tele.paused}>
          {tele.paused ? 'RELEASE HOLD' : 'HOLD FEED'}
        </button>
      </div>
      <nav className="ck-nav" aria-label="Admin sections">
        <span className="ck-cap">BACK ROOMS</span>
        {nav.map((n) => (
          <Link key={n.to} to={`/admin/${n.to}`}>
            {n.label}
          </Link>
        ))}
        <Link to="/admin" className="ck-exit">
          ◂ EXIT TO ADMIN
        </Link>
      </nav>
    </header>
  );
}

function Controls({ snap, refresh }: { snap: Snapshot; refresh: () => void }) {
  const act = useAction(refresh);
  const f = snap.flags.data;
  if (!f)
    return (
      <p className="ck-note">
        {snap.flags.forbidden
          ? 'ROLE NOT CLEARED FOR OPS CONTROLS.'
          : (snap.flags.error ?? 'AWAITING FLAG TELEMETRY…')}
      </p>
    );
  const flag = (key: 'signups' | 'uploads' | 'ai_chat', label: string, on: string, off: string) => (
    <Switch
      key={key}
      label={label}
      detail={f[key] ? on : off}
      on={f[key]}
      disabled={act.busy}
      onToggle={() =>
        void act.run(`${label} ${f[key] ? 'OFF' : 'ON'}.`, () => ops.setFlag(key, !f[key]))
      }
    />
  );
  return (
    <>
      {flag('signups', 'SIGN-UPS', 'New accounts allowed', 'Sign-up closed')}
      {flag('uploads', 'NOTE UPLOADS', 'Students may publish', 'Publishing blocked')}
      {flag('ai_chat', 'AI ROUTES', 'Providers answering', 'No provider calls billed')}
      <Switch
        guarded
        label="MAINTENANCE"
        detail={f.maintenance ? 'API READ-ONLY — answering 503' : 'Serving normally'}
        on={f.maintenance}
        disabled={act.busy}
        onToggle={() =>
          void act.run(
            `Maintenance ${f.maintenance ? 'OFF — API serving.' : 'ON — API answering 503.'}`,
            () => ops.setMaintenance(!f.maintenance),
          )
        }
      />
      <div className="ck-seq">
        <span className="ck-cap">SEQUENCES · SAFE TO RE-RUN</span>
        {RECOMPUTE_TARGETS.map((t) => (
          <button
            key={t}
            type="button"
            className="ck-btn"
            disabled={act.busy}
            onClick={() =>
              void act.run(`${t} recomputed.`, () =>
                ops.recompute(t).then((r) => {
                  if (r.skipped) throw new Error(r.reason ?? 'skipped');
                  return r;
                }),
              )
            }
          >
            {t.replace(/_/g, ' ').toUpperCase()}
          </button>
        ))}
      </div>
      {act.said && (
        <p className="ck-ack" data-ok={act.said.ok} role="status">
          {act.said.ok ? `ACK · ${act.said.text}` : `REFUSED · ${act.said.text}`}
        </p>
      )}
      <p className="ck-note">
        IRREVERSIBLE CONTROLS (PURGE BIN, REVOKE SESSIONS) ARE NOT ARMED HERE —{' '}
        <Link to="/admin/system">SYSTEM PANEL</Link>.
      </p>
    </>
  );
}

export function Cockpit({ nav }: { nav: { to: string; label: string }[] }) {
  const tele = useTelemetry();
  const { snap, rtt } = tele;
  const stations = stationsOf(snap);
  const verdict = overall(stations);

  const m = snap.metrics.data;
  const st = snap.stats.data;
  const cf = snap.cf.data && 'workers' in snap.cf.data ? snap.cf.data : null;
  const rate = errorRate(snap.requests7.data, snap.errors7.data);
  const rttNow = last(rtt.filter((v): v is number => v !== null));
  const cpu = cf?.workers?.length ? Math.max(...cf.workers.map((w) => w.cpuP99)) / 1000 : null;
  const active = m ? (m.live_users.d1 / Math.max(m.totals.users, 1)) * 100 : null;
  const d1Today = last(cf?.d1 ?? []);
  const week = (k: 'readQueries' | 'writeQueries' | 'rowsRead' | 'rowsWritten') =>
    cf?.d1 ? cf.d1.reduce((a, d) => a + d[k], 0) : null;
  const tableMax = m ? Math.max(...Object.values(m.table_rows), m.totals.quiz_attempts, 1) : 1;
  const classMax = Math.max(...(st?.usersByClass ?? []).map((c) => c.count), 1);
  const subjMax = Math.max(...(st?.popularSubjects ?? []).map((s) => s.note_count), 1);
  const h = snap.health.data;

  return (
    <div className="ck" data-verdict={verdict.verdict}>
      <TopBar nav={nav} snap={snap} tele={tele} />

      {tele.standby && (
        <div className="ck-standby" role="status">
          <span>
            TELEMETRY STANDBY — the feed stood down after {STANDBY_MS / 60_000} minutes to spare the
            school’s D1 and KV quota.
          </span>
          <button type="button" className="ck-btn" onClick={tele.resume}>
            RESUME FEED
          </button>
        </div>
      )}

      <div className="ck-body">
        <section
          className="ck-poll"
          aria-labelledby="ck-poll-h"
          data-tone={toneOf(verdict.verdict)}
        >
          <div className="ck-poll-head">
            <h2 id="ck-poll-h" className="ck-title">
              GO / NO-GO POLL
            </h2>
            <p className="ck-verdict" aria-live="polite">
              {verdict.text}
            </p>
          </div>
          <div className="ck-lamps">
            {stations.map((s) => (
              <Lamp key={s.id} verdict={s.verdict} label={s.label} detail={s.detail} />
            ))}
          </div>
        </section>

        <div className="ck-grid">
          <Panel code="VTL-1" title="Vitals" className="s-4">
            <div className="ck-dials">
              <Dial
                label="ERROR RATE · 7D"
                value={rate}
                max={10}
                unit="%"
                caution={2}
                warn={5}
                digits={2}
              />
              <Dial
                label="DOWNLINK RTT"
                value={rttNow}
                max={2000}
                unit="ms"
                caution={600}
                warn={1200}
              />
              <Dial
                label="EDGE CPU P99"
                value={cpu}
                max={50}
                unit="ms"
                caution={10}
                warn={30}
                digits={1}
              />
              <Dial label="ACTIVE · 24H" value={active} max={100} unit="% of accts" digits={0} />
            </div>
            <p className="ck-note">
              Bands are judgement calls, not vendor limits. RTT is this browser’s round trip to
              /api/health.
            </p>
          </Panel>

          <Panel code="TLM-2" title="Traffic telemetry" className="s-8">
            <Scope label="REQUESTS · LAST 24H · HOURLY" values={series(snap.traffic24)} tall />
            <div className="ck-scopes">
              <Scope label="REQUESTS · 7D" values={series(snap.requests7)} />
              <Scope label="ERRORS · 7D" values={series(snap.errors7)} tone="red" />
              <Scope label="AI CALLS · 14D" values={series(snap.ai14)} />
              <Scope label="SIGN-UPS · 14D" values={series(snap.signups14)} tone="green" />
              <Scope label="NOTES · 14D" values={series(snap.notes14)} />
              <Scope label="DOWNLINK RTT · LIVE" values={rtt} unit="ms" tone="green" />
            </div>
          </Panel>

          <Panel code="CMD-3" title="Control panel" className="s-4">
            <Controls snap={snap} refresh={tele.refresh} />
          </Panel>

          <Panel code="STO-4" title="Data stores" className="s-4">
            {m ? (
              <>
                <HBar label="users" value={m.table_rows.users} max={tableMax} />
                <HBar label="notes" value={m.table_rows.notes} max={tableMax} />
                <HBar label="chat_messages" value={m.table_rows.chat_messages} max={tableMax} />
                <HBar label="study_items" value={m.table_rows.study_items} max={tableMax} />
                <HBar label="quiz attempts" value={m.totals.quiz_attempts} max={tableMax} />
              </>
            ) : (
              <p className="ck-note">
                {snap.metrics.forbidden ? 'ROLE NOT CLEARED.' : 'AWAITING TABLE COUNTS…'}
              </p>
            )}
            <div className="ck-readouts">
              <Readout label="D1 READS · 7D" value={fmt(week('readQueries'))} />
              <Readout label="D1 WRITES · 7D" value={fmt(week('writeQueries'))} />
              <Readout label="ROWS READ · TODAY" value={fmt(d1Today?.rowsRead)} />
              <Readout label="ROWS WRITTEN · TODAY" value={fmt(d1Today?.rowsWritten)} />
            </div>
            <p className="ck-note">
              SCHEMA {String(h?.schema_version ?? '—')} · LATEST MIGRATION{' '}
              {String(h?.latest_migration ?? '—')}
            </p>
          </Panel>

          <Panel code="AI-5" title="AI channels" className="s-4">
            <div className="ck-chain" aria-label="AI failover chain">
              {['GEMINI 1', 'GEMINI 2', 'GEMINI 3', 'DEEPSEEK'].map((name, i) => {
                const keys = h?.ai_keys;
                const lit = keys ? (i < 3 ? keys.gemini > i : keys.deepseek) : undefined;
                return (
                  <span
                    key={name}
                    className="ck-chain-link"
                    data-tone={lit === undefined ? 'dim' : lit ? 'green' : 'red'}
                  >
                    <span className="ck-led" aria-hidden />
                    <span>{name}</span>
                    <span className="ck-sub">
                      {lit === undefined ? 'UNREPORTED' : lit ? 'KEY SET' : 'NO KEY'}
                    </span>
                  </span>
                );
              })}
            </div>
            <p className="ck-note">
              Tried in order; any non-2xx falls through to the next.
              {!h?.ai_keys && h ? ' This worker build does not report per-channel keys yet.' : ''}
            </p>
            <div className="ck-readouts">
              <Readout label="AI CALLS · TODAY" value={fmt(last(snap.ai14.data ?? [])?.v)} />
              <Readout label="CHAT SESSIONS" value={fmt(m?.totals.chat_sessions)} />
            </div>
            <span className="ck-cap">TOP SUBJECTS BY NOTES</span>
            {(st?.popularSubjects ?? []).slice(0, 6).map((s) => (
              <HBar key={s.id} label={s.name} value={s.note_count} max={subjMax} />
            ))}
          </Panel>

          <Panel code="CRW-6" title="Crew & moderation" className="s-4">
            <div className="ck-readouts">
              <Readout label="ACCOUNTS" value={fmt(m?.totals.users)} />
              <Readout label="LIVE · 5 MIN" value={fmt(m?.live_users.m5)} tone="green" />
              <Readout label="LIVE · 1 HR" value={fmt(m?.live_users.h1)} tone="green" />
              <Readout label="LIVE · 24 HR" value={fmt(m?.live_users.d1)} tone="green" />
              <Readout label="ACTIVE · 7D" value={fmt(st?.overview.activeUsers7d)} />
              <Readout label="NOTES · 7D" value={fmt(st?.overview.notes7d)} />
              <Readout
                label="SUSPENDED"
                value={fmt(m?.totals.suspended_users)}
                tone={m?.totals.suspended_users ? 'amber' : 'cyan'}
              />
              <Readout
                label="OPEN WARNINGS"
                value={fmt(m?.totals.active_warnings)}
                tone={m?.totals.active_warnings ? 'amber' : 'cyan'}
              />
              <Readout label="IN THE BIN" value={fmt(m?.moderation.soft_deleted_notes)} />
              <Readout
                label="TUTOR APPLICATIONS"
                value={snap.tutors.forbidden ? 'N/A' : fmt(snap.tutors.data?.length)}
                tone={snap.tutors.data?.length ? 'amber' : 'cyan'}
              />
            </div>
            <span className="ck-cap">ACCOUNTS BY CLASS</span>
            {(st?.usersByClass ?? []).slice(0, 8).map((c) => (
              <HBar key={c.class} label={c.class || '—'} value={c.count} max={classMax} />
            ))}
          </Panel>

          <Panel code="COM-7" title="Comms log · admin activity" className="s-8">
            <ol className="ck-log" aria-label="Recent admin activity">
              {(snap.activity.data ?? []).map((l) => (
                <li key={l.id}>
                  <time>{stamp(l.created_at)}</time>
                  <b data-hot={/delete|suspend|purge|revoke/.test(l.action_type)}>
                    {l.action_type}
                  </b>
                  <span>
                    {l.target_type} #{l.target_id}
                  </span>
                  <span className="ck-log-who">{l.admin_email}</span>
                  <span className="ck-log-detail">{l.details || ''}</span>
                </li>
              ))}
              {snap.activity.data?.length === 0 && (
                <li className="ck-note">NO ADMIN TRAFFIC ON RECORD.</li>
              )}
              {!snap.activity.data && (
                <li className="ck-note">
                  {snap.activity.forbidden ? 'ROLE NOT CLEARED.' : 'AWAITING LOG…'}
                </li>
              )}
            </ol>
          </Panel>

          <Panel code="EVT-8" title="Event log · this session" className="s-12">
            <ol className="ck-log" aria-label="Station changes this session">
              {tele.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="ck-log-evt">
                  <time>{hhmmss(new Date(e.at))}</time>
                  <span>{e.text}</span>
                </li>
              ))}
              {tele.events.length === 0 && (
                <li className="ck-note">NO STATION HAS CHANGED STATE.</li>
              )}
            </ol>
          </Panel>
        </div>

        <p className="ck-foot">
          FEED · FAST 20S (HEALTH, READINESS, FLAGS) · MID 60S (COUNTS) · SLOW 5M (SERIES, EDGE,
          LOG) · PAUSES WHILE THE TAB IS HIDDEN
        </p>
      </div>
    </div>
  );
}
