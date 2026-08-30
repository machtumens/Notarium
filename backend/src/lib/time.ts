// Time helpers.
//
// THE FORMAT RULE: every timestamp this app stores is ISO-8601 UTC with a `Z`
// — `2026-08-27T08:53:06Z`. Nothing stores SQLite's bare datetime-now
// form (`2026-08-27 08:53:06`), because the two parse DIFFERENTLY in a browser:
// the space form is read as LOCAL time and the `Z` form as UTC, so the same
// instant renders hours apart with no error and no type mismatch — it just
// looks like a different plausible time.
//
// The two are also not comparable as strings on the same date: `'T'` (0x54)
// sorts after `' '` (0x20), so a same-day comparison across formats inverts.
// That is why writes and read-thresholds share the fragments below rather than
// each spelling out their own SQL.

/** `now`, as an ISO-8601 UTC string. Use in INSERT/UPDATE. */
export const SQL_NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";

/**
 * `now` shifted by a SQLite modifier, as ISO-8601 UTC. Use for read
 * thresholds so they compare like-for-like against stored values.
 *
 *   sqlNowIso("-5 minutes")  ->  strftime('%Y-%m-%dT%H:%M:%SZ','now','-5 minutes')
 *
 * Only accepts a literal modifier, never user input — it is interpolated into
 * SQL. Callers passing a bound parameter use SQL_NOW_ISO_PARAM instead.
 */
export function sqlNowIso(modifier: string): string {
  if (!/^[+-]?\d+(\.\d+)?\s+(second|minute|hour|day|month|year)s?$/.test(modifier)) {
    throw new Error(`sqlNowIso: unsafe modifier ${JSON.stringify(modifier)}`);
  }
  return `strftime('%Y-%m-%dT%H:%M:%SZ','now','${modifier}')`;
}

/** Same, but the modifier arrives as a bound `?` parameter. */
export const SQL_NOW_ISO_PARAM = "strftime('%Y-%m-%dT%H:%M:%SZ','now', ?)";

/** An ISO-8601 UTC string for a JS Date, matching the SQL fragments above. */
export function isoUtc(d: Date = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The calendar date in a given IANA zone — the only correct basis for a
 * streak. `en-CA` is deliberate: it formats as YYYY-MM-DD, so there is no
 * manual assembly to get wrong.
 *
 * Verified working in the Workers runtime (plan Task 0).
 */
export function localDate(zone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    // An unknown zone must never break a streak write; fall back to UTC.
    return at.toISOString().slice(0, 10);
  }
}

/** Default zone for this deployment — the school is in one place. */
export const SCHOOL_TIMEZONE = 'Asia/Jakarta';

/** user's own zone → school default → UTC. */
export function resolveZone(userZone?: string | null): string {
  return userZone || SCHOOL_TIMEZONE || 'UTC';
}

/**
 * True when `zone` is a timezone this runtime can actually format in.
 *
 * Validated by USE rather than by regex: the value is fed to
 * `Intl.DateTimeFormat`, so the only question that matters is whether that
 * call throws. A regex would accept `Asia/Atlantis` and reject nothing that
 * matters. Zones arrive from the browser and from Settings, so this runs at
 * the request boundary, not deep in the streak code.
 */
export function isValidZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The offset of `zone` from UTC at a given instant, in milliseconds
 * (positive east of Greenwich, so Asia/Jakarta is +7h).
 *
 * Read the instant's wall-clock in `zone`, then reinterpret those same
 * fields as if they were UTC. The gap between that and the real instant IS
 * the offset. `hourCycle: 'h23'` matters: with `hour12: false` some ICU
 * builds render midnight as hour "24", which would push the offset a full
 * day out.
 */
function zoneOffsetMs(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const f: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') f[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  // Whole seconds only — sub-second offsets do not exist in the tz database.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant at which a local calendar day begins in `zone`.
 *
 * `startOfLocalDay('Asia/Jakarta', '2026-08-04')` -> 2026-08-03T17:00:00Z
 *
 * Two passes, because the offset depends on the very instant being solved
 * for: the first guess treats local midnight as if it were UTC midnight and
 * measures the offset there; if correcting by that offset crosses a DST
 * transition, the offset at the corrected instant differs and the second
 * pass uses it instead. Zones without DST (Asia/Jakarta) settle on pass one.
 */
export function startOfLocalDay(zone: string, localDay: string): Date {
  const guess = Date.parse(`${localDay}T00:00:00Z`);
  if (Number.isNaN(guess)) throw new Error(`startOfLocalDay: bad date ${JSON.stringify(localDay)}`);
  try {
    const first = zoneOffsetMs(zone, new Date(guess));
    const corrected = guess - first;
    const second = zoneOffsetMs(zone, new Date(corrected));
    return new Date(second === first ? corrected : guess - second);
  } catch {
    // Unknown zone: UTC midnight, matching localDate()'s fallback.
    return new Date(guess);
  }
}

/**
 * Calendar arithmetic on a YYYY-MM-DD string. Deliberately NOT
 * "instant ± n × 86400000": a DST day is 23 or 25 hours long, so adding a
 * fixed number of milliseconds can land on the same local date or skip one.
 * Streak continuity depends on getting this exactly right.
 */
export function addLocalDays(localDay: string, days: number): string {
  const [y, m, d] = localDay.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
