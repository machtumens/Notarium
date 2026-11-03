import { describe, expect, it } from 'vitest';
import type { Health } from '@/lib/admin-api';
import {
  diffStations,
  emptySnapshot,
  errorRate,
  overall,
  stationsOf,
  type Reading,
  type Snapshot,
} from './stations';

const got = <T>(data: T): Reading<T> => ({ data, error: null, forbidden: false, at: 1 });
const verdictOf = (s: Snapshot, id: string) => stationsOf(s).find((x) => x.id === id)!.verdict;

const DEEP: Health = {
  status: 'ok',
  time: 't',
  db: true,
  kv: true,
  ai_configured: true,
  oauth_configured: true,
};
const healthy = (): Snapshot => ({
  ...emptySnapshot(),
  health: got(DEEP),
  ready: got({ ok: true, checks: { db: true, kv: true } }),
  flags: got({ maintenance: false, signups: true, uploads: true, ai_chat: true }),
  requests7: got([{ t: 'a', v: 1000 }]),
  errors7: got([{ t: 'a', v: 4 }]),
  cf: got({ configured: true, workers: [] }),
});

describe('cockpit launch poll', () => {
  it('calls every station GO on a healthy worker', () => {
    expect(overall(stationsOf(healthy()))).toEqual({ verdict: 'go', text: 'ALL STATIONS GO' });
  });

  it('reads a failing D1 off the deep health answer as NO-GO', () => {
    const s = { ...healthy(), health: got({ ...DEEP, db: false }) };
    expect(verdictOf(s, 'db')).toBe('nogo');
    expect(overall(stationsOf(s)).verdict).toBe('nogo');
  });

  it('never turns a 403 into NO-GO — an uncleared role is N/A', () => {
    const forbidden = { data: null, error: 'Forbidden', forbidden: true, at: 1 };
    const s = { ...healthy(), flags: forbidden, cf: forbidden };
    expect(verdictOf(s, 'maint')).toBe('na');
    expect(verdictOf(s, 'edge')).toBe('na');
    expect(overall(stationsOf(s)).verdict).toBe('go');
  });

  it('falls back to the readiness probe for D1/KV when health is shallow', () => {
    const s = { ...healthy(), health: got({ status: 'ok' as const, time: 't' }) };
    expect(verdictOf(s, 'db')).toBe('go');
    expect(verdictOf({ ...s, ready: got({ ok: false, checks: null }) }, 'db')).toBe('na');
  });

  it('grades AI by channel count: none NO-GO, one CAUTION, two GO', () => {
    const ai = (gemini: number, deepseek: boolean) =>
      verdictOf({ ...healthy(), health: got({ ...DEEP, ai_keys: { gemini, deepseek } }) }, 'ai');
    expect([ai(0, false), ai(1, false), ai(0, true), ai(2, true)]).toEqual([
      'nogo',
      'caution',
      'caution',
      'go',
    ]);
  });

  it('puts maintenance mode on CAUTION and a missing answer on NO-GO', () => {
    const maint = {
      ...healthy(),
      flags: got({ maintenance: true, signups: true, uploads: true, ai_chat: true }),
    };
    expect(overall(stationsOf(maint)).text).toBe('HOLD · 1 ON CAUTION');
    const dead = { ...healthy(), health: { data: null, error: 'x', forbidden: false, at: 1 } };
    expect(verdictOf(dead, 'worker')).toBe('nogo');
  });

  it('computes the error rate and grades it', () => {
    expect(errorRate([{ t: 'a', v: 200 }], [{ t: 'a', v: 10 }])).toBe(5);
    expect(errorRate([], [])).toBeNull();
    const bad = { ...healthy(), errors7: got([{ t: 'a', v: 60 }]) };
    expect(verdictOf(bad, 'errors')).toBe('nogo');
  });

  it('logs only the stations whose verdict changed', () => {
    const a = stationsOf(healthy());
    const b = stationsOf({ ...healthy(), health: got({ ...DEEP, kv: false }) });
    expect(diffStations(null, b)).toEqual([]);
    expect(diffStations(a, b)).toEqual(['KV STORE  GO → NO-GO  NOT ANSWERING']);
  });
});
