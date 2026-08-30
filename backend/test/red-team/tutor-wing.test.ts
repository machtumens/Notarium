// Tutor wing — T1 (profiles/directory) and T2 (group rooms).
//
// The seat-race case is the one that actually protects users: D1 has no
// SELECT ... FOR UPDATE, so overselling a room is prevented by the
// UNIQUE (session_id, seat_no) constraint rather than by application logic.
// If that constraint or the retry loop regresses, this test is what catches it.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applySchema, resetData, call, seedUser, seedSubject, env } from './helpers';

beforeAll(applySchema);
beforeEach(resetData);

/** An approved tutor with an open group room. Returns ids and the tutor. */
async function seedRoom(seatCap: number) {
  const tutor = await seedUser();
  const subject = await seedSubject('Physics');

  await env.DB.prepare(
    `INSERT INTO tutor_profiles (user_id, subject_id, status) VALUES (?, ?, 'active')`,
  )
    .bind(tutor.id, subject)
    .run();
  const profile = (await env.DB.prepare(`SELECT id FROM tutor_profiles WHERE user_id = ?`)
    .bind(tutor.id)
    .first()) as { id: number };

  const res = await call('/api/sessions', {
    method: 'POST',
    token: tutor.token,
    body: {
      tutor_profile_id: profile.id,
      starts_at: '2030-01-01T10:00:00Z',
      ends_at: '2030-01-01T11:00:00Z',
      seat_cap: seatCap,
      topic: 'Waves',
    },
  });
  const json = (await res.json()) as { id: number };
  return { tutor, subject, profileId: profile.id, sessionId: json.id };
}

describe('Tutor wing — T1 profiles & directory', () => {
  it('a pending application never appears in the public directory', async () => {
    const u = await seedUser();
    const subject = await seedSubject();
    await env.DB.prepare(
      `INSERT INTO tutor_profiles (user_id, subject_id, status) VALUES (?, ?, 'pending')`,
    )
      .bind(u.id, subject)
      .run();

    const res = await call('/api/tutors', { token: u.token });
    const json = (await res.json()) as { tutors: unknown[] };
    expect(json.tutors).toHaveLength(0);
  });

  it('the directory never leaks a tutor email address', async () => {
    const { tutor } = await seedRoom(4);
    const viewer = await seedUser();
    const res = await call('/api/tutors', { token: viewer.token });
    const text = await res.text();
    expect(text).not.toContain(tutor.email);
  });

  it('a student cannot approve their own application', async () => {
    const u = await seedUser();
    const subject = await seedSubject();
    await env.DB.prepare(
      `INSERT INTO tutor_profiles (user_id, subject_id, status) VALUES (?, ?, 'pending')`,
    )
      .bind(u.id, subject)
      .run();
    const p = (await env.DB.prepare(`SELECT id FROM tutor_profiles WHERE user_id = ?`)
      .bind(u.id)
      .first()) as { id: number };

    const res = await call(`/api/admin/tutors/${p.id}/approve`, {
      method: 'POST',
      token: u.token,
      body: { status: 'active' },
    });
    expect(res.status).toBe(403);
  });

  it('the directory requires authentication', async () => {
    const res = await call('/api/tutors');
    expect(res.status).toBe(401);
  });
});

