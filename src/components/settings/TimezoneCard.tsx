import { useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../app/AuthContext';
import api from '../../lib/api';
import { SCHOOL_TIMEZONE, browserZone, setDisplayZone } from '../../lib/datetime';

// Which zone a student's DAYS are counted in — their streak, when cards come
// due, and every timestamp the app renders.
//
// Most students never touch this: leaving it on school time is correct for
// anyone actually at school, and that is the default. It exists for the student
// who is abroad, whose streak would otherwise break for studying at the
// "wrong" hour.

/** Fallbacks for runtimes without Intl.supportedValuesOf (Safari < 15.4). */
const COMMON_ZONES = [
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/London',
  'America/New_York',
  'UTC',
];

/** Computed once: the tz database does not change while the page is open. */
function allZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    return supported?.length ? supported : COMMON_ZONES;
  } catch {
    return COMMON_ZONES;
  }
}

const ZONES = allZones();

/** The current wall-clock in a zone — the only check a student can actually do. */
function nowIn(zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date());
  } catch {
    return '—';
  }
}

export default function TimezoneCard() {
  const { currentTheme } = useTheme();
  const { user, refreshUser } = useAuth();
  const detected = browserZone();

  // '' is a real, meaningful value here: "no override, follow the school".
  const [choice, setChoice] = useState<string>(user?.timezone ?? '');
  const [busy, setBusy] = useState(false);

  const effective = choice || SCHOOL_TIMEZONE;
  const dirty = (user?.timezone ?? '') !== choice;

  const cardStyle: React.CSSProperties = {
    background: currentTheme.colors.bgSecondary,
    border: `1px solid ${currentTheme.colors.borderColor}`,
    borderRadius: currentTheme.borderRadius.lg,
    padding: '20px',
    marginTop: '16px',
  };

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: currentTheme.borderRadius.md,
    border: `1px solid ${currentTheme.colors.borderColor}`,
    background: currentTheme.colors.bgTertiary,
    color: currentTheme.colors.textPrimary,
    fontSize: '14px',
    width: '100%',
    marginBottom: '12px',
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.updateProfile({ timezone: choice || null });
      // Update the render zone immediately; refreshUser then re-reads the row so
      // the rest of the app agrees with the server rather than with local state.
      setDisplayZone(choice || null);
      await refreshUser();
      toast.success(choice ? `Times now shown in ${choice}` : 'Back to school time');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save timezone');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '20px' }}>🕓</span>
        <span
          style={{ fontWeight: '700', fontSize: '15px', color: currentTheme.colors.textPrimary }}
        >
          Time zone
        </span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: currentTheme.colors.textSecondary }}>
        Your streak, your due cards, and every time shown in Notarium follow this zone. Leave it on
        school time unless you are studying from somewhere else.
      </p>

      <select
        aria-label="Time zone"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        style={selectStyle}
      >
        <option value="">School time — {SCHOOL_TIMEZONE}</option>
        {detected && detected !== SCHOOL_TIMEZONE && (
          <option value={detected}>This device — {detected}</option>
        )}
        <optgroup label="All zones">
          {ZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </optgroup>
      </select>

      <p
        style={{
          margin: '0 0 12px',
          fontSize: '13px',
          color: currentTheme.colors.textSecondary,
        }}
      >
        Right now in {effective}: <strong>{nowIn(effective)}</strong>
      </p>

      <button
        type="button"
        onClick={save}
        disabled={busy || !dirty}
        style={{
          padding: '8px 16px',
          borderRadius: currentTheme.borderRadius.md,
          border: 'none',
          cursor: busy || !dirty ? 'default' : 'pointer',
          fontSize: '13px',
          fontWeight: '600',
          transition: currentTheme.transitions.default,
          background: currentTheme.colors.accent,
          color: '#fff',
          opacity: busy || !dirty ? 0.6 : 1,
        }}
      >
        {busy ? 'Saving…' : 'Save time zone'}
      </button>
    </div>
  );
}
