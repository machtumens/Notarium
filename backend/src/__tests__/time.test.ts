import { describe, it, expect } from 'vitest';
import {
  localDate,
  addLocalDays,
  startOfLocalDay,
  isValidZone,
  resolveZone,
  isoUtc,
  SCHOOL_TIMEZONE,
} from '../lib/time';

// Every case pins its zone explicitly and passes its own instant. Nothing here
// reads the ambient TZ or the wall clock, so these behave identically on a
// developer machine in Jakarta and on a CI box in UTC.

const WIB = 'Asia/Jakarta'; // UTC+7, never observes DST

describe('localDate — the calendar date where the student actually is', () => {
  // This is F1, stated as a test. A student revising Monday evening and again
  // before school on Tuesday recorded ONE streak day, because the UTC date
  // rolled over at 07:00 WIB — the middle of the school morning.
  it('Mon 22:00 and Tue 06:00 WIB are two different days (F1)', () => {
    const monEvening = new Date('2026-08-03T15:00:00Z'); // Mon 22:00 WIB
    const tueMorning = new Date('2026-08-03T23:00:00Z'); // Tue 06:00 WIB

    expect(localDate(WIB, monEvening)).toBe('2026-08-03');
    expect(localDate(WIB, tueMorning)).toBe('2026-08-04');
    expect(localDate(WIB, tueMorning)).not.toBe(localDate(WIB, monEvening));
  });

  it('...and UTC collapses them into one, which is the bug', () => {
    const monEvening = new Date('2026-08-03T15:00:00Z');
    const tueMorning = new Date('2026-08-03T23:00:00Z');

    // Both are 2026-08-03 in UTC. Tuesday therefore read as a missed day.
    expect(monEvening.toISOString().slice(0, 10)).toBe('2026-08-03');
    expect(tueMorning.toISOString().slice(0, 10)).toBe('2026-08-03');
  });

  it('yields YYYY-MM-DD, so dates sort and compare as strings', () => {
    expect(localDate(WIB, new Date('2026-01-05T04:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(localDate(WIB, new Date('2026-01-05T04:00:00Z'))).toBe('2026-01-05');
  });

  it('falls back to the UTC date for an unknown zone rather than throwing', () => {
    // A bad zone must never be able to break a streak write.
    expect(localDate('Mars/Olympus_Mons', new Date('2026-08-03T15:00:00Z'))).toBe('2026-08-03');
  });
});

describe('addLocalDays — calendar arithmetic, not millisecond arithmetic', () => {
  it('steps a day back and forward', () => {
    expect(addLocalDays('2026-08-04', -1)).toBe('2026-08-03');
    expect(addLocalDays('2026-08-03', 1)).toBe('2026-08-04');
  });

  it('crosses month and year ends', () => {
    expect(addLocalDays('2026-09-01', -1)).toBe('2026-08-31');
    expect(addLocalDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addLocalDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
  });

  it('survives a DST day, where a fixed 24h step silently returns TODAY', () => {
    // The real failure mode, not an approximation of it. 2026-11-01 in New York
    // is the fall-back day and runs for 25 hours (00:00 EDT -> 00:00 EST next
    // day). At 23:30 local, 24 hours earlier is 00:30 local on the SAME day.
    //
    // The old streak code did exactly this: utcDate(now - 24h). Had the streak
    // been computed in a named zone with that arithmetic, "yesterday" would
    // equal "today", `last === yesterday` would be false for a genuine
    // yesterday, and a live streak would reset to 1 — for a student who did
    // nothing wrong except live somewhere with DST.
    const zone = 'America/New_York';
    const at = new Date('2026-11-02T04:30:00Z'); // Sun 23:30 EST
    const naiveYesterday = localDate(zone, new Date(at.getTime() - 24 * 60 * 60 * 1000));

    expect(localDate(zone, at)).toBe('2026-11-01');
    expect(naiveYesterday, 'a fixed 24h step lands back on the same local day').toBe('2026-11-01');

    // Calendar arithmetic is immune: it never consults an offset at all.
    expect(addLocalDays(localDate(zone, at), -1)).toBe('2026-10-31');
  });

  it('and the mirror case: a 23-hour spring-forward day', () => {
    const zone = 'America/New_York';
    const at = new Date('2026-03-08T05:30:00Z'); // Sun 00:30 EST, before the jump
    expect(localDate(zone, at)).toBe('2026-03-08');
    expect(addLocalDays(localDate(zone, at), -1)).toBe('2026-03-07');
    expect(addLocalDays(localDate(zone, at), 1)).toBe('2026-03-09');
  });
});

describe('startOfLocalDay — when a local day begins, as a UTC instant', () => {
  it('Jakarta midnight is 17:00Z the previous day', () => {
    expect(startOfLocalDay(WIB, '2026-08-04').toISOString()).toBe('2026-08-03T17:00:00.000Z');
  });

  it('UTC midnight is itself', () => {
    expect(startOfLocalDay('UTC', '2026-08-04').toISOString()).toBe('2026-08-04T00:00:00.000Z');
  });

  it('round-trips: the instant it returns is the first moment of that local day', () => {
    for (const zone of [WIB, 'UTC', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Kolkata']) {
      const start = startOfLocalDay(zone, '2026-08-04');
      expect(localDate(zone, start), zone).toBe('2026-08-04');
      // One second earlier is still the previous day.
      expect(localDate(zone, new Date(start.getTime() - 1000)), zone).toBe('2026-08-03');
    }
  });

  it('is correct on both sides of a DST transition', () => {
    const zone = 'America/New_York';
    // Spring forward (EST -05:00 -> EDT -04:00) on 2026-03-08.
    expect(startOfLocalDay(zone, '2026-03-07').toISOString()).toBe('2026-03-07T05:00:00.000Z');
    expect(startOfLocalDay(zone, '2026-03-09').toISOString()).toBe('2026-03-09T04:00:00.000Z');
    // The transition day itself still starts at the pre-shift offset.
    expect(startOfLocalDay(zone, '2026-03-08').toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('handles a half-hour zone', () => {
    expect(startOfLocalDay('Asia/Kolkata', '2026-08-04').toISOString()).toBe(
      '2026-08-03T18:30:00.000Z',
    );
  });

  it('falls back to UTC midnight for an unknown zone rather than throwing', () => {
    expect(startOfLocalDay('Mars/Olympus_Mons', '2026-08-04').toISOString()).toBe(
      '2026-08-04T00:00:00.000Z',
    );
  });
});

describe('zone resolution and validation', () => {
  it('accepts real IANA names and rejects everything else', () => {
    expect(isValidZone(WIB)).toBe(true);
    expect(isValidZone('UTC')).toBe(true);
    expect(isValidZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidZone('')).toBe(false);
    expect(isValidZone(null)).toBe(false);
    expect(isValidZone(undefined)).toBe(false);
    expect(isValidZone(7)).toBe(false);
    expect(isValidZone('A'.repeat(200))).toBe(false);
  });

  it('resolves user -> school default -> UTC', () => {
    expect(resolveZone('Europe/London')).toBe('Europe/London');
    expect(resolveZone(null)).toBe(SCHOOL_TIMEZONE);
    expect(resolveZone(undefined)).toBe(SCHOOL_TIMEZONE);
    expect(resolveZone('')).toBe(SCHOOL_TIMEZONE);
  });
});

describe('isoUtc', () => {
  it('matches the format the SQL fragments write — no milliseconds', () => {
    expect(isoUtc(new Date('2026-08-03T17:00:00.123Z'))).toBe('2026-08-03T17:00:00Z');
    expect(isoUtc(new Date('2026-08-03T17:00:00Z'))).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
  });
});
