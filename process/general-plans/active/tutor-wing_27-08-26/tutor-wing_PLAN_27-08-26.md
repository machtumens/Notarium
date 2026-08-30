---
name: plan:tutor-wing
description: 'Tutor wing — peer/alumni tutoring: profiles, availability, 1:1 + group sessions, points-earning. The one redesign screen (2f) with no backend behind it.'
date: 27-08-26
metadata:
  node_type: memory
  type: plan
  feature: tutor-wing
  phase: n/a
---

# Tutor Wing — Implementation Plan

**Date**: 27-08-26
**Status**: **COMPLETE — T1–T4 SHIPPED 27-08-26.** Profiles, directory, group rooms, 1:1, points + ratings. Ready for archival once Q2/Q3/Q4 are closed or moved to their own plans.
The plan was written from the design brief and has NOT been through
RESEARCH → SPEC → INNOVATE → VALIDATE; T1 was built directly on user instruction.
Q5 (safeguarding) was **decided by the product owner on 27-08-26: open 1:1**.
T3 was built on that decision. See §Safeguarding Decision below for what the
implementation does and does not assume.
**Complexity**: COMPLEX — new tables, new migration, a scheduling model, a
concurrency-sensitive booking path, and an unresolved safeguarding policy question.

**Context to load before working this plan:** `process/context/all-context.md`
(router — follow its routing table to the backend and schema context files), plus
`process/development-protocols/all-development-protocols.md`.

## Overview

The "Frosty glass redesign with natural green" brief specifies seven screens. Six
were integrated because their data already existed. **Option 2f — the tutor wing —
was not**, because Notarium has no tutoring backend of any kind: no tutors, no
availability, no sessions, no bookings, no ratings, no seat counts.

This plan is what closing that gap actually costs. It is the largest single
feature in the redesign — it is the only one that needs new tables, new
endpoints, a scheduling model, and a moderation story. Everything else in the
brief was a re-skin or a re-composition of existing data.

Current state: `/campus` renders the tutor wing as a **locked** fourth slab with
`aria-label` "Tutoring is not built yet — it needs tutors, sessions and bookings
that the backend does not have." That lock is the placeholder this plan removes.

**Scope note — this plan is written, not approved.** It has not been through
RESEARCH → SPEC → INNOVATE → VALIDATE. Treat the phase split as a proposal and
the estimates as order-of-magnitude.

## Locked Product Facts (from the brief, option 2f)

These come from the design comp and are treated as requirements, not guesses:

- Tutors are **top-ranked peers and alumni from the same school** — not external.
- **Sessions are free.** "Tutors earn points, not money." There is no payment rail
  and this plan must not introduce one.
- Two session shapes: **1:1** (45-minute slots) and **group** (a room with a seat
  cap, e.g. "4 of 6 seats taken", "9 seats left").
- Tutoring **earns learning points** ("Tutoring a peer earns 80 points an hour"),
  which feed the same `learning_points` ranking the Trophy deck uses.
