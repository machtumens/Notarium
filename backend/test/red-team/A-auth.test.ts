// A. Authentication & Identity (scenarios 1-20)
// Signup requires a @sekolahkristencalvin.org email (checked AFTER zod). The
// signup field is `name` (not display_name). Duplicate email -> 409.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, signupBody, uniqueEmail } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

describe('A. Signup (1-10)', () => {
  it('1. valid signup creates a student account + returns a token', async () => {
    const res = await call('/api/auth/signup', { body: signupBody(), ip: '1.1.1.1' });
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.token).toBeTypeOf('string');
    expect(json.user.role).toBe('student');
  });

  it('2. duplicate email is rejected (409)', async () => {
    const email = uniqueEmail('dup');
    await call('/api/auth/signup', { body: signupBody({ email }), ip: '1.1.1.2' });
    const res = await call('/api/auth/signup', { body: signupBody({ email }), ip: '1.1.1.3' });
    expect(res.status).toBe(409);
  });

  it('3. non-school domain rejected (encrypted_yw_id/OAuth identity path is separate)', async () => {
    // Signup never sets encrypted_yw_id; the domain gate is the identity guard here.
    const res = await call('/api/auth/signup', {
      body: signupBody({ email: 'attacker@gmail.com' }),
      ip: '1.1.1.4',
    });
    expect(res.status).toBe(400);
  });

  it('4. invalid email format rejected (400)', async () => {
    const res = await call('/api/auth/signup', {
      body: signupBody({ email: 'not-an-email' }),
      ip: '1.1.1.5',
    });
    expect(res.status).toBe(400);
  });

  it('5. password shorter than 8 rejected (400)', async () => {
    const res = await call('/api/auth/signup', {
      body: signupBody({ password: 'short' }),
      ip: '1.1.1.6',
    });
    expect(res.status).toBe(400);
  });

  it('6. password longer than 128 rejected (400)', async () => {
    const res = await call('/api/auth/signup', {
      body: signupBody({ password: 'a'.repeat(129) }),
      ip: '1.1.1.7',
    });
    expect(res.status).toBe(400);
  });

  it('7. name exceeding 100 chars rejected (400)', async () => {
    const res = await call('/api/auth/signup', {
      body: signupBody({ name: 'x'.repeat(101) }),
      ip: '1.1.1.8',
    });
    expect(res.status).toBe(400);
  });

  it('8. missing required fields rejected (400)', async () => {
    const res = await call('/api/auth/signup', { body: { email: uniqueEmail() }, ip: '1.1.1.9' });
    expect(res.status).toBe(400);
  });

  it('9. SQL-injection payload in email is neutralised (rejected, no dump)', async () => {
    const res = await call('/api/auth/signup', {
      body: signupBody({ email: "a'@x.org'; DROP TABLE users;--" }),
      ip: '1.1.1.10',
    });
    expect(res.status).toBe(400); // fails email format; parameterised queries anyway
    // users table still exists: a fresh valid signup must still succeed.
    const ok = await call('/api/auth/signup', { body: signupBody(), ip: '1.1.1.11' });
    expect(ok.status).toBe(201);
  });

  it('10. HTML/script in name is stored inertly (no execution surface server-side)', async () => {
    const res = await call('/api/auth/signup', {
      body: signupBody({ name: '<script>alert(1)</script>' }),
      ip: '1.1.1.12',
    });
    // Server accepts it (<=100 chars); XSS defence is the frontend renderer.
    // FINDING CANDIDATE: no server-side sanitisation of display_name.
    expect([201, 400]).toContain(res.status);
    if (res.status === 201) {
      const json = (await res.json()) as any;
      expect(json.user.name).toContain('<script>');
    }
  });
});

describe('A. Login (11-20)', () => {
  it('11. correct credentials return a JWT', async () => {
    const u = await seedUser();
    const res = await call('/api/auth/login', {
      body: { email: u.email, password: u.password },
      ip: '2.0.0.1',
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).token).toBeTypeOf('string');
  });

  it('12. wrong password rejected', async () => {
    const u = await seedUser();
    const res = await call('/api/auth/login', {
      body: { email: u.email, password: 'WrongPass1' },
      ip: '2.0.0.2',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('13. unknown user rejected', async () => {
    const res = await call('/api/auth/login', {
      body: { email: uniqueEmail('ghost'), password: 'whatever1' },
      ip: '2.0.0.3',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('14. suspended user is denied login', async () => {
    const u = await seedUser({ suspended: true });
    const res = await call('/api/auth/login', {
      body: { email: u.email, password: u.password },
      ip: '2.0.0.4',
    });
    // Documents actual behaviour. If this returns 200, suspension is NOT enforced
    // at login -> a real finding worth escalating.
    expect(res.status, 'suspended login should be blocked').not.toBe(200);
  });

  it('16. admin-login rejects a normal user password', async () => {
    const res = await call('/api/auth/admin-login', {
      body: { token: 'CorrectHorse9' },
      ip: '2.0.0.6',
    });
    expect(res.status).toBe(401);
  });

  it('17. student credentials cannot mint an admin token via admin-login', async () => {
    const u = await seedUser();
    const res = await call('/api/auth/admin-login', { body: { token: u.password }, ip: '2.0.0.7' });
    expect(res.status).toBe(401);
  });

  it('18. login response never exposes the password hash', async () => {
    const u = await seedUser();
    const res = await call('/api/auth/login', {
      body: { email: u.email, password: u.password },
      ip: '2.0.0.8',
    });
    const text = await res.text();
    expect(text).not.toMatch(/password_hash/i);
    expect(text).not.toMatch(/\$2[aby]\$/); // bcrypt hash signature
  });

  it('19. failed logins return consistently (no user-enumeration signal)', async () => {
    const u = await seedUser();
    const unknown = await call('/api/auth/login', {
      body: { email: uniqueEmail('nobody'), password: 'x' },
      ip: '2.0.0.9',
    });
    const wrongPw = await call('/api/auth/login', {
      body: { email: u.email, password: 'WrongPass1' },
      ip: '2.0.0.10',
    });
    // Both should be the same status; differing bodies would enable enumeration.
    expect(unknown.status).toBe(wrongPw.status);
  });

  it('20. two logins issue independent, individually-valid JWTs', async () => {
    const u = await seedUser();
    const a = (await (
      await call('/api/auth/login', {
        body: { email: u.email, password: u.password },
        ip: '2.0.0.11',
      })
    ).json()) as any;
    const b = (await (
      await call('/api/auth/login', {
        body: { email: u.email, password: u.password },
        ip: '2.0.0.12',
      })
    ).json()) as any;
    expect(a.token).toBeTypeOf('string');
    expect(b.token).toBeTypeOf('string');
    const meA = await call('/api/auth/me', { token: a.token });
    const meB = await call('/api/auth/me', { token: b.token });
    expect(meA.status).toBe(200);
    expect(meB.status).toBe(200);
  });
});