describe('Tutor wing — T2 seat capacity', () => {
  it('N students racing for N-1 seats: exactly N-1 succeed, room is never oversold', async () => {
    const CAP = 5;
    const { sessionId } = await seedRoom(CAP);
    const students = await Promise.all(Array.from({ length: 12 }, () => seedUser()));

    const results = await Promise.all(
      students.map((s) =>
        call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: s.token }),
      ),
    );
    const created = results.filter((r) => r.status === 201).length;
    const full = results.filter((r) => r.status === 409).length;

    const row = (await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM tutor_bookings WHERE session_id = ? AND status = 'booked'`,
    )
      .bind(sessionId)
      .first()) as { c: number };

    expect(created, `201s=${created} 409s=${full}`).toBe(CAP);
    expect(row.c, 'rows in the database must match the seats granted').toBe(CAP);
    expect(created + full).toBe(students.length);
  });

  // The concurrency test above can only prove as much as the harness actually
  // parallelises, and miniflare may serialise D1 calls. This asserts the
  // DATABASE-LEVEL guarantee directly, which is what protects production
  // whether or not two requests truly interleave: without this constraint the
  // retry loop in bookSession has nothing to lose the race against.
  it('the database itself rejects two bookings on the same chair', async () => {
    const { sessionId } = await seedRoom(4);
    const [a, b] = await Promise.all([seedUser(), seedUser()]);

    await env.DB.prepare(
      `INSERT INTO tutor_bookings (session_id, student_id, seat_no, status)
       VALUES (?, ?, 1, 'booked')`,
    )
      .bind(sessionId, a.id)
      .run();

    let rejected = false;
    try {
      await env.DB.prepare(
        `INSERT INTO tutor_bookings (session_id, student_id, seat_no, status)
         VALUES (?, ?, 1, 'booked')`,
      )
        .bind(sessionId, b.id)
        .run();
    } catch (e) {
      rejected = /UNIQUE constraint failed/i.test(String(e));
    }
    expect(rejected, 'UNIQUE (session_id, seat_no) must reject the duplicate chair').toBe(true);
  });

  it('seat numbers stay unique and inside 1..cap', async () => {
    const CAP = 4;
    const { sessionId } = await seedRoom(CAP);
    const students = await Promise.all(Array.from({ length: CAP }, () => seedUser()));
    await Promise.all(
      students.map((s) =>
        call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: s.token }),
      ),
    );

    const { results } = await env.DB.prepare(
      `SELECT seat_no FROM tutor_bookings WHERE session_id = ? AND status = 'booked'`,
    )
      .bind(sessionId)
      .all();
    const seats = (results ?? []).map((r) => Number((r as { seat_no: number }).seat_no)).sort();
    expect(seats).toEqual([1, 2, 3, 4]);
  });

  it('the same student booking 10x concurrently gets exactly one seat', async () => {
    const { sessionId } = await seedRoom(6);
    const s = await seedUser();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: s.token }),
      ),
    );
    const row = (await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM tutor_bookings WHERE session_id = ? AND student_id = ?`,
    )
      .bind(sessionId, s.id)
      .first()) as { c: number };
    expect(row.c).toBe(1);
  });

  it('cancelling frees the chair for someone else', async () => {
    const CAP = 2;
    const { sessionId } = await seedRoom(CAP);
    const [a, b, c] = await Promise.all([seedUser(), seedUser(), seedUser()]);

    expect(
      (await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: a.token })).status,
    ).toBe(201);
    expect(
      (await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: b.token })).status,
    ).toBe(201);
    // Full.
    expect(
      (await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: c.token })).status,
    ).toBe(409);

    expect(
      (await call(`/api/sessions/${sessionId}/cancel`, { method: 'POST', token: a.token })).status,
    ).toBe(200);
    // A freed chair must be reusable — this is what the negative-seat parking is for.
    expect(
      (await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: c.token })).status,
    ).toBe(201);
  });
});

