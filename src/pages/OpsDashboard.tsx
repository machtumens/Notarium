import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { darkTheme, cardStyle } from '../theme';
import { useAuth } from '../app/AuthContext';
import MiniChart, { type ChartPoint } from '../components/ops/MiniChart';
import type { OpsHealth, OpsMetrics, OpsFlags, OpsCloudflare } from '../types';

const t = darkTheme;

const POLL_MS = 20000;
const CHART_METRICS: Array<{
  key: string;
  label: string;
  color: string;
  variant?: 'area' | 'bar';
}> = [
  { key: 'signups', label: 'Signups', color: t.colors.accent },
  { key: 'notes', label: 'Notes created', color: '#8b5cf6' },
  { key: 'requests', label: 'API requests', color: '#22d3ee', variant: 'bar' },
  { key: 'errors', label: 'Errors (4xx/5xx)', color: t.colors.danger, variant: 'bar' },
  { key: 'ai', label: 'AI calls', color: t.colors.success },
];

function StatusDot({ ok, label }: { ok: boolean | undefined; label: string }) {
  const color = ok == null ? t.colors.textSecondary : ok ? t.colors.success : t.colors.danger;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${color}`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: '13px', color: t.colors.textPrimary }}>{label}</span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        ...cardStyle,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          color: t.colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: '26px', fontWeight: 700, color: t.colors.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
  disabled,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: `1px solid ${t.colors.borderColor}`,
      }}
    >
      <span style={{ fontSize: '14px', color: t.colors.textPrimary }}>{label}</span>
      <button
        onClick={() => onChange(!on)}
        disabled={disabled}
        style={{
          width: '48px',
          height: '26px',
          borderRadius: '13px',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: on ? t.colors.success : t.colors.bgTertiary,
          position: 'relative',
          transition: t.transitions.fast,
          opacity: disabled ? 0.6 : 1,
        }}
        aria-pressed={on}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: on ? '25px' : '3px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#fff',
            transition: t.transitions.fast,
          }}
        />
      </button>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: t.colors.textPrimary,
  margin: '0 0 12px',
};

const toolButton: React.CSSProperties = {
  padding: '10px 16px',
  background: t.colors.bgTertiary,
  color: t.colors.textPrimary,
  border: `1px solid ${t.colors.borderColor}`,
  borderRadius: t.borderRadius.md,
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
  transition: t.transitions.fast,
};

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

  const handleMaintenance = async (next: boolean) => {
    if (next && !window.confirm('Enable maintenance mode? Non-admin users will be locked out.'))
      return;
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

  const handlePurge = async () => {
    if (!window.confirm(`Permanently delete soft-deleted notes older than ${purgeDays} days?`))
      return;
    if (!window.confirm('This cannot be undone. Are you absolutely sure?')) return;
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
  };

  const handleRevoke = async () => {
    if (
      !window.confirm('Revoke ALL refresh tokens? Every user will be logged out on next refresh.')
    )
      return;
    if (!window.confirm('This cannot be undone. Are you absolutely sure?')) return;
    setBusy('revoke');
    try {
      await api.ops.revokeTokens();
      flash('All refresh tokens revoked.');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto', color: t.colors.textPrimary }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Ops Dashboard</h1>
        <span style={{ fontSize: '12px', color: t.colors.textSecondary }}>
          {health?.time ? `Updated ${new Date(health.time).toLocaleTimeString()}` : 'Loading…'} ·
          polls every 20s
        </span>
      </div>

      {notice && (
        <div
          style={{
            ...cardStyle,
            padding: '10px 14px',
            marginBottom: '16px',
            borderLeft: `3px solid ${t.colors.accent}`,
            fontSize: '13px',
          }}
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          style={{
            ...cardStyle,
            padding: '10px 14px',
            marginBottom: '16px',
            borderLeft: `3px solid ${t.colors.danger}`,
            fontSize: '13px',
            color: t.colors.danger,
          }}
        >
          {error}
        </div>
      )}

      {/* 1. Health */}
      <section style={{ ...cardStyle, padding: '16px', marginBottom: '20px' }}>
        <h2 style={sectionTitle}>System health</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px 32px', alignItems: 'center' }}>
          <StatusDot ok={health ? health.status === 'ok' : undefined} label="Overall" />
          <StatusDot ok={health?.db} label="Database" />
          <StatusDot ok={health?.kv} label="KV store" />
          <StatusDot ok={health?.ai_configured} label="AI configured" />
          <StatusDot ok={health?.oauth_configured} label="OAuth configured" />
          <span style={{ fontSize: '12px', color: t.colors.textSecondary, marginLeft: 'auto' }}>
            migration {health?.latest_migration ?? '—'}
          </span>
        </div>
      </section>

      {/* 2. Tier-A metric cards */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={sectionTitle}>Live activity &amp; totals</h2>
        {loading && !metrics ? (
          <div style={{ color: t.colors.textSecondary, fontSize: '14px' }}>Loading metrics…</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '12px',
            }}
          >
            <MetricCard label="Live (5m)" value={metrics?.live_users.m5 ?? 0} />
            <MetricCard label="Live (1h)" value={metrics?.live_users.h1 ?? 0} />
            <MetricCard label="Live (24h)" value={metrics?.live_users.d1 ?? 0} />
            <MetricCard label="Users" value={metrics?.totals.users ?? 0} />
            <MetricCard label="Notes" value={metrics?.totals.notes ?? 0} />
            <MetricCard label="Chat sessions" value={metrics?.totals.chat_sessions ?? 0} />
            <MetricCard label="Quiz attempts" value={metrics?.totals.quiz_attempts ?? 0} />
            <MetricCard label="Suspended" value={metrics?.totals.suspended_users ?? 0} />
            <MetricCard label="Active warnings" value={metrics?.totals.active_warnings ?? 0} />
            <MetricCard
              label="Soft-deleted notes"
              value={metrics?.moderation.soft_deleted_notes ?? 0}
            />
            <MetricCard label="Featured notes" value={metrics?.moderation.featured_notes ?? 0} />
            <MetricCard label="Chat messages" value={metrics?.table_rows.chat_messages ?? 0} />
            <MetricCard label="Study items" value={metrics?.table_rows.study_items ?? 0} />
          </div>
        )}
      </section>

      {/* 3. Charts */}
      <section style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <h2 style={{ ...sectionTitle, margin: 0 }}>Trends</h2>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[1, 7, 30].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  ...toolButton,
                  padding: '6px 12px',
                  background: range === r ? t.colors.accent : t.colors.bgTertiary,
                  borderColor: range === r ? t.colors.accent : t.colors.borderColor,
                }}
              >
                {r === 1 ? '24h' : `${r}d`}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '12px',
            opacity: chartsLoading ? 0.6 : 1,
            transition: t.transitions.fast,
          }}
        >
          {CHART_METRICS.map((c) => (
            <div key={c.key} style={{ ...cardStyle, padding: '14px' }}>
              <div style={{ fontSize: '13px', color: t.colors.textSecondary, marginBottom: '8px' }}>
                {c.label}
              </div>
              <MiniChart points={series[c.key] || []} color={c.color} variant={c.variant} />
            </div>
          ))}
        </div>
      </section>

      {/* 3b. Cloudflare Platform (Tier C) */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ ...sectionTitle, opacity: cfLoading ? 0.6 : 1 }}>
          Cloudflare Platform (Tier C)
        </h2>
        {cloudflare?.configured === false ? (
          <div
            style={{
              ...cardStyle,
              padding: '14px 16px',
              fontSize: '13px',
              color: t.colors.textSecondary,
            }}
          >
            Cloudflare analytics not configured — set CF_API_TOKEN and CF_ACCOUNT_ID secrets to
            enable Worker/D1 platform metrics.
          </div>
        ) : cloudflare?.ok === false ? (
          <div
            style={{
              ...cardStyle,
              padding: '14px 16px',
              fontSize: '13px',
              color: t.colors.danger,
              borderLeft: `3px solid ${t.colors.danger}`,
            }}
          >
            Cloudflare metrics error: {cloudflare.error || 'unknown error'}
          </div>
        ) : cloudflare?.ok ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: '12px',
              }}
            >
              <MetricCard
                label="Worker requests"
                value={cloudflare.workers?.totals.requests ?? 0}
              />
              <MetricCard label="Worker errors" value={cloudflare.workers?.totals.errors ?? 0} />
              <MetricCard label="Subrequests" value={cloudflare.workers?.totals.subrequests ?? 0} />
              <MetricCard label="D1 rows read" value={cloudflare.d1?.totals.rowsRead ?? 0} />
              <MetricCard label="D1 rows written" value={cloudflare.d1?.totals.rowsWritten ?? 0} />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '12px',
              }}
            >
              <div style={{ ...cardStyle, padding: '14px' }}>
                <div
                  style={{ fontSize: '13px', color: t.colors.textSecondary, marginBottom: '8px' }}
                >
                  Worker requests
                </div>
                <MiniChart
                  points={(cloudflare.workers?.points || []).map((p) => ({
                    t: p.t,
                    v: p.requests,
                  }))}
                  color={t.colors.accent}
                />
              </div>
              <div style={{ ...cardStyle, padding: '14px' }}>
                <div
                  style={{ fontSize: '13px', color: t.colors.textSecondary, marginBottom: '8px' }}
                >
                  Worker errors
                </div>
                <MiniChart
                  points={(cloudflare.workers?.points || []).map((p) => ({ t: p.t, v: p.errors }))}
                  color={t.colors.danger}
                />
              </div>
              <div style={{ ...cardStyle, padding: '14px' }}>
                <div
                  style={{ fontSize: '13px', color: t.colors.textSecondary, marginBottom: '8px' }}
                >
                  D1 rows read
                </div>
                <MiniChart
                  points={(cloudflare.d1?.points || []).map((p) => ({ t: p.t, v: p.rowsRead }))}
                  color={t.colors.success}
                  variant="bar"
                />
              </div>
              <div style={{ ...cardStyle, padding: '14px' }}>
                <div
                  style={{ fontSize: '13px', color: t.colors.textSecondary, marginBottom: '8px' }}
                >
                  D1 rows written
                </div>
                <MiniChart
                  points={(cloudflare.d1?.points || []).map((p) => ({ t: p.t, v: p.rowsWritten }))}
                  color={t.colors.accent}
                  variant="bar"
                />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: t.colors.textSecondary, fontSize: '14px' }}>
            Loading Cloudflare metrics…
          </div>
        )}
      </section>

      {/* 4. Maintenance & flags */}
      <section style={{ ...cardStyle, padding: '16px', marginBottom: '20px' }}>
        <h2 style={sectionTitle}>Maintenance &amp; feature flags</h2>
        {flags ? (
          <div>
            <ToggleRow
              label="Maintenance mode (locks out non-admins)"
              on={flags.maintenance}
              onChange={handleMaintenance}
              disabled={busy === 'maintenance'}
            />
            <ToggleRow
              label="Signups enabled"
              on={flags.signups}
              onChange={(v) => handleFlag('signups', v)}
              disabled={busy === 'signups'}
            />
            <ToggleRow
              label="Uploads enabled"
              on={flags.uploads}
              onChange={(v) => handleFlag('uploads', v)}
              disabled={busy === 'uploads'}
            />
            <ToggleRow
              label="AI chat enabled"
              on={flags.ai_chat}
              onChange={(v) => handleFlag('ai_chat', v)}
              disabled={busy === 'ai_chat'}
            />
          </div>
        ) : (
          <div style={{ color: t.colors.textSecondary, fontSize: '14px' }}>Loading flags…</div>
        )}
      </section>

      {/* 5. Tools */}
      <section style={{ ...cardStyle, padding: '16px', marginBottom: '20px' }}>
        <h2 style={sectionTitle}>Tools</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            style={toolButton}
            disabled={busy === 'subjects_note_count'}
            onClick={() => handleRecompute('subjects_note_count')}
          >
            Recompute subject note counts
          </button>
          <button
            style={toolButton}
            disabled={busy === 'user_notes_uploaded'}
            onClick={() => handleRecompute('user_notes_uploaded')}
          >
            Recompute user upload counts
          </button>
          <button
            style={toolButton}
            disabled={busy === 'usage_snapshot'}
            onClick={() => handleRecompute('usage_snapshot')}
          >
            Snapshot usage
          </button>
          <button style={toolButton} disabled={busy === 'export'} onClick={handleExport}>
            Export activity log CSV
          </button>
        </div>
      </section>

      {/* 6. Danger zone (super only) */}
      {isSuper && (
        <section
          style={{
            ...cardStyle,
            padding: '16px',
            marginBottom: '20px',
            border: `1px solid ${t.colors.danger}`,
          }}
        >
          <h2 style={{ ...sectionTitle, color: t.colors.danger }}>Danger zone</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: t.colors.textSecondary }}>
                Purge notes deleted more than
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="number"
                  min={0}
                  value={purgeDays}
                  onChange={(e) => setPurgeDays(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  style={{
                    width: '80px',
                    padding: '8px',
                    background: t.colors.bgTertiary,
                    color: t.colors.textPrimary,
                    border: `1px solid ${t.colors.borderColor}`,
                    borderRadius: t.borderRadius.md,
                  }}
                />
                <span style={{ fontSize: '13px', color: t.colors.textSecondary }}>days ago</span>
                <button
                  onClick={handlePurge}
                  disabled={busy === 'purge'}
                  style={{
                    ...toolButton,
                    background: t.colors.danger,
                    borderColor: t.colors.danger,
                    color: '#fff',
                  }}
                >
                  Purge deleted notes
                </button>
              </div>
            </div>
            <button
              onClick={handleRevoke}
              disabled={busy === 'revoke'}
              style={{
                ...toolButton,
                background: t.colors.danger,
                borderColor: t.colors.danger,
                color: '#fff',
              }}
            >
              Revoke all refresh tokens
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
