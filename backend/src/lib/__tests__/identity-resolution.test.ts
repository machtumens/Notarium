import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../env';

// Firebase ID tokens are RS256 against a remote JWKS, so a real round-trip would
// need network + a real project. Instead we intercept `jose.jwtVerify` and branch
// on the key argument: the JWKS path passes a *function* (what createRemoteJWKSet
// returns), the legacy HS256 path passes a Uint8Array secret. Firebase tokens are
// scripted from a table; legacy tokens fall through to the real implementation, so
// the fallback leg is genuinely verified rather than stubbed.
const { firebaseTokens } = vi.hoisted(() => ({
  firebaseTokens: new Map<string, Record<string, unknown>>(),
}));

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose');
  return {
    ...actual,
    jwtVerify: async (token: string, key: unknown, opts?: unknown) => {
      if (typeof key === 'function') {
        const scripted = firebaseTokens.get(token);
        if (!scripted) throw new Error('not a valid Firebase ID token');
        return { payload: scripted, protectedHeader: { alg: 'RS256' } };
      }
      return actual.jwtVerify(token, key as Uint8Array, opts as never);
    },
  };
});

const { createToken, getUserFromToken } = await import('../auth');

const PROJECT_ID = 'notarium-test';
const JWT_SECRET = 'test-jwt-secret-identity-resolution';

type Row = {
  id: number;
  email: string | null;
  role: string;
  admin_role: string | null;
  firebase_uid: string | null;
};

// Minimal D1 stand-in. verifyFirebaseToken only ever issues four statements, so we
// dispatch on the statement text and keep the rows in memory. `calls` lets a test
// assert on what did NOT run (the hijack gate is about an UPDATE never firing).
function makeDb(seed: Row[]) {
  const rows = [...seed];
  const calls: string[] = [];
  let nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;

  const project = (r: Row) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    admin_role: r.admin_role,
  });

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              calls.push(sql);
              if (sql.includes('WHERE firebase_uid = ?')) {
                const hit = rows.find((r) => r.firebase_uid === args[0]);
                return hit ? project(hit) : null;
              }
              if (sql.includes('WHERE email = ?')) {
                const hit = rows.find((r) => r.email === args[0]);
                return hit ? project(hit) : null;
              }
              if (sql.includes('INSERT INTO users')) {
                const row: Row = {
                  id: nextId++,
                  firebase_uid: args[0] as string,
                  email: (args[1] as string | null) ?? null,
                  role: 'student',
                  admin_role: null,
                };
                rows.push(row);
                return project(row);
              }
              return null;
            },
            async run() {
              calls.push(sql);
              if (sql.includes('UPDATE users SET firebase_uid')) {
                const target = rows.find((r) => r.id === args[1]);
                if (target) target.firebase_uid = args[0] as string;
              }
              return { success: true };
            },
          };
        },
      };
    },
  };

  return { db, rows, calls };
}

function makeEnv(db: unknown, projectId: string | undefined = PROJECT_ID): Env {
  return { DB: db, JWT_SECRET, FIREBASE_PROJECT_ID: projectId } as unknown as Env;
}

const bearer = (token: string) =>
  new Request('https://api.test/whatever', { headers: { Authorization: `Bearer ${token}` } });

function scriptFirebaseToken(
  token: string,
  claims: { sub: string; email?: string; email_verified?: boolean; name?: string },
) {
  firebaseTokens.set(token, claims as unknown as Record<string, unknown>);
  return token;
}

describe('identity resolution — Firebase uid match', () => {
  it('returns the local user linked by firebase_uid without touching email lookup', async () => {
    const { db, calls } = makeDb([
      {
        id: 7,
        email: 'ada@notarium.test',
        role: 'admin',
        admin_role: 'super',
        firebase_uid: 'uid-ada',
      },
    ]);
    const token = scriptFirebaseToken('tok-uid-match', {
      sub: 'uid-ada',
      email: 'ada@notarium.test',
      email_verified: true,
    });

    const identity = await getUserFromToken(bearer(token), makeEnv(db));

    expect(identity).toEqual({
      id: 7,
      email: 'ada@notarium.test',
      role: 'admin',
      admin_role: 'super',
    });
    // Roles come from the D1 row, not from token claims — admin_role survives.
    expect(calls.some((c) => c.includes('WHERE email = ?'))).toBe(false);
    expect(calls.some((c) => c.includes('INSERT INTO users'))).toBe(false);
  });
});