describe('Tutor wing — T2 state machine & authorisation', () => {
  it('the tutor cannot book their own session', async () => {
    const { tutor, sessionId } = await seedRoom(4);
    const res = await call(`/api/sessions/${sessionId}/book`, {
      method: 'POST',
      token: tutor.token,
    });
    expect(res.status).toBe(400);
  });

  it('a cancelled session cannot be booked', async () => {
    const { tutor, sessionId } = await seedRoom(4);
    await call(`/api/sessions/${sessionId}/cancel`, { method: 'POST', token: tutor.token });
    const s = await seedUser();
    const res = await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: s.token });
    expect(res.status).toBe(409);
  });

  it('a tutor cancelling the room releases every booking', async () => {
    const { tutor, sessionId } = await seedRoom(3);
    const students = await Promise.all([seedUser(), seedUser()]);
    await Promise.all(
      students.map((s) =>
        call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: s.token }),
      ),
    );
    await call(`/api/sessions/${sessionId}/cancel`, { method: 'POST', token: tutor.token });

    const row = (await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM tutor_bookings WHERE session_id = ? AND status = 'booked'`,
    )
      .bind(sessionId)
      .first()) as { c: number };
    expect(row.c).toBe(0);
  });

  it('a student who is not booked cannot cancel', async () => {
    const { sessionId } = await seedRoom(4);
    const outsider = await seedUser();
    const res = await call(`/api/sessions/${sessionId}/cancel`, {
      method: 'POST',
      token: outsider.token,
    });
    expect(res.status).toBe(404);
  });

  it('a non-owner cannot open a session on someone else’s profile', async () => {
    const { profileId } = await seedRoom(4);
    const impostor = await seedUser();
    const res = await call('/api/sessions', {
      method: 'POST',
      token: impostor.token,
      body: {
        tutor_profile_id: profileId,
        starts_at: '2030-03-01T10:00:00Z',
        ends_at: '2030-03-01T11:00:00Z',
        seat_cap: 4,
      },
    });
    expect(res.status).toBe(403);
  });
});

describe('Tutor wing — T3 one-to-one', () => {
  /** Open a 1:1 slot on an existing active profile. */
  async function seedOneToOne(
    tutorToken: string,
    profileId: number,
    over: Record<string, unknown> = {},
  ) {
    const res = await call('/api/sessions', {
      method: 'POST',
      token: tutorToken,
      body: {
        tutor_profile_id: profileId,
        kind: 'one_to_one',
        starts_at: '2030-02-01T10:00:00Z',
        ends_at: '2030-02-01T10:45:00Z',
        location: 'Library room 3',
        ...over,
      },
    });
    return res;
  }

  it('a tutor can open a 45-minute 1:1 slot, and it is a single seat', async () => {
    const { tutor, profileId } = await seedRoom(4);
    const res = await seedOneToOne(tutor.token, profileId);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { kind: string; seat_cap: number };
    expect(json.kind).toBe('one_to_one');
    expect(json.seat_cap).toBe(1);
  });

  it('the second student to reach a 1:1 slot is turned away', async () => {
    const { tutor, profileId } = await seedRoom(4);
    const created = (await (await seedOneToOne(tutor.token, profileId)).json()) as { id: number };
    const [a, b] = await Promise.all([seedUser(), seedUser()]);

    expect(
      (await call(`/api/sessions/${created.id}/book`, { method: 'POST', token: a.token })).status,
    ).toBe(201);
    expect(
      (await call(`/api/sessions/${created.id}/book`, { method: 'POST', token: b.token })).status,
    ).toBe(409);
  });

  it('concurrent students racing one 1:1 slot: exactly one wins', async () => {
    const { tutor, profileId } = await seedRoom(4);
    const created = (await (await seedOneToOne(tutor.token, profileId)).json()) as { id: number };
    const students = await Promise.all(Array.from({ length: 8 }, () => seedUser()));

    const results = await Promise.all(
      students.map((s) =>
        call(`/api/sessions/${created.id}/book`, { method: 'POST', token: s.token }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);

    const row = (await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM tutor_bookings WHERE session_id = ? AND status = 'booked'`,
    )
      .bind(created.id)
      .first()) as { c: number };
    expect(row.c).toBe(1);
  });

  it('a 1:1 without a location is refused — every private session records where', async () => {
    const { tutor, profileId } = await seedRoom(4);
    const res = await seedOneToOne(tutor.token, profileId, { location: undefined });
    expect(res.status).toBe(400);
  });

  it('an open-ended "1:1" is refused', async () => {
    const { tutor, profileId } = await seedRoom(4);
    const res = await seedOneToOne(tutor.token, profileId, {
      ends_at: '2030-02-01T18:00:00Z', // 8 hours
    });
    expect(res.status).toBe(400);
  });

  it('a 1:1 appears in the normal session listing — it is never hidden', async () => {
    const { tutor, profileId } = await seedRoom(4);
    const created = (await (await seedOneToOne(tutor.token, profileId)).json()) as { id: number };
    const viewer = await seedUser();
    const res = await call('/api/sessions', { token: viewer.token });
    const json = (await res.json()) as { sessions: Array<{ id: number; kind: string }> };
    const found = json.sessions.find((x) => x.id === created.id);
    expect(found, 'a 1:1 must be visible in the same listing as group rooms').toBeTruthy();
    expect(found?.kind).toBe('one_to_one');
  });

  it('cancelling a 1:1 frees the slot for someone else', async () => {
    const { tutor, profileId } = await seedRoom(4);
    const created = (await (await seedOneToOne(tutor.token, profileId)).json()) as { id: number };
    const [a, b] = await Promise.all([seedUser(), seedUser()]);

    expect(
      (await call(`/api/sessions/${created.id}/book`, { method: 'POST', token: a.token })).status,
    ).toBe(201);
    expect(
      (await call(`/api/sessions/${created.id}/book`, { method: 'POST', token: b.token })).status,
    ).toBe(409);
    expect(
      (await call(`/api/sessions/${created.id}/cancel`, { method: 'POST', token: a.token })).status,
    ).toBe(200);
    expect(
      (await call(`/api/sessions/${created.id}/book`, { method: 'POST', token: b.token })).status,
    ).toBe(201);
  });
});

