import { describe, it, expect, beforeEach } from 'vitest';
import {
  setDisplayZone,
  getDisplayZone,
  formatDate,
  formatDateTime,
  formatTime,
  formatLongDate,
  formatLongDateTime,
  formatCalendarDate,
  formatAppointment,
  formatRelativeDay,
  SCHOOL_TIMEZONE,
} from '../datetime';

// The RENDERING half of F3. Storing one format fixed what lands in the
// database; it did nothing about what a browser DISPLAYS, because
// toLocale*() reads the device's zone. These pin the zone explicitly.
//
// Every case sets the display zone itself, so nothing depends on the TZ the
// test runner happens to boot with.

// 2026-08-03T17:00:00Z is Tue 04 Aug 00:00 in Jakarta and still Mon 03 Aug
// 13:00 in New York — a single instant that falls on two different DATES.
const ACROSS_MIDNIGHT = '2026-08-03T17:00:00Z';

beforeEach(() => setDisplayZone(null));

describe('display zone resolution', () => {
  it('defaults to the school zone when the student has no override', () => {
    expect(getDisplayZone()).toBe(SCHOOL_TIMEZONE);
    setDisplayZone(undefined);
    expect(getDisplayZone()).toBe(SCHOOL_TIMEZONE);
    setDisplayZone('');
    expect(getDisplayZone()).toBe(SCHOOL_TIMEZONE);
  });

  it('uses the student’s own zone when set', () => {
    setDisplayZone('America/New_York');
    expect(getDisplayZone()).toBe('America/New_York');
  });
});

describe('an instant renders on the correct DAY for the reader', () => {
  it('the same instant is 4 August in Jakarta and 3 August in New York', () => {
    setDisplayZone('Asia/Jakarta');
    expect(formatDate(ACROSS_MIDNIGHT)).toBe('4 Aug 2026');

    setDisplayZone('America/New_York');
    expect(formatDate(ACROSS_MIDNIGHT)).toBe('3 Aug 2026');
  });

  it('renders the wall-clock of the display zone, not of the device', () => {
    setDisplayZone('Asia/Jakarta');
    expect(formatTime(ACROSS_MIDNIGHT)).toBe('00:00');

    setDisplayZone('UTC');
    expect(formatTime(ACROSS_MIDNIGHT)).toBe('17:00');
  });

  it('long forms carry the same zone', () => {
    setDisplayZone('Asia/Jakarta');
    expect(formatLongDate(ACROSS_MIDNIGHT)).toBe('Tuesday, 4 August 2026');
    expect(formatLongDateTime(ACROSS_MIDNIGHT)).toBe('4 August 2026 at 00:00');
    expect(formatDateTime(ACROSS_MIDNIGHT)).toBe('4 Aug 2026, 00:00');
  });
});

describe('calendar dates are not instants', () => {
  it('a YYYY-MM-DD value renders as the day it names, in every zone', () => {
    // new Date('2026-08-27') is UTC midnight. Formatting THAT in a zone behind
    // UTC yields the 26th — an off-by-one invisible from Jakarta (UTC+7) and
    // obvious from New York. Calendar values are therefore read back in UTC.
    for (const zone of ['Asia/Jakarta', 'America/New_York', 'Pacific/Niue', 'UTC']) {
      setDisplayZone(zone);
      expect(formatCalendarDate('2026-08-27'), zone).toBe('27 Aug 2026');
    }
  });

  it('honours a shorter option set', () => {
    setDisplayZone('America/New_York');
    expect(formatCalendarDate('2026-08-27', { month: 'short', day: 'numeric' })).toBe('27 Aug');
  });
});

describe('appointments name their zone', () => {
  it('a tutor session shows the zone alongside the time', () => {
    setDisplayZone('Asia/Jakarta');
    const rendered = formatAppointment('2026-09-05T11:00:00Z');
    expect(rendered).toContain('18:00'); // 11:00Z = 18:00 WIB
    // The zone label is what stops two people meeting at different moments.
    expect(rendered).toMatch(/(WIB|GMT\+7)/);
  });

  it('the same session shows a different local time to someone elsewhere', () => {
    setDisplayZone('Asia/Jakarta');
    const jakarta = formatAppointment('2026-09-05T11:00:00Z');
    setDisplayZone('Europe/London');
    const london = formatAppointment('2026-09-05T11:00:00Z');
    expect(jakarta).not.toBe(london);
    expect(london).toContain('12:00'); // BST
  });
});

describe('bad input never renders as a wrong time', () => {
  it('returns the fallback rather than "Invalid Date"', () => {
    for (const bad of [null, undefined, '', 'not-a-date']) {
      expect(formatDate(bad)).toBe('—');
      expect(formatDateTime(bad)).toBe('—');
      expect(formatCalendarDate(bad)).toBe('—');
      expect(formatAppointment(bad)).toBe('—');
    }
  });

  it('an unknown display zone falls back to formatting rather than throwing', () => {
    setDisplayZone('Mars/Olympus_Mons');
    expect(() => formatDate(ACROSS_MIDNIGHT)).not.toThrow();
    expect(formatDate(ACROSS_MIDNIGHT)).toMatch(/2026/);
  });
});

describe('formatRelativeDay', () => {
  // The old formatter did Math.ceil over elapsed milliseconds, which made
  // "Today" unreachable: anything a millisecond old ceils to 1 and rendered as
  // "Yesterday". A note uploaded minutes ago claimed to be from yesterday.
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
  const daysAgoInZone = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    // Midday keeps the calendar day unambiguous either side of a zone offset.
    d.setHours(12, 0, 0, 0);
    return d;
  };

  beforeEach(() => setDisplayZone(SCHOOL_TIMEZONE));

  it('calls a note from a few minutes ago Today, not Yesterday', () => {
    expect(formatRelativeDay(minutesAgo(6))).toBe('Today');
  });

  it('still says Today at the far end of the same calendar day', () => {
    expect(formatRelativeDay(minutesAgo(60 * 3))).toBe('Today');
  });

  it('counts calendar days, so one day back is Yesterday', () => {
    expect(formatRelativeDay(daysAgoInZone(1))).toBe('Yesterday');
  });

  it('reports whole days for the rest of the week', () => {
    expect(formatRelativeDay(daysAgoInZone(3))).toBe('3 days ago');
  });

  it('singularises one week', () => {
    expect(formatRelativeDay(daysAgoInZone(8))).toBe('1 week ago');
  });

  it('falls back to an absolute date beyond a month', () => {
    expect(formatRelativeDay('2020-01-15T06:00:00Z')).toBe('15 Jan 2020');
  });

  it('never renders a future instant as though it had passed', () => {
    const scheduled = new Date(Date.now() + 3 * 86_400_000);
    expect(formatRelativeDay(scheduled)).not.toMatch(/ago|Today|Yesterday/);
  });

  it('returns the fallback for an unparseable value', () => {
    expect(formatRelativeDay(null)).toBe('—');
  });
});
