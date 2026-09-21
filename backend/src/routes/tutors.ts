import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getAuthedUser, requireRole } from '../lib/auth';
import {
  availabilitySchema,
  parseBody,
  rateBookingSchema,
  sessionCreateSchema,
  tutorApplySchema,
  tutorReviewSchema,
} from '../lib/validation';

// Tutor wing — T1: profiles and directory.
//
// Scheduling, booking and points awards are NOT here. 1:1 sessions in
// particular stay unbuilt until the safeguarding question in the tutor-wing
// plan has a product answer — minors arranging private sessions through a
// school product is a policy decision, not an engineering one.
//
// Eligibility rule (plan Open Question 1, resolved conservatively): a student
// may APPLY once they have some demonstrated study record; a moderator then
// approves. Nothing here self-grants tutor status.

const MIN_POINTS_TO_APPLY = 100;
const MIN_NOTES_TO_APPLY = 1;

type Row = Record<string, unknown>;

async function eligibilityFor(userId: number, env: Env) {
  const u = await env.DB.prepare(
    `SELECT learning_points, notes_uploaded, suspended FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ learning_points: number; notes_uploaded: number; suspended: number }>();

  const points = Number(u?.learning_points ?? 0);
  const notes = Number(u?.notes_uploaded ?? 0);
  const suspended = Number(u?.suspended ?? 0) === 1;

  const reasons: string[] = [];
  if (suspended) reasons.push('Your account is suspended.');
  if (points < MIN_POINTS_TO_APPLY)
    reasons.push(`Earn ${MIN_POINTS_TO_APPLY} learning points (you have ${points}).`);
  if (notes < MIN_NOTES_TO_APPLY)
    reasons.push('Publish at least one note so classmates can see your work.');

  return {
    eligible: reasons.length === 0,
    reasons,
    learning_points: points,
    notes_uploaded: notes,
    requirements: { learning_points: MIN_POINTS_TO_APPLY, notes_uploaded: MIN_NOTES_TO_APPLY },
  };
}

/** GET /api/tutors/eligibility — may I apply, and if not, what is missing. */
export async function getTutorEligibility(request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const el = await eligibilityFor(user.id, env);
  const { results } = await env.DB.prepare(
    `SELECT tp.id, tp.subject_id, tp.status, s.name AS subject_name
       FROM tutor_profiles tp
       LEFT JOIN subjects s ON s.id = tp.subject_id
      WHERE tp.user_id = ?`,
  )
    .bind(user.id)
    .all();

  return jsonResponse({ ...el, my_profiles: results ?? [] }, 200, env);
}

/** GET /api/tutors — the directory. Only ACTIVE profiles are ever public. */
export async function listTutors(request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const url = new URL(request.url);
  const subjectId = Number(url.searchParams.get('subject_id'));
  const params: (string | number)[] = [];
  let where = `WHERE tp.status = 'active' AND COALESCE(u.suspended, 0) = 0`;
  if (Number.isFinite(subjectId) && subjectId > 0) {
    where += ' AND tp.subject_id = ?';
    params.push(subjectId);
  }

  const { results } = await env.DB.prepare(
    `SELECT
        tp.id, tp.subject_id, tp.blurb, tp.grade_min, tp.grade_max, tp.languages,
        tp.rating_avg, tp.session_count,
        u.id AS user_id, u.display_name, u.photo_url, u.grade, u.graduated,
        u.learning_points,
        s.name AS subject_name, s.icon AS subject_icon
       FROM tutor_profiles tp
       JOIN users u ON u.id = tp.user_id
       LEFT JOIN subjects s ON s.id = tp.subject_id
       ${where}
      ORDER BY COALESCE(tp.rating_avg, 0) DESC, u.learning_points DESC
      LIMIT 100`,
  )
    .bind(...params)
    .all();

  // Never leak the tutor's email — the directory is a peer-visible surface.
  const tutors = (results ?? []).map((r: Row) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.display_name,
    photo_url: r.photo_url,
    grade: r.grade,
    alumni: Number(r.graduated ?? 0) === 1,
    subject_id: r.subject_id,
    subject_name: r.subject_name,
    subject_icon: r.subject_icon,
    blurb: r.blurb,
    grade_min: r.grade_min,
    grade_max: r.grade_max,
    languages: r.languages,
    rating_avg: r.rating_avg,
    session_count: r.session_count,
    learning_points: r.learning_points,
  }));

  return jsonResponse({ tutors }, 200, env);
}

/** POST /api/tutors/apply — opt in for one subject. Lands on 'pending'. */
export async function applyAsTutor(request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const body = await parseBody(request, tutorApplySchema, env);
  if (body instanceof Response) return body;

  const subjectId = Number(body.subject_id);
  if (!Number.isFinite(subjectId) || subjectId <= 0) {
    return jsonResponse({ error: 'subject_id is required' }, 400, env);
  }
  const blurb = typeof body.blurb === 'string' ? body.blurb.slice(0, 400) : null;

  const el = await eligibilityFor(user.id, env);
  if (!el.eligible) {
    return jsonResponse({ error: 'Not eligible to tutor yet', reasons: el.reasons }, 403, env);
  }

  const subject = await env.DB.prepare(`SELECT id FROM subjects WHERE id = ?`)
    .bind(subjectId)
    .first();
  if (!subject) return jsonResponse({ error: 'Subject not found' }, 404, env);

  const existing = await env.DB.prepare(
    `SELECT id, status FROM tutor_profiles WHERE user_id = ? AND subject_id = ?`,
  )
    .bind(user.id, subjectId)
    .first<{ id: number; status: string }>();
  if (existing) {
    return jsonResponse(
      { error: `You already have a ${existing.status} application for this subject` },
      409,
      env,
    );
  }

  const gradeMin = Number.isFinite(Number(body.grade_min)) ? Number(body.grade_min) : null;
  const gradeMax = Number.isFinite(Number(body.grade_max)) ? Number(body.grade_max) : null;

  await env.DB.prepare(
    `INSERT INTO tutor_profiles (user_id, subject_id, blurb, grade_min, grade_max, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
  )
    .bind(user.id, subjectId, blurb, gradeMin, gradeMax)
    .run();

  return jsonResponse(
    { success: true, status: 'pending', message: 'Sent for review by a moderator.' },
    201,
    env,
  );
}

/** POST /api/admin/tutors/:id/approve — moderator grants or revokes. */
export async function reviewTutorApplication(profileId: string, request: Request, env: Env) {
  const admin = await requireRole(request, env, ['moderator']);
  if (admin instanceof Response) return admin;

  const body = await parseBody(request, tutorReviewSchema, env);
  if (body instanceof Response) return body;

  const status = String(body.status ?? '');
  if (!['active', 'paused', 'revoked', 'pending'].includes(status)) {
    return jsonResponse(
      { error: 'status must be one of: active, paused, revoked, pending' },
      400,
      env,
    );
  }

  const id = Number(profileId);
  if (!Number.isFinite(id)) return jsonResponse({ error: 'Invalid profile id' }, 400, env);

  const profile = await env.DB.prepare(`SELECT id FROM tutor_profiles WHERE id = ?`)
    .bind(id)
    .first();
  if (!profile) return jsonResponse({ error: 'Tutor profile not found' }, 404, env);

  await env.DB.prepare(
    `UPDATE tutor_profiles SET status = ?, approved_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
  )
    .bind(status, admin.id, id)
    .run();

  return jsonResponse({ success: true, id, status }, 200, env);
}

// ---------------------------------------------------------------------------
// T2 — group rooms. T3 — one-to-one sessions.
//
// 1:1 was gated on a safeguarding question; the product owner has since decided
// to open it. Two choices carry that decision through the code rather than
// leaving it implicit:
//   * a 1:1 session is a normal row in tutor_sessions with seat_cap = 1, so it
//     appears in the same listings and the same audit trail as a group room —
//     nothing about it is private or special-cased away from moderator view;
//   * `location` is required for 1:1, so every booking records WHERE it happens.
// Neither is a policy; both make the policy reviewable if one is written later.
// ---------------------------------------------------------------------------

/** A cancelled booking must release its chair without losing the row. Parking
 *  it on a negative, per-booking-unique seat keeps history AND frees the
 *  positive seat for the next student, since the UNIQUE index spans all rows. */
const freedSeat = (bookingId: number) => -bookingId;

function isUniqueViolation(e: unknown, column: string): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /UNIQUE constraint failed/i.test(msg) && msg.includes(column);
}

/** POST /api/tutors/:id/availability — a tutor publishes a window. */
export async function addAvailability(profileId: string, request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const id = Number(profileId);
  const profile = await env.DB.prepare(
    `SELECT id, user_id, status FROM tutor_profiles WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: number; user_id: number; status: string }>();
  if (!profile) return jsonResponse({ error: 'Tutor profile not found' }, 404, env);
  // Ownership, not just authentication — a tutor may only publish their own time.
  if (profile.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403, env);
  if (profile.status !== 'active') {
    return jsonResponse({ error: 'Your tutor profile is not active yet' }, 403, env);
  }

  const body = await parseBody(request, availabilitySchema, env);
  if (body instanceof Response) return body;

  const startsAt = String(body.starts_at ?? '');
  const endsAt = String(body.ends_at ?? '');
  if (!startsAt || !endsAt) {
    return jsonResponse({ error: 'starts_at and ends_at are required' }, 400, env);
  }
  if (endsAt <= startsAt) {
    return jsonResponse({ error: 'ends_at must be after starts_at' }, 400, env);
  }
  const kind = body.kind === 'one_to_one' ? 'one_to_one' : 'group';
  // A 1:1 window is a single chair by definition; only group rooms take a cap.
  const seatCap = kind === 'one_to_one' ? 1 : Number(body.seat_cap);
  if (kind === 'group' && (!Number.isFinite(seatCap) || seatCap < 2 || seatCap > 30)) {
    return jsonResponse({ error: 'seat_cap must be between 2 and 30' }, 400, env);
  }

  const row = await env.DB.prepare(
    `INSERT INTO tutor_availability (tutor_profile_id, starts_at, ends_at, kind, seat_cap)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(id, startsAt, endsAt, kind, seatCap)
    .first<{ id: number }>();

  return jsonResponse({ success: true, id: row?.id }, 201, env);
}

/** DELETE /api/tutors/availability/:id */
export async function deleteAvailability(availabilityId: string, request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const id = Number(availabilityId);
  const row = await env.DB.prepare(
    `SELECT a.id, tp.user_id FROM tutor_availability a
       JOIN tutor_profiles tp ON tp.id = a.tutor_profile_id
      WHERE a.id = ?`,
  )
    .bind(id)
    .first<{ id: number; user_id: number }>();
  if (!row) return jsonResponse({ error: 'Availability not found' }, 404, env);
  if (row.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403, env);

  await env.DB.prepare(`DELETE FROM tutor_availability WHERE id = ?`).bind(id).run();
  return jsonResponse({ success: true }, 200, env);
}

/** POST /api/sessions — a tutor opens a group room. */
export async function createSession(request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const body = await parseBody(request, sessionCreateSchema, env);
  if (body instanceof Response) return body;

  const kind = body.kind === 'one_to_one' ? 'one_to_one' : 'group';

  const profileId = Number(body.tutor_profile_id);
  const profile = await env.DB.prepare(
    `SELECT id, user_id, subject_id, status FROM tutor_profiles WHERE id = ?`,
  )
    .bind(profileId)
    .first<{ id: number; user_id: number; subject_id: number; status: string }>();
  if (!profile) return jsonResponse({ error: 'Tutor profile not found' }, 404, env);
  if (profile.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403, env);
  if (profile.status !== 'active') {
    return jsonResponse({ error: 'Your tutor profile is not active yet' }, 403, env);
  }

  const startsAt = String(body.starts_at ?? '');
  const endsAt = String(body.ends_at ?? '');
  if (!startsAt || !endsAt) {
    return jsonResponse({ error: 'starts_at and ends_at are required' }, 400, env);
  }
  if (endsAt <= startsAt) {
    return jsonResponse({ error: 'ends_at must be after starts_at' }, 400, env);
  }
  const seatCap = kind === 'one_to_one' ? 1 : Number(body.seat_cap);
  if (kind === 'group' && (!Number.isFinite(seatCap) || seatCap < 2 || seatCap > 30)) {
    return jsonResponse({ error: 'seat_cap must be between 2 and 30' }, 400, env);
  }

  const topic = typeof body.topic === 'string' ? body.topic.slice(0, 160) : null;
  const location = typeof body.location === 'string' ? body.location.slice(0, 300) : null;
  // Required for 1:1 so a private session always records where it takes place.
  if (kind === 'one_to_one' && !location) {
    return jsonResponse(
      { error: 'location is required for a one-to-one session (room or meeting link)' },
      400,
      env,
    );
  }
  // The brief specifies 45-minute 1:1 slots; cap the length so a "1:1" cannot
  // quietly become an open-ended booking.
  if (kind === 'one_to_one') {
    const mins = (Date.parse(endsAt) - Date.parse(startsAt)) / 60000;
    if (Number.isFinite(mins) && (mins < 15 || mins > 90)) {
      return jsonResponse(
        { error: 'a one-to-one session must be between 15 and 90 minutes' },
        400,
        env,
      );
    }
  }
  const availabilityId = Number.isFinite(Number(body.availability_id))
    ? Number(body.availability_id)
    : null;

  const row = await env.DB.prepare(
    `INSERT INTO tutor_sessions
       (tutor_profile_id, availability_id, subject_id, topic, kind, seat_cap, starts_at, ends_at, location, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled') RETURNING id`,
  )
    .bind(
      profile.id,
      availabilityId,
      profile.subject_id,
      topic,
      kind,
      seatCap,
      startsAt,
      endsAt,
      location,
    )
    .first<{ id: number }>();

  return jsonResponse({ success: true, id: row?.id, kind, seat_cap: seatCap }, 201, env);
}

/** GET /api/sessions — upcoming rooms, plus whether the caller is in them. */
export async function listSessions(request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const url = new URL(request.url);
  const subjectId = Number(url.searchParams.get('subject_id'));
  const params: (string | number)[] = [user.id, user.id];
  let where = `WHERE ts.status = 'scheduled'`;
  if (Number.isFinite(subjectId) && subjectId > 0) {
    where += ' AND ts.subject_id = ?';
    params.push(subjectId);
  }

  const { results } = await env.DB.prepare(
    `SELECT
        ts.id, ts.subject_id, ts.topic, ts.kind, ts.seat_cap, ts.starts_at, ts.ends_at,
        ts.location, ts.status,
        u.display_name AS tutor_name, u.id AS tutor_user_id,
        s.name AS subject_name, s.icon AS subject_icon,
        (SELECT COUNT(*) FROM tutor_bookings b
          WHERE b.session_id = ts.id AND b.status = 'booked') AS seats_taken,
        (SELECT COUNT(*) FROM tutor_bookings b
          WHERE b.session_id = ts.id AND b.status = 'booked' AND b.student_id = ?) AS i_am_in,
        -- The server already knows who is asking, so it answers "is this mine"
        -- directly rather than shipping ids for the client to compare. One less
        -- place for an identity mismatch to silently hide a control.
        CASE WHEN tp.user_id = ? THEN 1 ELSE 0 END AS i_am_tutor
       FROM tutor_sessions ts
       JOIN tutor_profiles tp ON tp.id = ts.tutor_profile_id
       JOIN users u ON u.id = tp.user_id
       LEFT JOIN subjects s ON s.id = ts.subject_id
       ${where}
      ORDER BY ts.starts_at ASC
      LIMIT 100`,
  )
    .bind(...params)
    .all();

  const sessions = (results ?? []).map((r: Row) => ({
    ...r,
    seats_left: Math.max(0, Number(r.seat_cap ?? 0) - Number(r.seats_taken ?? 0)),
    i_am_in: Number(r.i_am_in ?? 0) > 0,
    i_am_tutor: Number(r.i_am_tutor ?? 0) > 0,
  }));

  return jsonResponse({ sessions }, 200, env);
}

/** POST /api/sessions/:id/book — join a group room. Seat-capped. */
export async function bookSession(sessionId: string, request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const id = Number(sessionId);
  const session = await env.DB.prepare(
    `SELECT ts.id, ts.seat_cap, ts.status, tp.user_id AS tutor_user_id
       FROM tutor_sessions ts
       JOIN tutor_profiles tp ON tp.id = ts.tutor_profile_id
      WHERE ts.id = ?`,
  )
    .bind(id)
    .first<{ id: number; seat_cap: number; status: string; tutor_user_id: number }>();

  if (!session) return jsonResponse({ error: 'Session not found' }, 404, env);
  if (session.status !== 'scheduled') {
    return jsonResponse({ error: `This session is ${session.status}` }, 409, env);
  }
  if (session.tutor_user_id === user.id) {
    return jsonResponse({ error: 'You are running this session' }, 400, env);
  }

  const cap = Number(session.seat_cap ?? 0);
  if (cap < 1) return jsonResponse({ error: 'This session has no seats' }, 409, env);

  // D1 has no SELECT ... FOR UPDATE, so capacity is enforced by the database
  // rather than by checking-then-inserting: pick the lowest free chair in
  // 1..cap and let UNIQUE (session_id, seat_no) reject whoever loses the race.
  // The loser re-reads and retries; when no chair is left, the room is full.
  // Bounded by cap + 2 so a pathological interleaving still terminates.
  for (let attempt = 0; attempt < cap + 2; attempt++) {
    const { results } = await env.DB.prepare(
      `SELECT seat_no FROM tutor_bookings WHERE session_id = ? AND seat_no > 0`,
    )
      .bind(id)
      .all();
    const taken = new Set((results ?? []).map((r: Row) => Number(r.seat_no)));

    let seat = 0;
    for (let n = 1; n <= cap; n++) {
      if (!taken.has(n)) {
        seat = n;
        break;
      }
    }
    if (seat === 0) return jsonResponse({ error: 'This session is full' }, 409, env);

    try {
      await env.DB.prepare(
        `INSERT INTO tutor_bookings (session_id, student_id, seat_no, status)
         VALUES (?, ?, ?, 'booked')`,
      )
        .bind(id, user.id, seat)
        .run();
      return jsonResponse({ success: true, seat_no: seat }, 201, env);
    } catch (e) {
      if (isUniqueViolation(e, 'student_id')) {
        return jsonResponse({ error: 'You have already joined this session' }, 409, env);
      }
      if (isUniqueViolation(e, 'seat_no')) {
        continue; // lost the chair; re-read and try the next free one
      }
      throw e;
    }
  }

  return jsonResponse({ error: 'This session is full' }, 409, env);
}

/** POST /api/sessions/:id/cancel — student leaves, or the tutor calls it off. */
export async function cancelSession(sessionId: string, request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const id = Number(sessionId);
  const session = await env.DB.prepare(
    `SELECT ts.id, ts.status, tp.user_id AS tutor_user_id
       FROM tutor_sessions ts
       JOIN tutor_profiles tp ON tp.id = ts.tutor_profile_id
      WHERE ts.id = ?`,
  )
    .bind(id)
    .first<{ id: number; status: string; tutor_user_id: number }>();
  if (!session) return jsonResponse({ error: 'Session not found' }, 404, env);

  // The tutor cancels the whole room; anyone else can only withdraw themselves.
  if (session.tutor_user_id === user.id) {
    if (session.status !== 'scheduled') {
      return jsonResponse({ error: `This session is already ${session.status}` }, 409, env);
    }
    await env.DB.prepare(
      `UPDATE tutor_sessions SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
    )
      .bind(id)
      .run();
    await env.DB.prepare(
      `UPDATE tutor_bookings SET status = 'cancelled', seat_no = -id
        WHERE session_id = ? AND status = 'booked'`,
    )
      .bind(id)
      .run();
    return jsonResponse({ success: true, cancelled: 'session' }, 200, env);
  }

  const booking = await env.DB.prepare(
    `SELECT id, status FROM tutor_bookings WHERE session_id = ? AND student_id = ?`,
  )
    .bind(id, user.id)
    .first<{ id: number; status: string }>();
  if (!booking) return jsonResponse({ error: 'You are not booked on this session' }, 404, env);
  if (booking.status !== 'booked') {
    return jsonResponse({ error: `Your booking is already ${booking.status}` }, 409, env);
  }

  await env.DB.prepare(`UPDATE tutor_bookings SET status = 'cancelled', seat_no = ? WHERE id = ?`)
    .bind(freedSeat(booking.id), booking.id)
    .run();

  return jsonResponse({ success: true, cancelled: 'booking' }, 200, env);
}

// ---------------------------------------------------------------------------
// T4 — completion, points and ratings.
//
// THE POINTS ECONOMY, modelled against the real award rates before choosing a
// number (study.ts: POINTS_CORRECT = 10, +5 confidence bonus, so ~12.5/card):
//
//   30 cards/day of review  ≈ 375 pts/day ≈ 1,875 pts per school week
//   Tutoring at 80 pts/hour ≈  80–240 pts per week at 1–3 h
//   → tutoring lands at 4–13% of a studying student's earnings.
//
// The plan's Risks section worried tutoring would dwarf study and invert the
// Progress ranking Phase 3 deliberately built. The arithmetic says the reverse:
// 80/hour is modest — a 45-minute session is worth about five review cards. It
// is kept.
//
// Two anti-farming properties fall out of that, and both are tested:
//   * points are awarded PER SESSION, not per student — running a group of 12
//     earns the same as a 1:1, because the reward is for time given, not
//     headcount collected;
//   * a session with nobody in it awards nothing, so a tutor cannot open and
//     close empty rooms.
// Duration comes from the stored session, never from the request body.
// ---------------------------------------------------------------------------

const POINTS_PER_TUTOR_HOUR = 80;
/** Longest stretch a single session can bill for, so one row cannot mint points. */
const MAX_BILLABLE_HOURS = 3;

/** POST /api/sessions/:id/complete — tutor closes the room. Idempotent. */
export async function completeSession(sessionId: string, request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const id = Number(sessionId);
  const session = await env.DB.prepare(
    `SELECT ts.id, ts.status, ts.starts_at, ts.ends_at, ts.points_awarded,
            tp.id AS profile_id, tp.user_id AS tutor_user_id
       FROM tutor_sessions ts
       JOIN tutor_profiles tp ON tp.id = ts.tutor_profile_id
      WHERE ts.id = ?`,
  )
    .bind(id)
    .first<{
      id: number;
      status: string;
      starts_at: string;
      ends_at: string;
      points_awarded: number;
      profile_id: number;
      tutor_user_id: number;
    }>();

  if (!session) return jsonResponse({ error: 'Session not found' }, 404, env);
  if (session.tutor_user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403, env);
  if (session.status === 'cancelled') {
    return jsonResponse({ error: 'This session was cancelled' }, 409, env);
  }

  // Idempotency guard: re-calling complete must not mint a second award. The
  // already-persisted points_awarded is the record, so we return it unchanged.
  if (session.status === 'completed') {
    return jsonResponse(
      { success: true, already_completed: true, points_awarded: session.points_awarded },
      200,
      env,
    );
  }

  const attendees = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM tutor_bookings WHERE session_id = ? AND status = 'booked'`,
  )
    .bind(id)
    .first<{ c: number }>();
  const attended = Number(attendees?.c ?? 0);

  const ms = Date.parse(session.ends_at) - Date.parse(session.starts_at);
  const hours = Number.isFinite(ms) && ms > 0 ? ms / 3_600_000 : 0;
  const billable = Math.min(hours, MAX_BILLABLE_HOURS);
  // No attendees, no award — an empty room is not tutoring.
  const points = attended > 0 ? Math.round(POINTS_PER_TUTOR_HOUR * billable) : 0;

  // THIS statement is the real idempotency gate, not the status read above.
  // The read only catches a SEQUENTIAL re-call: two concurrent callers both see
  // status != 'completed' and both fall through it. The conditional UPDATE is a
  // single atomic statement, so exactly one of them flips the row — which makes
  // "did I flip it?" the only safe basis for minting points.
  const claim = await env.DB.prepare(
    `UPDATE tutor_sessions
        SET status = 'completed', points_awarded = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ? AND status != 'completed'`,
  )
    .bind(points, id)
    .run();

  // Lost the race. Another request already completed this session, so mint
  // nothing and report ITS award — the persisted value is the record, exactly
  // as the sequential guard above does. Awarding here regardless of `changes`
  // is what let ten concurrent calls pay a tutor twice.
  if ((claim.meta?.changes ?? 0) === 0) {
    const won = await env.DB.prepare(`SELECT points_awarded FROM tutor_sessions WHERE id = ?`)
      .bind(id)
      .first<{ points_awarded: number }>();
    return jsonResponse(
      { success: true, already_completed: true, points_awarded: won?.points_awarded ?? 0 },
      200,
      env,
    );
  }

  await env.DB.prepare(
    `UPDATE tutor_bookings SET status = 'attended' WHERE session_id = ? AND status = 'booked'`,
  )
    .bind(id)
    .run();

  if (points > 0) {
    await env.DB.prepare(`UPDATE users SET learning_points = learning_points + ? WHERE id = ?`)
      .bind(points, user.id)
      .run();
  }

  // session_count is recomputed from the source rows rather than incremented,
  // so it can never drift the way subjects.note_count does.
  await env.DB.prepare(
    `UPDATE tutor_profiles
        SET session_count = (
              SELECT COUNT(*) FROM tutor_sessions
               WHERE tutor_profile_id = ? AND status = 'completed'
            ),
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ?`,
  )
    .bind(session.profile_id, session.profile_id)
    .run();

  return jsonResponse(
    { success: true, points_awarded: points, attended, billable_hours: billable },
    200,
    env,
  );
}

/** POST /api/bookings/:id/rate — a student rates a session they attended. */
export async function rateBooking(bookingId: string, request: Request, env: Env) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

  const body = await parseBody(request, rateBookingSchema, env);
  if (body instanceof Response) return body;

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: 'rating must be a whole number from 1 to 5' }, 400, env);
  }
  const feedback = typeof body.feedback === 'string' ? body.feedback.slice(0, 500) : null;

  const id = Number(bookingId);
  const booking = await env.DB.prepare(
    `SELECT b.id, b.student_id, b.status, ts.status AS session_status, tp.id AS profile_id
       FROM tutor_bookings b
       JOIN tutor_sessions ts ON ts.id = b.session_id
       JOIN tutor_profiles tp ON tp.id = ts.tutor_profile_id
      WHERE b.id = ?`,
  )
    .bind(id)
    .first<{
      id: number;
      student_id: number;
      status: string;
      session_status: string;
      profile_id: number;
    }>();

  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404, env);
  // Only the student on the booking may rate it — not the tutor, not a bystander.
  if (booking.student_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403, env);
  if (booking.session_status !== 'completed') {
    return jsonResponse({ error: 'You can only rate a session after it is completed' }, 409, env);
  }
  if (booking.status !== 'attended') {
    return jsonResponse({ error: 'You did not attend this session' }, 409, env);
  }

  await env.DB.prepare(`UPDATE tutor_bookings SET rating = ?, feedback = ? WHERE id = ?`)
    .bind(rating, feedback, id)
    .run();

  // Recomputed, not incrementally averaged — re-rating cannot skew the mean.
  await env.DB.prepare(
    `UPDATE tutor_profiles
        SET rating_avg = (
              SELECT ROUND(AVG(b.rating), 2) FROM tutor_bookings b
                JOIN tutor_sessions ts ON ts.id = b.session_id
               WHERE ts.tutor_profile_id = ? AND b.rating IS NOT NULL
            ),
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ?`,
  )
    .bind(booking.profile_id, booking.profile_id)
    .run();

  const updated = await env.DB.prepare(`SELECT rating_avg FROM tutor_profiles WHERE id = ?`)
    .bind(booking.profile_id)
    .first<{ rating_avg: number }>();

  return jsonResponse({ success: true, rating, rating_avg: updated?.rating_avg ?? null }, 200, env);
}