describe('identity resolution — verified-email link gate', () => {
  it('links an existing account to the firebase_uid when email_verified is true', async () => {
    const { db, rows, calls } = makeDb([
      {
        id: 3,
        email: 'grace@notarium.test',
        role: 'student',
        admin_role: null,
        firebase_uid: null,
      },
    ]);
    const token = scriptFirebaseToken('tok-verified-link', {
      sub: 'uid-grace',
      email: 'grace@notarium.test',
      email_verified: true,
    });

    const identity = await getUserFromToken(bearer(token), makeEnv(db));

    expect(identity?.id).toBe(3);
    expect(rows.find((r) => r.id === 3)?.firebase_uid).toBe('uid-grace');
    expect(calls.some((c) => c.includes('UPDATE users SET firebase_uid'))).toBe(true);
    // Linking must not create a duplicate account.
    expect(rows).toHaveLength(1);
  });

  it('REFUSES to link on an unverified email and provisions a separate account instead', async () => {
    // The hijack scenario: an attacker signs up in Firebase claiming a victim's
    // address without verifying it. Linking here would hand over the victim's row.
    const { db, rows, calls } = makeDb([
      {
        id: 3,
        email: 'grace@notarium.test',
        role: 'admin',
        admin_role: 'super',
        firebase_uid: null,
      },
    ]);
    const token = scriptFirebaseToken('tok-unverified', {
      sub: 'uid-attacker',
      email: 'grace@notarium.test',
      email_verified: false,
    });

    const identity = await getUserFromToken(bearer(token), makeEnv(db));

    expect(calls.some((c) => c.includes('UPDATE users SET firebase_uid'))).toBe(false);
    expect(rows.find((r) => r.id === 3)?.firebase_uid).toBeNull();
    // The attacker gets a fresh, unprivileged row — never the admin's identity.
    expect(identity?.id).not.toBe(3);
    expect(identity?.role).toBe('student');
    expect(identity?.admin_role).toBeNull();
  });
});

describe('identity resolution — JIT provisioning', () => {
  it('creates a student row for a verified Firebase signup with no local account', async () => {
    const { db, rows } = makeDb([]);
    const token = scriptFirebaseToken('tok-new-user', {
      sub: 'uid-new',
      email: 'linus@notarium.test',
      email_verified: true,
      name: 'Linus',
    });

    const identity = await getUserFromToken(bearer(token), makeEnv(db));

    expect(rows).toHaveLength(1);
    expect(identity?.email).toBe('linus@notarium.test');
    expect(identity?.role).toBe('student');
    expect(rows[0].firebase_uid).toBe('uid-new');
  });
});

describe('identity resolution — legacy HS256 fallback', () => {
  it('falls back to the legacy JWT when the token is not a Firebase ID token', async () => {
    const { db, calls } = makeDb([]);
    const env = makeEnv(db);
    // Signed with the real jose SignJWT and verified by the real jwtVerify.
    const legacy = await createToken(
      { id: 42, email: 'legacy@notarium.test', role: 'student' },
      env,
    );

    const identity = await getUserFromToken(bearer(legacy), env);

    expect(identity?.id).toBe(42);
    expect(identity?.email).toBe('legacy@notarium.test');
    // The Firebase leg ran first, failed verification, and provisioned nothing.
    expect(calls.some((c) => c.includes('INSERT INTO users'))).toBe(false);
  });

  it('skips the Firebase leg entirely while FIREBASE_PROJECT_ID is unset', async () => {
    // This is the pre-Phase-0 production state: dual-verify is dormant and every
    // request takes the legacy path, so setting the var is the only live switch.
    const { db, calls } = makeDb([]);
    const env = makeEnv(db, undefined);
    const legacy = await createToken(
      { id: 9, email: 'dormant@notarium.test', role: 'student' },
      env,
    );

    const identity = await getUserFromToken(bearer(legacy), env);

    expect(identity?.id).toBe(9);
    // No Firebase lookup was even attempted — zero DB traffic on that leg.
    expect(calls).toHaveLength(0);
  });

  it('returns null when the token is neither a Firebase nor a valid legacy token', async () => {
    const { db } = makeDb([]);
    const identity = await getUserFromToken(bearer('garbage.token.value'), makeEnv(db));
    expect(identity).toBeNull();
  });
});
