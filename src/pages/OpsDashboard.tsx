/**
 * Ops dashboard — the technical half of the admin console.
 *
 * Presentation is built from ConsoleKit (HUD, readouts, instrument panels,
 * guarded controls, typed-phrase confirms). Data wiring is unchanged: the same
 * api.ops.* calls, the same 20s poll, the same handlers.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { darkTheme } from '../theme';
import { useAuth } from '../app/AuthContext';
import MiniChart, { type ChartPoint } from '../components/ops/MiniChart';
import {
  Button,
  Callout,
  ConfirmDialog,
  Guard,
  Hud,
  Light,
  Lights,
  Panel,
  Pill,
  Readout,
  Readouts,
  Segmented,
  Switch,
  SwitchRow,
  type ConfirmSpec,
  type HudReadout,
} from '../components/ops/ConsoleKit';
import { ink } from '../components/ops/tokens';
import type { OpsHealth, OpsMetrics, OpsFlags, OpsCloudflare } from '../types';
import { formatTime } from '../lib/datetime';

const t = darkTheme;
const mono = "'IBM Plex Mono', ui-monospace, monospace";

const POLL_MS = 20000;

const CHART_METRICS: Array<{
  key: string;
  label: string;
  color: string;
  variant?: 'area' | 'bar';
}> = [
  { key: 'signups', label: 'Signups', color: t.colors.accent },
  { key: 'notes', label: 'Notes created', color: t.palette?.juniper ?? '#3e7d8c' },
  { key: 'requests', label: 'API requests', color: t.colors.accent, variant: 'bar' },
  { key: 'errors', label: 'Errors (4xx/5xx)', color: t.colors.danger, variant: 'bar' },
  { key: 'ai', label: 'AI calls', color: t.colors.success },
];

const RANGES = [
  { value: 1, label: '24h' },
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
];

const RECOMPUTE_TOOLS = [
  { key: 'subjects_note_count', name: 'Notes per subject', desc: 'Drifts when notes are removed.' },
  { key: 'user_notes_uploaded', name: 'Notes per student', desc: 'Drifts on bulk removals.' },
  { key: 'usage_snapshot', name: "Today's usage snapshot", desc: 'Normally runs automatically.' },
];

const num = (n: number | undefined) => (n ?? 0).toLocaleString();

export default function OpsDashboard() {
  const { user } = useAuth();
  const isSuper =
    user?.role === 'admin' && (user.admin_role == null || user.admin_role === 'super');

  const [health, setHealth] = useState<OpsHealth | null>(null);
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [flags, setFlags] = useState<OpsFlags | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState(7);
  const [series, setSeries] = useState<Record<string, ChartPoint[]>>({});
  const [chartsLoading, setChartsLoading] = useState(false);

  const [cloudflare, setCloudflare] = useState<OpsCloudflare | null>(null);
  const [cfLoading, setCfLoading] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [purgeDays, setPurgeDays] = useState(30);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const loadLive = useCallback(async () => {
    try {
      const [h, m] = await Promise.all([api.ops.health(), api.ops.metrics()]);
      setHealth(h);
      setMetrics(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFlags = useCallback(async () => {
    try {
      setFlags(await api.ops.flags());
    } catch {
      // leave flags null; panel shows nothing actionable
    }
  }, []);

  const loadCharts = useCallback(async (r: number) => {
    setChartsLoading(true);
    try {
      const entries = await Promise.all(
        CHART_METRICS.map(async (c) => {
          try {
            const res = await api.ops.timeseries(c.key, r);
            return [c.key, res.points] as const;
          } catch {
            return [c.key, [] as ChartPoint[]] as const;
          }
        }),
      );
      setSeries(Object.fromEntries(entries));
    } finally {
      setChartsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loaders set loading flags then fetch; behavior intentional
    loadLive();
    loadFlags();
    const id = setInterval(loadLive, POLL_MS);
    return () => clearInterval(id);
  }, [loadLive, loadFlags]);

  const loadCloudflare = useCallback(async (r: number) => {
    setCfLoading(true);
    try {
      setCloudflare(await api.ops.cloudflare(r));
    } catch (e) {
      setCloudflare({
        configured: true,
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to load Cloudflare metrics',
      });
    } finally {
      setCfLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loaders set loading flags then fetch; behavior intentional
    loadCharts(range);
    loadCloudflare(range);
  }, [range, loadCharts, loadCloudflare]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const handleMaintenance = (next: boolean) => {
    const run = async () => {
      setBusy('maintenance');
      try {
        await api.ops.setMaintenance(next);
        setFlags((f) => (f ? { ...f, maintenance: next } : f));
        flash(`Maintenance ${next ? 'enabled' : 'disabled'}.`);
      } catch (e) {
        flash(e instanceof Error ? e.message : 'Failed to update maintenance');
      } finally {
        setBusy(null);
      }
    };
    // Turning maintenance ON locks every student out, so it is the one switch
    // that asks. Turning it back off is always safe and runs immediately.
    if (!next) {
      run();
      return;
    }
    setConfirm({
      title: 'Put Notarium in maintenance',
      body: 'Students see a maintenance page and cannot sign in. Admin accounts keep full access. Anyone mid-upload loses that upload.',
      affected: `${num(metrics?.totals.users)} students locked out`,
      phrase: 'maintenance on',
      confirmLabel: 'Enable maintenance',
      onConfirm: run,
    });
  };

  const handleFlag = async (flag: 'signups' | 'uploads' | 'ai_chat', enabled: boolean) => {
    setBusy(flag);
    try {
      await api.ops.setFlag(flag, enabled);
      setFlags((f) => (f ? { ...f, [flag]: enabled } : f));
      flash(`${flag} ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to update flag');
    } finally {
      setBusy(null);
    }
  };

  const handleRecompute = async (target: string) => {
    setBusy(target);
    try {
      const res = await api.ops.recompute(target);
      flash(res.skipped ? `${target}: skipped (not applicable).` : `${target}: recomputed.`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Recompute failed');
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    setBusy('export');
    try {
      await api.ops.exportActivityLog();
      flash('Activity log exported.');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const askPurge = () => {
    const n = metrics?.moderation.soft_deleted_notes ?? 0;
    setConfirm({
      title: `Permanently delete removed notes`,
      body: `This deletes every note removed more than ${purgeDays} days ago, along with its images, likes and study cards. It cannot be undone and there is no backup to restore from.`,
      affected: `${num(n)} removed notes currently held · older than ${purgeDays}d will go`,
      phrase: 'delete notes',
      confirmLabel: 'Delete permanently',
      onConfirm: async () => {
        setBusy('purge');
        try {
          const res = await api.ops.purgeNotes(purgeDays);
          flash(`Purged ${res.deleted} note(s).`);
          loadLive();
        } catch (e) {
          flash(e instanceof Error ? e.message : 'Purge failed');
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const askRevoke = () => {
    setConfirm({
      title: 'Sign out every account',
      body: 'Revokes every refresh token. All students and admins are signed out on their next refresh and must log in again.',
      affected: `${num(metrics?.totals.users)} accounts`,
      phrase: 'sign out everyone',
      confirmLabel: 'Sign out everyone',
      onConfirm: async () => {
        setBusy('revoke');
        try {
          await api.ops.revokeTokens();
          flash('All refresh tokens revoked.');
        } catch (e) {
          flash(e instanceof Error ? e.message : 'Revoke failed');
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const hudItems = useMemo<HudReadout[]>(() => {
    const up = health ? health.status === 'ok' : undefined;
    return [
      {
        label: 'Site',
        value: up == null ? '—' : up ? 'UP' : 'DOWN',
        tone: up == null ? 'mute' : up ? 'ok' : 'crit',
      },
      { label: 'Live 5m', value: num(metrics?.live_users.m5), unit: 'now' },
      { label: 'Live 24h', value: num(metrics?.live_users.d1) },
      { label: 'Students', value: num(metrics?.totals.users) },
      { label: 'Notes', value: num(metrics?.totals.notes) },
      {
        label: 'Suspended',
        value: num(metrics?.totals.suspended_users),
        tone: (metrics?.totals.suspended_users ?? 0) > 0 ? 'warn' : undefined,
      },
      {
        label: 'Warnings',
        value: num(metrics?.totals.active_warnings),
        tone: (metrics?.totals.active_warnings ?? 0) > 0 ? 'warn' : undefined,
      },
      {
        label: 'Maintenance',
        value: flags?.maintenance ? 'ON' : 'off',
        tone: flags?.maintenance ? 'crit' : undefined,
      },
    ];
  }, [health, metrics, flags]);

  const rangeControl = (
    <Segmented options={RANGES} value={range} onChange={setRange} label="Time range" />
  );

  return (
    <div style={{ color: t.colors.textPrimary }}>
      <Hud
        title="Flight Deck"
        scope="Operations"
        items={hudItems}
        right={
          <span style={{ fontSize: '11px', color: 'rgba(223,234,226,.55)', fontFamily: mono }}>
            {health?.time ? `updated ${formatTime(health.time)}` : 'loading…'} · 20s
          </span>
        }
      />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '18px 22px 90px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '18px',
            flexWrap: 'wrap',
            marginBottom: '14px',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: '23px',
                fontWeight: 600,
                letterSpacing: '-.02em',
              }}
            >
              Health &amp; monitors
            </h1>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '12.5px',
                color: t.colors.textSecondary,
                maxWidth: '70ch',
              }}
            >
              Live service state on top, load and trends below. Refreshes every 20 seconds.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
            {rangeControl}
            <Button onClick={loadLive}>Re-check now</Button>
          </div>
        </div>

        {notice && (
          <div style={{ marginBottom: '12px' }}>
            <Callout>{notice}</Callout>
          </div>
        )}
        {error && (
          <div style={{ marginBottom: '12px' }}>
            <Callout tone="crit">{error}</Callout>
          </div>
        )}

        {/* 1. Service state */}
        <Panel
          legend="Service state"
          sub={health?.time ? `checked ${formatTime(health.time)}` : 'checking…'}
        >
          <Lights>
            <Light
              name="Overall"
              value={health ? (health.status === 'ok' ? 'all systems' : 'degraded') : undefined}
              state={health ? (health.status === 'ok' ? 'ok' : 'crit') : undefined}
            />
            <Light
              name="Database"
              value={health?.db == null ? 'unknown' : health.db ? 'D1 reachable' : 'unreachable'}
              state={health?.db == null ? undefined : health.db ? 'ok' : 'crit'}
            />
            <Light
              name="Key store"
              value={health?.kv == null ? 'unknown' : health.kv ? 'KV reachable' : 'unreachable'}
              state={health?.kv == null ? undefined : health.kv ? 'ok' : 'crit'}
            />
            <Light
              name="AI provider"
              value={health?.ai_configured ? 'configured' : 'not configured'}
              state={
                health?.ai_configured == null ? undefined : health.ai_configured ? 'ok' : 'warn'
              }
            />
            <Light
              name="Sign-in"
              value={health?.oauth_configured ? 'OAuth configured' : 'not configured'}
              state={
                health?.oauth_configured == null
                  ? undefined
                  : health.oauth_configured
                    ? 'ok'
                    : 'warn'
              }
            />
            <Light
              name="Migrations"
              value={health?.latest_migration ?? '—'}
              state={health?.latest_migration ? 'ok' : undefined}
            />
            <Light
              name="Cloudflare stats"
              value={cloudflare?.configured === false ? 'no API token' : 'connected'}
              state={cloudflare?.configured === false ? undefined : cloudflare?.ok ? 'ok' : 'warn'}
            />
          </Lights>
        </Panel>

        {/* 2. Live activity & totals */}
        <div style={{ marginTop: '14px' }}>
          {loading && !metrics ? (
            <Panel legend="Live activity">
              <span style={{ fontSize: '12.5px', color: ink.faint }}>Loading metrics…</span>
            </Panel>
          ) : (
            <Readouts>
              <Readout label="Live 5m" value={num(metrics?.live_users.m5)} delta="signed in now" />
              <Readout label="Live 1h" value={num(metrics?.live_users.h1)} />
              <Readout label="Live 24h" value={num(metrics?.live_users.d1)} />
              <Readout label="Students" value={num(metrics?.totals.users)} />
              <Readout label="Notes" value={num(metrics?.totals.notes)} />
              <Readout
                label="Suspended"
                value={num(metrics?.totals.suspended_users)}
                state={(metrics?.totals.suspended_users ?? 0) > 0 ? 'warn' : undefined}
              />
              <Readout
                label="Active warnings"
                value={num(metrics?.totals.active_warnings)}
                state={(metrics?.totals.active_warnings ?? 0) > 0 ? 'warn' : undefined}
              />
              <Readout
                label="Removed notes"
                value={num(metrics?.moderation.soft_deleted_notes)}
                delta="restorable"
              />
              <Readout label="Featured" value={num(metrics?.moderation.featured_notes)} />
              <Readout label="Chat sessions" value={num(metrics?.totals.chat_sessions)} />
              <Readout label="Quiz attempts" value={num(metrics?.totals.quiz_attempts)} />
              <Readout label="Chat messages" value={num(metrics?.table_rows.chat_messages)} />
              <Readout label="Study items" value={num(metrics?.table_rows.study_items)} />
            </Readouts>
          )}
        </div>

        {/* 3. Trends */}
        <div style={{ marginTop: '14px' }}>
          <Panel
            legend="Trends"
            sub={`last ${range === 1 ? '24h' : `${range} days`}`}
            actions={rangeControl}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '14px',
                opacity: chartsLoading ? 0.6 : 1,
                transition: t.transitions.fast,
              }}
            >
              {CHART_METRICS.map((c) => (
                <div key={c.key}>
                  <div
                    style={{
                      fontSize: '11px',
                      letterSpacing: '.09em',
                      textTransform: 'uppercase',
                      color: ink.fainter,
                      marginBottom: '6px',
                    }}
                  >
                    {c.label}
                  </div>
                  <MiniChart points={series[c.key] || []} color={c.color} variant={c.variant} />
                  {(series[c.key] || []).length === 0 && !chartsLoading && (
                    <div style={{ fontSize: '10.5px', color: ink.fainter, marginTop: '4px' }}>
                      No data recorded in this window.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* 3b. Cloudflare platform metrics */}
        <div style={{ marginTop: '14px' }}>
          <Panel
            legend="Cloudflare platform"
            sub={
              cloudflare?.configured === false
                ? 'not connected'
                : cfLoading
                  ? 'loading…'
                  : `last ${range === 1 ? '24h' : `${range} days`}`
            }
          >
            {cloudflare?.configured === false ? (
              <Callout>
                Worker invocations, CPU time and D1 row counts appear here once{' '}
                <span style={{ fontFamily: mono }}>CF_API_TOKEN</span> and{' '}
                <span style={{ fontFamily: mono }}>CF_ACCOUNT_ID</span> are set. Everything else on
                this page works without them.
              </Callout>
            ) : cloudflare?.ok === false ? (
              <Callout tone="crit">
                Cloudflare metrics failed: {cloudflare.error || 'unknown error'}
              </Callout>
            ) : cloudflare?.ok ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Readouts>
                  <Readout
                    label="Worker requests"
                    value={num(cloudflare.workers?.totals.requests)}
                  />
                  <Readout
                    label="Worker errors"
                    value={num(cloudflare.workers?.totals.errors)}
                    state={(cloudflare.workers?.totals.errors ?? 0) > 0 ? 'warn' : undefined}
                  />
                  <Readout
                    label="Subrequests"
                    value={num(cloudflare.workers?.totals.subrequests)}
                  />
                  <Readout label="D1 rows read" value={num(cloudflare.d1?.totals.rowsRead)} />
                  <Readout label="D1 rows written" value={num(cloudflare.d1?.totals.rowsWritten)} />
                </Readouts>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '14px',
                  }}
                >
                  {[
                    {
                      label: 'Worker requests',
                      points: (cloudflare.workers?.points || []).map((p) => ({
                        t: p.t,
                        v: p.requests,
                      })),
                      color: t.colors.accent,
                      variant: undefined as 'bar' | undefined,
                    },
                    {
                      label: 'Worker errors',
                      points: (cloudflare.workers?.points || []).map((p) => ({
                        t: p.t,
                        v: p.errors,
                      })),
                      color: t.colors.danger,
                      variant: undefined,
                    },
                    {
                      label: 'D1 rows read',
                      points: (cloudflare.d1?.points || []).map((p) => ({ t: p.t, v: p.rowsRead })),
                      color: t.colors.success,
                      variant: 'bar' as const,
                    },
                    {
                      label: 'D1 rows written',
                      points: (cloudflare.d1?.points || []).map((p) => ({
                        t: p.t,
                        v: p.rowsWritten,
                      })),
                      color: t.palette?.juniper ?? '#3e7d8c',
                      variant: 'bar' as const,
                    },
                  ].map((c) => (
                    <div key={c.label}>
                      <div
                        style={{
                          fontSize: '11px',
                          letterSpacing: '.09em',
                          textTransform: 'uppercase',
                          color: ink.fainter,
                          marginBottom: '6px',
                        }}
                      >
                        {c.label}
                      </div>
                      <MiniChart points={c.points} color={c.color} variant={c.variant} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <span style={{ fontSize: '12.5px', color: ink.faint }}>
                Loading Cloudflare metrics…
              </span>
            )}
          </Panel>
        </div>

        {/* 4. Maintenance & switches */}
        <div style={{ marginTop: '14px' }}>
          <Panel
            legend="Switches & maintenance"
            sub="KV flags, checked per request"
            actions={
              flags ? (
                <Pill tone={flags.maintenance ? 'crit' : 'ok'}>
                  {flags.maintenance ? 'In maintenance' : 'Site is up'}
                </Pill>
              ) : undefined
            }
          >
            {flags ? (
              <>
                <SwitchRow
                  name="Put Notarium in maintenance"
                  desc="Students see a maintenance page. Admin accounts keep full access."
                >
                  {flags.maintenance ? (
                    <Switch
                      on
                      danger
                      label="Maintenance mode"
                      disabled={busy === 'maintenance'}
                      onChange={handleMaintenance}
                    />
                  ) : (
                    <Guard key={String(flags.maintenance)}>
                      <Switch
                        on={false}
                        danger
                        label="Maintenance mode"
                        disabled={busy === 'maintenance'}
                        onChange={handleMaintenance}
                      />
                    </Guard>
                  )}
                </SwitchRow>
                <SwitchRow
                  name="New sign-ups"
                  desc="Off blocks account creation. Existing students are unaffected."
                >
                  <Switch
                    on={flags.signups}
                    label="New sign-ups"
                    disabled={busy === 'signups'}
                    onChange={(v) => handleFlag('signups', v)}
                  />
                </SwitchRow>
                <SwitchRow name="Note uploads" desc="Off during exam week if you need a hard stop.">
                  <Switch
                    on={flags.uploads}
                    label="Note uploads"
                    disabled={busy === 'uploads'}
                    onChange={(v) => handleFlag('uploads', v)}
                  />
                </SwitchRow>
                <SwitchRow
                  name="AI chat & summaries"
                  desc="Off when the provider is failing or spend runs hot."
                >
                  <Switch
                    on={flags.ai_chat}
                    label="AI chat"
                    disabled={busy === 'ai_chat'}
                    onChange={(v) => handleFlag('ai_chat', v)}
                  />
                </SwitchRow>
              </>
            ) : (
              <span style={{ fontSize: '12.5px', color: ink.faint }}>Loading switches…</span>
            )}
          </Panel>
        </div>

        {/* 5. Data tools */}
        <div style={{ marginTop: '14px' }}>
          <Panel
            legend="Fix drifted counts"
            sub="safe to run any time"
            actions={
              <Button onClick={handleExport} disabled={busy === 'export'}>
                Download activity log CSV
              </Button>
            }
          >
            {RECOMPUTE_TOOLS.map((tool) => (
              <SwitchRow key={tool.key} name={tool.name} desc={tool.desc}>
                <Button onClick={() => handleRecompute(tool.key)} disabled={busy === tool.key}>
                  {busy === tool.key ? 'Running…' : 'Recalculate'}
                </Button>
              </SwitchRow>
            ))}
          </Panel>
        </div>

        {/* 6. Danger zone — shown to every technical account, armable only by super
             admin. Hiding it would teach operators the console is incomplete;
             showing it locked teaches the permission model. The server gates it
             regardless of what this renders. */}
        <div style={{ marginTop: '14px' }}>
          <Panel legend="Danger zone" tone="crit" actions={<Pill tone="crit">Admin only</Pill>}>
            <div style={{ marginBottom: '12px' }}>
              <Callout tone={isSuper ? 'warn' : 'crit'}>
                {isSuper ? (
                  <>
                    <strong>You are signed in as Admin.</strong> Each control below still needs its
                    cover lifted and the confirmation phrase typed.
                  </>
                ) : (
                  <>
                    <strong>These are locked for your account.</strong> They are listed so you know
                    they exist — only the super admin can run them.
                  </>
                )}
              </Callout>
            </div>

            <SwitchRow
              name="Permanently delete removed notes"
              desc={
                <>
                  Wipes removed notes and their images, likes and study cards.{' '}
                  <span style={{ fontFamily: mono }}>
                    {num(metrics?.moderation.soft_deleted_notes)} held
                  </span>
                </>
              }
            >
              <label
                htmlFor="ops-purge-days"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: ink.fainter,
                }}
              >
                older than
                <input
                  id="ops-purge-days"
                  type="number"
                  min={0}
                  value={purgeDays}
                  disabled={!isSuper}
                  aria-label="Delete removed notes older than this many days"
                  onChange={(e) => setPurgeDays(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  className="ops-focus"
                  style={{
                    width: '64px',
                    font: 'inherit',
                    fontFamily: mono,
                    fontSize: '12px',
                    padding: '5px 8px',
                    background: '#fff',
                    color: t.colors.textPrimary,
                    border: '1px solid rgba(28,42,34,.2)',
                    borderRadius: t.borderRadius.sm,
                  }}
                />
                days
              </label>
              <Guard key={String(purgeDays)}>
                <Button variant="danger" disabled={!isSuper || busy === 'purge'} onClick={askPurge}>
                  Delete permanently
                </Button>
              </Guard>
            </SwitchRow>

            <SwitchRow
              name="Sign everyone out"
              desc="Revokes every refresh token. All accounts log in again."
            >
              <Guard>
                <Button
                  variant="danger"
                  disabled={!isSuper || busy === 'revoke'}
                  onClick={askRevoke}
                >
                  Sign out everyone
                </Button>
              </Guard>
            </SwitchRow>
          </Panel>
        </div>
      </div>

      <ConfirmDialog spec={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
