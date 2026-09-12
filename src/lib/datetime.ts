// Rendering timestamps in the student's own zone.
//
// The server stores every instant as ISO-8601 UTC with a `Z`. A bare
// `toLocaleDateString()` then renders it in whatever zone the VIEWER's device
// happens to be in — which is right by accident for a student at their desk in
// Jakarta and wrong for the same student on holiday, for a teacher marking from
// abroad, and for anyone whose device clock is misconfigured.
//
// Worse, it is wrong SILENTLY: a seven-hour shift still looks like a plausible
// time. So the zone is always passed explicitly here, never left to the device.

/** Where the school is. Matches SCHOOL_TIMEZONE in backend/src/lib/time.ts. */
export const SCHOOL_TIMEZONE = 'Asia/Jakarta';

// Module-level rather than a hook, so the twelve call sites that render a
// timestamp do not each have to thread a zone prop down from a provider. It is
// display configuration, like a locale — set once when the user loads, read
// during render. Changing it happens through AuthProvider, whose context update
// re-renders the tree anyway, so there is no stale-render window in practice.
let displayZone: string = SCHOOL_TIMEZONE;

/** user's own zone -> school default. Mirrors resolveZone() on the server. */
export function setDisplayZone(zone?: string | null): void {
  displayZone = zone || SCHOOL_TIMEZONE;
}

export function getDisplayZone(): string {
  return displayZone;
}

/**
 * The browser's own IANA zone, for capturing at signup. Returns undefined
 * rather than a guess when the runtime cannot say — the server treats a missing
 * zone as "use the school default", which is the right answer for most students.
 */
export function browserZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

type Input = string | number | Date | null | undefined;

function parse(value: Input): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function format(value: Input, opts: Intl.DateTimeFormatOptions, fallback: string): string {
  const d = parse(value);
  if (!d) return fallback;
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: displayZone, ...opts }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', opts).format(d);
  }
}

/** An instant, as a date: "27 Aug 2026". */
export function formatDate(value: Input, fallback = '—'): string {
  return format(value, { day: 'numeric', month: 'short', year: 'numeric' }, fallback);
}

/** An instant, as date + time: "27 Aug 2026, 15:53". */
export function formatDateTime(value: Input, fallback = '—'): string {
  return format(
    value,
    { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    fallback,
  );
}

/** An instant, spelled out: "Monday, 3 August 2026". Used where a date is the
 *  whole message and must not be misread — suspension end dates, mainly. */
export function formatLongDate(value: Input, fallback = '—'): string {
  return format(
    value,
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    fallback,
  );
}

/** An instant, spelled out with a time: "3 August 2026, 15:53". */
export function formatLongDateTime(value: Input, fallback = '—'): string {
  return format(
    value,
    { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    fallback,
  );
}

/** An instant, as a time only: "15:53". */
export function formatTime(value: Input, fallback = '—'): string {
  return format(value, { hour: '2-digit', minute: '2-digit' }, fallback);
}

/**
 * A DATE-ONLY value ('2026-08-27'), which is not an instant at all.
 *
 * `new Date('2026-08-27')` is parsed as UTC midnight, so formatting it in any
 * zone BEHIND UTC renders the previous day — an off-by-one that is invisible
 * from Jakarta (UTC+7) and obvious from New York. Such values are therefore
 * formatted in UTC, which reads them back as exactly the day they name.
 */
export function formatCalendarDate(
  value: Input,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
  fallback = '—',
): string {
  const d = parse(value);
  if (!d) return fallback;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(d);
}

/**
 * A wall-clock appointment, with its zone spelled out: "Tue 9 Sep, 18:00 WIB".
 *
 * Used where two named people have to be in the same place at the same moment.
 * A tutor session that renders as a bare "18:00" is exactly how one person ends
 * up waiting in an empty room.
 */
export function formatAppointment(value: Input, fallback = '—'): string {
  const d = parse(value);
  if (!d) return fallback;
  const base = format(
    d,
    { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
    fallback,
  );
  return `${base} ${zoneLabel(d)}`;
}

/** Short zone name for the display zone at a given instant ("WIB", "GMT+7"). */
export function zoneLabel(at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: displayZone,
      timeZoneName: 'short',
    }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/**
 * An instant, as a relative day label: "Today", "Yesterday", "3 days ago",
 * "2 weeks ago", falling back to an absolute date past a month.
 *
 * Counts CALENDAR days in the display zone, not elapsed hours. A note written
 * at 23:00 is "Yesterday" at 01:00 the next morning even though barely two
 * hours passed, which is what a reader means by the word. Elapsed-hours maths
 * also makes "Today" unreachable the moment you round the wrong way.
 *
 * Future instants (a scheduled publish) get the absolute date — never
 * "N days ago", which would read as though they had already happened.
 */
export function formatRelativeDay(value: Input, fallback = '—'): string {
  const d = parse(value);
  if (!d) return fallback;

  const dayNumber = (at: Date): number => {
    // en-CA renders as YYYY-MM-DD; Date.UTC of those parts gives a stable
    // day index to subtract, with no DST arithmetic in between.
    const [y, m, day] = new Intl.DateTimeFormat('en-CA', {
      timeZone: displayZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(at)
      .split('-')
      .map(Number);
    return Date.UTC(y, m - 1, day) / 86_400_000;
  };

  let diffDays: number;
  try {
    diffDays = dayNumber(new Date()) - dayNumber(d);
  } catch {
    return formatDate(d, fallback);
  }

  if (diffDays < 0) return formatDate(d, fallback);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  return formatDate(d, fallback);
}