describe('Tutor wing — T4 points & ratings', () => {
  const pointsOf = async (userId: number) => {
    const r = (await env.DB.prepare(`SELECT learning_points FROM users WHERE id = ?`)
      .bind(userId)
      .first()) as { learning_points: number };
    return Number(r.learning_points ?? 0);
  };

  it('completing a session with attendees awards points once', async () => {
    const { tutor, sessionId } = await seedRoom(4); // 10:00-11:00 = 1 hour
    const s = await seedUser();
    await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: s.token });

    const before = await pointsOf(tutor.id);
    const res = await call(`/api/sessions/${sessionId}/complete`, {
      method: 'POST',
      token: tutor.token,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { points_awarded: number };
    expect(json.points_awarded).toBe(80); // 80/hour x 1 hour
    expect(await pointsOf(tutor.id)).toBe(before + 80);
  });

  it('completing twice does NOT award twice — this guards the whole ranking', async () => {
    const { tutor, sessionId } = await seedRoom(4);
    const s = await seedUser();
    await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: s.token });

    await call(`/api/sessions/${sessionId}/complete`, { method: 'POST', token: tutor.token });
    const afterFirst = await pointsOf(tutor.id);

    const second = await call(`/api/sessions/${sessionId}/complete`, {
      method: 'POST',
      token: tutor.token,
    });
    expect(second.status).toBe(200);
    const json = (await second.json()) as { already_completed?: boolean };
    expect(json.already_completed).toBe(true);
    expect(await pointsOf(tutor.id)).toBe(afterFirst);
  });

  // Concurrent completes must mint exactly one award.
  //
  // The interleaving that breaks this is rare — a single round of ten caught it
  // in roughly one run in ten, which is far too weak a guard for points. So the
  // scenario runs over several INDEPENDENT sessions, each an independent chance
  // to catch it, and asserts the sharper invariant underneath the points total:
  // exactly one caller may be the winner, every other must report
  // already_completed. A second winner IS the double-mint, and shows up even in
  // the round where the points happen to land right.
  const RACE_ROUNDS = 6;
  const RACERS = 12;

  it('concurrent complete calls award exactly one session, with exactly one winner', async () => {
    for (let round = 0; round < RACE_ROUNDS; round++) {
      const { tutor, sessionId } = await seedRoom(4);
      const student = await seedUser();
      await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: student.token });

      const before = await pointsOf(tutor.id);
      const responses = await Promise.all(
        Array.from({ length: RACERS }, () =>
          call(`/api/sessions/${sessionId}/complete`, { method: 'POST', token: tutor.token }),
        ),
      );
      const bodies = (await Promise.all(responses.map((r) => r.json()))) as {
        already_completed?: boolean;
      }[];

      const winners = bodies.filter((b) => !b.already_completed).length;
      expect(
        winners,
        `round ${round}: ${winners} callers each believed they completed the session`,
      ).toBe(1);

      const gained = (await pointsOf(tutor.id)) - before;
      expect(
        gained,
        `round ${round}: gained=${gained} — a repeated complete must not mint points`,
      ).toBe(80);
    }
  });

  it('an empty room awards nothing — a tutor cannot farm by opening rooms', async () => {
    const { tutor, sessionId } = await seedRoom(4);
    const before = await pointsOf(tutor.id);
    const res = await call(`/api/sessions/${sessionId}/complete`, {
      method: 'POST',
      token: tutor.token,
    });
    const json = (await res.json()) as { points_awarded: number };
    expect(json.points_awarded).toBe(0);
    expect(await pointsOf(tutor.id)).toBe(before);
  });

  it('a crowded room earns the same as a small one — time given, not headcount', async () => {
    const a = await seedRoom(10);
    const b = await seedRoom(10);
    const many = await Promise.all(Array.from({ length: 8 }, () => seedUser()));
    const one = await seedUser();

    await Promise.all(
      many.map((s) =>
        call(`/api/sessions/${a.sessionId}/book`, { method: 'POST', token: s.token }),
      ),
    );
    await call(`/api/sessions/${b.sessionId}/book`, { method: 'POST', token: one.token });

    const beforeA = await pointsOf(a.tutor.id);
    const beforeB = await pointsOf(b.tutor.id);
    await call(`/api/sessions/${a.sessionId}/complete`, { method: 'POST', token: a.tutor.token });
    await call(`/api/sessions/${b.sessionId}/complete`, { method: 'POST', token: b.tutor.token });

    expect((await pointsOf(a.tutor.id)) - beforeA).toBe((await pointsOf(b.tutor.id)) - beforeB);
  });

  it('a non-owner cannot complete someone else’s session', async () => {
    const { sessionId } = await seedRoom(4);
    const impostor = await seedUser();
    const res = await call(`/api/sessions/${sessionId}/complete`, {
      method: 'POST',
      token: impostor.token,
    });
    expect(res.status).toBe(403);
  });

  it('a cancelled session cannot be completed', async () => {
    const { tutor, sessionId } = await seedRoom(4);
    await call(`/api/sessions/${sessionId}/cancel`, { method: 'POST', token: tutor.token });
    const res = await call(`/api/sessions/${sessionId}/complete`, {
      method: 'POST',
      token: tutor.token,
    });
    expect(res.status).toBe(409);
  });

  it('an attendee can rate, and rating_avg is recomputed from the rows', async () => {
    const { tutor, profileId, sessionId } = await seedRoom(4);
    const [a, b] = await Promise.all([seedUser(), seedUser()]);
    await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: a.token });
    await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: b.token });
    await call(`/api/sessions/${sessionId}/complete`, { method: 'POST', token: tutor.token });

    const bookings = await env.DB.prepare(
      `SELECT id, student_id FROM tutor_bookings WHERE session_id = ?`,
    )
      .bind(sessionId)
      .all();
    const rows = (bookings.results ?? []) as Array<{ id: number; student_id: number }>;
    const bookingOf = (uid: number) => rows.find((r) => Number(r.student_id) === uid)!.id;

    expect(
      (
        await call(`/api/bookings/${bookingOf(a.id)}/rate`, {
          method: 'POST',
          token: a.token,
          body: { rating: 5 },
        })
      ).status,
    ).toBe(200);
    const res = await call(`/api/bookings/${bookingOf(b.id)}/rate`, {
      method: 'POST',
      token: b.token,
      body: { rating: 3 },
    });
    const json = (await res.json()) as { rating_avg: number };
    expect(Number(json.rating_avg)).toBe(4); // (5 + 3) / 2

    const prof = (await env.DB.prepare(
      `SELECT rating_avg, session_count FROM tutor_profiles WHERE id = ?`,
    )
      .bind(profileId)
      .first()) as { rating_avg: number; session_count: number };
    expect(Number(prof.rating_avg)).toBe(4);
    expect(Number(prof.session_count)).toBe(1);
  });

  it('re-rating replaces the score rather than skewing the mean', async () => {
    const { tutor, profileId, sessionId } = await seedRoom(4);
    const a = await seedUser();
    await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: a.token });
    await call(`/api/sessions/${sessionId}/complete`, { method: 'POST', token: tutor.token });
    const b = (await env.DB.prepare(`SELECT id FROM tutor_bookings WHERE session_id = ?`)
      .bind(sessionId)
      .first()) as { id: number };

    await call(`/api/bookings/${b.id}/rate`, {
      method: 'POST',
      token: a.token,
      body: { rating: 1 },
    });
    await call(`/api/bookings/${b.id}/rate`, {
      method: 'POST',
      token: a.token,
      body: { rating: 5 },
    });

    const prof = (await env.DB.prepare(`SELECT rating_avg FROM tutor_profiles WHERE id = ?`)
      .bind(profileId)
      .first()) as { rating_avg: number };
    expect(Number(prof.rating_avg)).toBe(5);
  });

  it('a stranger cannot rate someone else’s booking', async () => {
    const { tutor, sessionId } = await seedRoom(4);
    const a = await seedUser();
    await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: a.token });
    await call(`/api/sessions/${sessionId}/complete`, { method: 'POST', token: tutor.token });
    const b = (await env.DB.prepare(`SELECT id FROM tutor_bookings WHERE session_id = ?`)
      .bind(sessionId)
      .first()) as { id: number };

    const stranger = await seedUser();
    const res = await call(`/api/bookings/${b.id}/rate`, {
      method: 'POST',
      token: stranger.token,
      body: { rating: 5 },
    });
    expect(res.status).toBe(403);
  });

  it('a session that has not been completed cannot be rated', async () => {
    const { sessionId } = await seedRoom(4);
    const a = await seedUser();
    await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: a.token });
    const b = (await env.DB.prepare(`SELECT id FROM tutor_bookings WHERE session_id = ?`)
      .bind(sessionId)
      .first()) as { id: number };

    const res = await call(`/api/bookings/${b.id}/rate`, {
      method: 'POST',
      token: a.token,
      body: { rating: 5 },
    });
    expect(res.status).toBe(409);
  });

  it('ratings outside 1..5 are refused', async () => {
    const { tutor, sessionId } = await seedRoom(4);
    const a = await seedUser();
    await call(`/api/sessions/${sessionId}/book`, { method: 'POST', token: a.token });
    await call(`/api/sessions/${sessionId}/complete`, { method: 'POST', token: tutor.token });
    const b = (await env.DB.prepare(`SELECT id FROM tutor_bookings WHERE session_id = ?`)
      .bind(sessionId)
      .first()) as { id: number };

    for (const bad of [0, 6, 2.5]) {
      const res = await call(`/api/bookings/${b.id}/rate`, {
        method: 'POST',
        token: a.token,
        body: { rating: bad },
      });
      expect(res.status, `rating=${bad} must be refused`).toBe(400);
    }
  });
});