- Points **never buy tutoring** (stated explicitly in the brief's Assumptions).
- Tutors carry a rating (`4.9★`), a session count (`62 sessions`), a grade range
  (`Grade 11–12`), languages, and a short blurb.
- Eligibility is signalled by rank: "You are rank 4 in Grade 11 Physics."

## Non-Goals

- Payments, invoicing, or any money movement.
- Video/voice calling. Sessions carry a location or link field; Notarium does not
  become a conferencing product.
- External (non-school) tutors.
- Automated tutor-student matching. v1 is browse-and-book.

## Open Questions (must be answered before EXECUTE)

1. ~~**Who may become a tutor?**~~ **Resolved conservatively for T1**: a student
   may APPLY at ≥100 learning points AND ≥1 published note, and a **moderator
   must approve** — nothing self-grants. Chosen over rank-gating because it is
   reversible, needs no ranking snapshot, and keeps a human in the loop on a
   surface where students meet students. Revisit if approval becomes a bottleneck.
2. **Alumni identity.** `users.graduated` exists but there is no alumni auth path.
   Do graduated accounts keep logging in, and does the school-domain allow-list
   (`@sekolahkristencalvin.org`) still apply to them?
3. **Timezone handling.** Every timestamp in the app is `datetime('now')` UTC with
   no user timezone. Scheduling makes that a correctness problem, not a cosmetic one.
4. **Cancellation and no-show policy.** Does a no-show cost points? Who can cancel
   how late? This shapes the state machine below.
5. ~~**Safeguarding.**~~ **DECIDED 27-08-26 by the product owner: 1:1 is open.**
   The decision is recorded here because it is a product/legal call, not an
   engineering one — see §Safeguarding Decision.

Group rooms shipped first regardless (T2 before T3), which was the right order:
it proved the seat-race machinery on the lower-risk surface before 1:1 used it.

## Safeguarding Decision

The product owner decided on **27-08-26** to open 1:1 tutoring. That is their call
to make. Two properties were built into T3 so the decision stays _reviewable_
rather than becoming invisible in the data:

1. **A 1:1 is not a special or hidden record.** It is an ordinary `tutor_sessions`
   row with `seat_cap = 1`, appearing in the same `GET /api/sessions` listing as
   group rooms. There is a test asserting it is never filtered out. Anything that
   can audit group sessions can audit 1:1 sessions with no extra work.
2. **`location` is REQUIRED for 1:1** (rejected with 400 otherwise), and the
   duration is bounded to 15–90 minutes. Every private session therefore records
   who, with whom, when, for how long, and where.

Neither of these is a safeguarding _policy_ — none is written. They are the
cheapest engineering choices that keep one possible later, and they cost nothing
if no policy ever arrives. A moderator-facing view over `tutor_sessions` remains
a small follow-up, not a blocker.

## Proposed Schema

New tables. All follow the existing conventions in `backend/schema.sql`:
`INTEGER PRIMARY KEY AUTOINCREMENT`, `datetime('now')` defaults, and
`CREATE TABLE IF NOT EXISTS`.

```sql
-- A user who has opted in to tutoring. One row per user per subject.
CREATE TABLE IF NOT EXISTS tutor_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  blurb TEXT,
  grade_min INTEGER,
  grade_max INTEGER,
  languages TEXT,                    -- comma-separated, matching notes.tags
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | active | paused | revoked
  approved_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, subject_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- Repeating or one-off windows a tutor offers.
CREATE TABLE IF NOT EXISTS tutor_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tutor_profile_id INTEGER NOT NULL,
  starts_at TEXT NOT NULL,           -- ISO-8601 UTC
  ends_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'one_to_one',  -- one_to_one | group
  seat_cap INTEGER,                  -- NULL for 1:1; >1 for group rooms
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tutor_profile_id) REFERENCES tutor_profiles(id)
);

-- A concrete session. Group sessions have many bookings, 1:1 has one.
CREATE TABLE IF NOT EXISTS tutor_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tutor_profile_id INTEGER NOT NULL,
  availability_id INTEGER,
  subject_id INTEGER NOT NULL,
  topic TEXT,
  kind TEXT NOT NULL DEFAULT 'one_to_one',
  seat_cap INTEGER,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  location TEXT,                     -- room name or meeting link; no calling built in
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled | no_show
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tutor_profile_id) REFERENCES tutor_profiles(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

CREATE TABLE IF NOT EXISTS tutor_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked',    -- booked | attended | cancelled | no_show
  rating INTEGER,                    -- 1..5, set after the session
  feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, student_id),   -- a student cannot double-book one session
  FOREIGN KEY (session_id) REFERENCES tutor_sessions(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tutor_profiles_subject ON tutor_profiles(subject_id, status);
CREATE INDEX IF NOT EXISTS idx_tutor_sessions_start ON tutor_sessions(starts_at, status);
CREATE INDEX IF NOT EXISTS idx_tutor_bookings_student ON tutor_bookings(student_id, status);
```

**Migration:** one new file, next in sequence after `0016_study_items_note_scoped_dedup.sql`.
Add the same statements to `backend/schema.sql` so fresh deploys match — the
`encrypted_yw_id` incident (schema.sql drifting from the migrations and breaking
signup on fresh databases) is exactly the failure this plan must not repeat.

### Rating denormalisation

The brief shows `4.9★` and `62 sessions` on every card. Computing those with an
aggregate per card is an N+1 waiting to happen on a list screen. Store
`rating_avg` and `session_count` on `tutor_profiles` and update them when a
booking is rated. Precedent exists: `subjects.note_count` is already denormalised
this way — including its failure mode, which is that direct writes leave it stale.
Whatever updates a rating must update both, in the same statement.

## Proposed Endpoints

Backend is a flat `if (path === ...)` handler in `backend/src/index.ts`; new
routes go in a new `backend/src/routes/tutors.ts` and are wired there. All use
`requireUser` + `checkRateLimit`, matching `/api/ai/quiz` and `/api/ai/primer`.

| Method | Path                            | Purpose                                                       |
| ------ | ------------------------------- | ------------------------------------------------------------- |
| GET    | `/api/tutors`                   | Browse. Filters: `subject_id`, `kind`, `alumni_only`, `week`. |
| GET    | `/api/tutors/:id`               | One tutor profile + upcoming sessions.                        |
| POST   | `/api/tutors/apply`             | Opt in as a tutor for a subject → `status: pending`.          |
| PATCH  | `/api/tutors/:id`               | Edit own blurb / grade range / pause.                         |
| POST   | `/api/tutors/:id/availability`  | Add a window.                                                 |
| DELETE | `/api/tutors/availability/:id`  | Remove a window.                                              |
| GET    | `/api/sessions`                 | The caller's sessions, as tutor and as student.               |
| POST   | `/api/sessions`                 | Tutor opens a group room or confirms a 1:1.                   |
| POST   | `/api/sessions/:id/book`        | Student books / joins. Seat-capped.                           |
| POST   | `/api/sessions/:id/cancel`      | Either party cancels.                                         |
| POST   | `/api/sessions/:id/complete`    | Tutor marks done → awards points.                             |
| POST   | `/api/bookings/:id/rate`        | Student rates after attending.                                |
| GET    | `/api/tutors/eligibility`       | Am I allowed to become a tutor, and why/why not.              |
| POST   | `/api/admin/tutors/:id/approve` | Moderator approves/revokes.                                   |

### The one genuinely hard endpoint

`POST /api/sessions/:id/book` must not oversell a group room. D1 has no
`SELECT ... FOR UPDATE`. Two students hitting the last seat concurrently will
both read `seats_taken = 5` of 6 and both insert.

Two workable options:

- **(a) Constraint-first.** Add a monotonic `seat_no` to `tutor_bookings` with
  `UNIQUE (session_id, seat_no)` and derive the seat number from a counter, so
  the database rejects the loser. Cheap, no new infrastructure.
- **(b) Durable Object.** Serialise bookings per session through a DO, the same
  way `RateLimiter` already serialises rate-limit counters in `wrangler.toml`.
  Precedent exists in-repo; heavier.

**Recommendation: (a).** It solves the actual race with a database constraint and
adds no runtime surface. Reach for (b) only if booking grows side effects beyond
a single insert.

## Frontend

New page `src/pages/TutorWingPage.tsx` at `/tutors`, in the AppShell layout.
Components under `src/components/tutors/`.

Follows the Frosted Canopy system already in place:

- **Moss `#63a37f`** is the tutor colour — the brief assigns it ("Tutor wing — 1e in moss").
- Tutor cards are panel glass (white 55%, `blur(26px) saturate(1.3)`, 16px).
- Actions are 999px pills: "Join group" and "Book 1:1" primary pine; "Become a
  tutor" uses the **honey** pill, since it is a you-action.
- Avatar monograms (`YH`, `KS`, `NA`) reuse the pine→moss gradient already used
  for user avatars in `AppShell`.

**Unlock the campus slab:** remove `locked: true` and `lockedReason` from the
`tutor` wing in `src/pages/CampusPage.tsx` and point `onEnter` at `/tutors`.
Add a **Tutors** tab to `AppShell`'s `ExpandableTabs` — note that nav routes by
**array index**, so the `tabs` array and the `paths` array must be edited together
or every tab after the insertion point misroutes.

## Phasing

| Phase                         | Scope                                                                                                                                                                                                                                   | Depends on                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| ~~**T1 — Profiles**~~         | **DONE 27-08-26.** Migration `0018_tutor_wing.sql` (all four tables, mirrored into `schema.sql`), `backend/src/routes/tutors.ts`, `src/pages/TutorWingPage.tsx` at `/tutors`, campus slab unlocked.                                     | Q1 resolved conservatively |
| ~~**T2 — Group rooms**~~      | **DONE 27-08-26.** Availability CRUD, `POST /api/sessions`, seat-capped `book`, `cancel`. 15 tests incl. the seat race — **mutation-tested**: disabling the capacity guard fails 2 of them.                                             | T1                         |
| **T3 — 1:1**                  | 1:1 slots, the 45-minute booking flow.                                                                                                                                                                                                  | T1, **Q5 (safeguarding)**  |
| ~~**T4 — Points + ratings**~~ | **DONE 27-08-26.** `POST /api/sessions/:id/complete` (idempotent, 80 pts/hour, ≤3 billable hours), `POST /api/bookings/:id/rate`, recomputed `rating_avg`/`session_count`. "Helped 5" badge is now earnable. 12 tests, mutation-tested. | —                          |

T2 before T3 deliberately: group rooms carry a materially lower safeguarding risk,
so they can ship while Q5 is still being answered.

## Test Plan

The red-team suite is the house pattern; tutoring introduces a new authorisation
surface and must be covered there, not only by unit tests.

- **IDOR**: a student cannot read another student's bookings; a tutor cannot edit
  another tutor's profile or availability. Mirrors `G-idor.test.ts`.
- **Seat race**: fire N concurrent bookings at an N−1 seat room; assert exactly
  N−1 succeed. Mirrors `concurrency.test.ts`.
- **Points integrity**: completing a session awards points exactly once;
  re-calling `complete` is idempotent. This guards the ranking that the whole
  Trophy deck rests on.
- **Rate limiting**: booking and apply endpoints are limited. Mirrors `D-ratelimit.test.ts`.
- **State machine**: cancelled sessions cannot be booked, completed sessions
  cannot be cancelled, a student cannot rate a session they did not attend.
- **Eligibility**: a user below the rank/points bar cannot self-approve as tutor.

## Risks

- **Safeguarding is the real blocker**, not the schema. Minors arranging 1:1
  sessions through a school product needs a policy answer first.
- **Timezones.** The app stores naive UTC. Scheduling exposes that immediately.
- ~~**Points inflation.**~~ **MODELLED 27-08-26 — the concern was wrong, and the
  rate is kept.** Grounded in the real constants (`study.ts`: `POINTS_CORRECT = 10`
  plus a 5-point confidence bonus, so ~12.5/card):

  |                                | per week   |
  | ------------------------------ | ---------- |
  | Review at 30 cards/day         | ~1,875 pts |
  | Tutoring at 80 pts/hour, 1–3 h | 80–240 pts |

  Tutoring lands at **4–13%** of a studying student's earnings; a 45-minute
  session is worth about five review cards. It cannot invert the ranking. What
  the modelling _did_ surface were two farming routes, both now closed and
  tested: points are awarded **per session, not per student** (a group of 12
  earns the same as a 1:1, because the reward is for time given), and **an empty
  room awards nothing**. Duration is read from the stored session, never the
  request body, and is capped at 3 billable hours.

- **Empty-market cold start.** A tutor directory with no tutors reads as broken.
  T1 should ship with an explicit empty state, not an empty grid.

## Acceptance Criteria

A phase is acceptable when all of the following hold:

1. A student can find a tutor for a subject they study, and the list is filtered
   to tutors whose `grade_min..grade_max` covers that student's grade.
2. A tutor can publish availability and open a group room with a seat cap.
3. Booking a full room fails cleanly with a seat-taken message — never an
   overbooked room, under concurrent load.
4. Completing a session awards `learning_points` exactly once; a repeated
   `complete` call is a no-op.
5. No student can read or mutate another student's bookings, and no tutor can
   mutate another tutor's profile or availability.
6. The campus tutor slab is unlocked and routes to `/tutors`; the AppShell nav
   gains a Tutors entry that routes correctly.
7. All gates green: `npx tsc --noEmit` (root and `backend/`), `npx eslint src`
   with 0 errors, `npx vitest run` in both packages, `npx vite build`.

## Phase Completion Rules

- A phase is complete only when its acceptance criteria above are met AND the
  red-team tests named in the Test Plan for that phase are written and passing.
- T3 (1:1) MUST NOT be marked complete while Open Question 5 (safeguarding) is
  unanswered. An unanswered Q5 is a BLOCKED condition, not a known-gap.
- Any schema change must land in BOTH the numbered migration and
  `backend/schema.sql` in the same commit. A phase where those two disagree is
  not complete regardless of green tests — this is the `encrypted_yw_id` failure
  mode, where schema.sql drifted from the migrations and broke signup on every
  fresh database while all existing tests stayed green.
- Points awards (T4) require the inflation modelling in Risks to be done first;
  shipping awards without it is not complete.

## Implementation Checklist

### T1 — Profiles

- [ ] Write migration `0017_tutor_wing.sql` with the five tables + three indexes.
- [ ] Mirror the same DDL into `backend/schema.sql`.
- [ ] `backend/src/routes/tutors.ts`: `GET /api/tutors`, `GET /api/tutors/:id`,
      `POST /api/tutors/apply`, `PATCH /api/tutors/:id`,
      `GET /api/tutors/eligibility`.
- [ ] Wire the `if (path === ...)` blocks in `backend/src/index.ts`, each behind
      `requireUser` + `checkRateLimit`.
- [ ] `POST /api/admin/tutors/:id/approve` behind the existing moderator guard.
- [ ] `src/pages/TutorWingPage.tsx` + `src/components/tutors/*`, route `/tutors`.
- [ ] Unlock the campus slab in `src/pages/CampusPage.tsx`; add the Tutors tab to
      `AppShell` (edit the `tabs` AND `paths` arrays together).
- [ ] Empty state for a directory with no approved tutors.
- [ ] Tests: IDOR, eligibility, rate limiting.

### T2 — Group rooms

- [ ] Availability CRUD endpoints.
- [ ] `POST /api/sessions`, `POST /api/sessions/:id/book`, `/cancel`.
- [ ] Seat race fix: `seat_no` + `UNIQUE (session_id, seat_no)`.
- [ ] Tests: seat race under concurrency, state machine, cancel rules.

### T3 — 1:1 _(blocked on Q5)_

- [ ] 45-minute slot model and booking flow.
- [ ] Tests: double-book prevention, cancellation windows.

### T4 — Points + ratings

- [ ] `POST /api/sessions/:id/complete` — idempotent points award.
- [ ] `POST /api/bookings/:id/rate`; update `rating_avg` + `session_count` in the
      same statement.
- [ ] Surface tutoring points on the Trophy deck / `/progress`.
- [ ] Tests: award idempotency, rating authorisation, denormalisation accuracy.

## Touchpoints

**New files**

- `backend/migrations/0017_tutor_wing.sql`
- `backend/src/routes/tutors.ts`
- `src/pages/TutorWingPage.tsx`
- `src/components/tutors/*`
- `backend/test/red-team/tutor-wing.test.ts`

**Modified files**

- `backend/schema.sql` — five tables + indexes
- `backend/src/index.ts` — route registrations
- `backend/src/lib/env.ts` — types if new bindings appear
- `src/app/AppRoutes.tsx`, `src/app/lazyPages.ts` — `/tutors` route
- `src/components/AppShell.tsx` — Tutors nav entry (index-coupled arrays)
- `src/pages/CampusPage.tsx` — unlock the tutor slab
- `src/lib/api.ts` — tutor/session/booking client methods
- `src/types/index.ts` — shared types

## Public Contracts

- **New:** every endpoint in the Proposed Endpoints table. All are additive; no
  existing endpoint changes shape.
- **Unchanged:** `/api/study/*`, `/api/reviews/*`, `/api/ai/*`, `/api/notes/*`
  keep their current contracts.
- **Behavioural change:** `users.learning_points` gains a second write source
  (tutoring, T4) alongside SM-2 reviews. Anything reading that column — the
  leaderboard ordering, `getStudyStats`, `ProfileStats` — inherits the change
  without a schema change. This is the highest-blast-radius item in the plan.

## Blast Radius

- **Database:** five new tables. No existing table is altered. `users` is read
  for identity and written only via `learning_points` in T4.
- **Backend:** one new route module; `index.ts` grows route blocks. No existing
  handler is modified before T4.
- **Frontend:** one new route and page; `AppShell` nav and `CampusPage` each get a
  small edit. No existing page's behaviour changes.
- **Ranking:** T4 changes what `learning_points` means. Phase 3 deliberately made
  Progress rank on study effort; tutoring awards dilute that unless modelled.
- **Not touched:** auth, OCR/AI pipeline, notes, SRS scheduling, billing (none
  exists), admin surfaces other than the approve endpoint.

## Testing Context

Test runner: `vitest` in both packages (`npx vitest run` at root and in
`backend/`). Backend tests run under `@cloudflare/vitest-pool-workers` with
miniflare bindings from `backend/vitest.config.ts`; AI keys are deliberately
absent so provider calls hit their not-configured fallbacks.

Post-phase testing is not optional: every phase above ends with a red-team test
file, and the EVL confirmation run must be performed by a spawned `vc-tester`,
re-running the validate-contract gate commands — the execute agent's own green
report does not substitute for it.

**Known trap:** `npx vitest run | tail` returns _tail's_ exit status, so a crashed
runner reads as green. Capture the runner's own exit code in any gate command.

## Validate Contract

**NOT WRITTEN — VALIDATE has not run for this plan.**

This section is a placeholder and must be treated as such: per
`process/development-protocols/orchestration.md` §VALIDATE Gate, a placeholder
validate-contract is not a completed validate, and routing to EXECUTE on it is a
protocol violation. `vc-validate-agent` writes the real V1–V7 contract here.

Before VALIDATE can produce a PASS, Open Questions 1, 2 and 5 need answers. Q5
(safeguarding) in particular is a product/legal decision that no amount of
engineering validation can substitute for.

## Resume and Execution Handoff

**Next instruction for execution:** all four phases are shipped. The remaining
work is the open questions, not the plan:

- **Q3 (timezones) is now the highest-value item.** The app stores naive UTC with
  no user timezone. 1:1 slots are wall-clock appointments between two named
  people, so a mismatch means someone waits in an empty room. This deserves its
  own plan.
- Q2 (alumni auth) and Q4 (cancellation / no-show policy) remain open.
- A moderator-facing view over `tutor_sessions` is a small follow-up — the data
  is already there and already un-hidden (see §Safeguarding Decision).

Before T4, model the points numbers — the plan's own Risks section flags that
tutoring at 80 pts/hour against reviews at 5–10 pts/card could invert the
Progress ranking Phase 3 deliberately built.

Resume state (27-08-26):

- **T1 SHIPPED.** All four tables exist (migration 0018, mirrored in schema.sql).
  Live endpoints: `GET /api/tutors`, `GET /api/tutors/eligibility`,
  `POST /api/tutors/apply`, `POST /api/admin/tutors/:id/approve`.
- **T2 SHIPPED.** `POST /api/tutors/:id/availability`, `DELETE /api/tutors/availability/:id`,
  `GET|POST /api/sessions`, `POST /api/sessions/:id/book`, `POST /api/sessions/:id/cancel`.
  Capacity is enforced by `UNIQUE (session_id, seat_no)` + a bounded retry loop,
  NOT by check-then-insert. **Cancelling parks the booking on `seat_no = -id`**,
  which preserves history while releasing the positive chair for reuse — without
  that, a cancelled seat stayed permanently occupied in the UNIQUE index.
  `POST /api/sessions` refuses `kind: 'one_to_one'` outright.
- `/tutors` renders the directory; the campus tutor slab is UNLOCKED and routes
  there. The card deliberately shows "Booking opens once session scheduling
  ships" instead of a dead Book button.
- Verified: pending profiles never appear in the public directory, duplicate
  applications 409, students cannot self-approve (403), unauthenticated 401, and
  the directory response contains no email addresses.
- **T3 SHIPPED.** `POST /api/sessions` accepts `kind: 'one_to_one'` → forces
  `seat_cap = 1`, requires `location`, bounds duration to 15–90 min. Booking and
  cancelling reuse the T2 seat machinery unchanged — a 1:1 is just a one-chair
  room, which is why no new race handling was needed.
- **T4 SHIPPED.** `POST /api/sessions/:id/complete` — idempotent via the
  `points_awarded` column + a `status != 'completed'` guard on the UPDATE;
  verified live at 60 pts for a 45-min session, and unchanged on a repeat call.
  `POST /api/bookings/:id/rate` — only the booking's own student, only after the
  session is completed and they attended. `rating_avg` and `session_count` are
  **recomputed from source rows**, never incremented, so re-rating cannot skew
  the mean and the counters cannot drift the way `subjects.note_count` does.
- The **"Helped 5" badge is now earnable** — counted as DISTINCT students with
  attended bookings on the tutor's completed sessions.
- Still open: Q2 (alumni auth), Q3 (timezones — now the top item), Q4
  (cancellation/no-show policy).

## Verification Evidence

To be filled by EXECUTE. At minimum: migration applied locally and on a fresh
`schema.sql` build, the seat-race test green, and a browser pass on `/tutors`
plus the unlocked campus slab.

## Next Step

**The tutor wing is complete. Next: open a separate plan for timezone handling
(Q3)** — it is now the largest correctness gap, and it affects the SRS due-date
logic as well as tutoring appointments.

## Addendum — concurrent-complete double-mint (found and fixed 28-08-26)

T4 shipped with a race that could pay a tutor twice for one session. Surfaced as
an intermittent failure of `tutor-wing.test.ts` "ten concurrent complete calls
still award exactly one session" — **4 failures in 38 runs (~10%)** before it was
diagnosed.

**Cause.** `completeSession` had two guards and neither covered the concurrent
case:

1. The status read (`if (session.status === 'completed') return already_completed`)
   only catches a SEQUENTIAL re-call. Two concurrent callers both read
   `status != 'completed'` and both fall through it.
2. The conditional `UPDATE tutor_sessions ... WHERE id = ? AND status != 'completed'`
   IS correctly atomic — exactly one caller flips the row.

But the code never asked whether that UPDATE matched anything, then ran
`UPDATE users SET learning_points = learning_points + ?` **unconditionally**.
Both callers awarded.

**Fix.** The award is now gated on the claim actually landing
(`claim.meta?.changes > 0`); a caller that loses the race re-reads and returns
`already_completed` with the winner's persisted `points_awarded`, minting
nothing. `meta.changes` was already the idiom here — `subjects.ts` and `ops.ts`
use it.

Because the UPDATE is a single atomic statement, SQLite guarantees exactly one
winner, so at most one award is now possible for any interleaving. That is a
structural guarantee, not a probabilistic one.

**The old test was a weak guard, and the reason is worth keeping.** Asserting on
the POINTS TOTAL misses most double-mints: the second winner runs after the
bookings were flipped `booked -> attended`, so it usually computes `attended = 0`
-> `points = 0` and adds nothing. The row was corrupted (two callers each believed
they closed the session) but the total looked right.

The test now asserts the invariant one level below the symptom — **exactly one
caller may be the winner** — across 6 independent sessions of 12 concurrent
calls each.

|                                         | detection rate              |
| --------------------------------------- | --------------------------- |
| old test (points total, 1 round of 10)  | ~10% (4 fails / 38 runs)    |
| new test (winner count, 6 rounds of 12) | **50% (5 fails / 10 runs)** |
| new test against the FIX                | **0 fails / 16 runs**       |

At a 50% detection rate, sixteen consecutive passes is ~0.0015% by chance.

Audited the rest of the file while there: `learning_points` is incremented in
exactly one place (now gated) and there is exactly one conditional UPDATE whose
result mattered (now checked). `session_count` is recomputed from source rows
rather than incremented, so it cannot drift.
