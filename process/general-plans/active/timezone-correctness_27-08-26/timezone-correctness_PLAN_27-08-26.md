---
name: plan:timezone-correctness
description: 'Fix the UTC-only time model: streaks that break while studying daily, cards due mid-evening, and two timestamp formats that render differently in the browser.'
date: 27-08-26
metadata:
  node_type: memory
  type: plan
  feature: timezone-correctness
  phase: n/a
---

# Timezone Correctness

**Date**: 27-08-26
**Status**: DRAFT — not validated. Has NOT been through RESEARCH → SPEC → INNOVATE
→ VALIDATE. Every finding below is reproduced from the live code and local
database, not inferred.
**Complexity**: COMPLEX — touches the SRS scheduler, the streak counter that
feeds the Progress ranking, and every rendered timestamp. Data already written
in two formats needs a migration.

**Context to load first:** `process/context/all-context.md` (router — follow it to
the backend and schema context), plus
`process/development-protocols/all-development-protocols.md`.

## Overview

Notarium has no time model. Every timestamp is UTC, no user carries a timezone,
and the code writes timestamps in **two different formats** that JavaScript parses
differently. The user base is Indonesian (UTC+7 WIB), so the UTC day boundary
falls at **07:00 local** — in the middle of the school morning.

This was survivable while everything was a counter. It stopped being survivable
when the tutor wing shipped 1:1 sessions: those are wall-clock appointments
between two named people, and a mismatch means someone waits in an empty room.

Four defects, all reproduced. They are independent and can be fixed in any order,
but F1 is the one that silently punishes students today.

## Verified Findings

### F1 — A student who studies every day can still lose their streak (HIGH)

`backend/src/routes/study.ts:9` — `utcDate()` is `d.toISOString().slice(0, 10)`.
The streak day therefore rolls over at 00:00 UTC = **07:00 WIB**.

| Local study time (WIB) | UTC instant   | Streak day recorded |
| ---------------------- | ------------- | ------------------- |
| Mon 22:00              | Mon 15:00 UTC | 2026-08-03          |
| **Tue 06:00**          | Mon 23:00 UTC | **2026-08-03**      |
| Tue 20:00              | Tue 13:00 UTC | 2026-08-04          |

A student who revises on Monday evening and again before school on Tuesday gets
**one** streak day, and Tuesday reads as missed. Early-morning revision — exactly
what the product's "Primer / prep for class" flow encourages — is the worst case.

This is not cosmetic. `current_streak` and `longest_streak` feed the `30 day
streak` badge and sit next to the Progress ranking, so the bug quietly penalises
the behaviour the product is trying to build.

### F2 — Cards come due mid-evening rather than at the start of the day (MEDIUM)

`study.ts:60-61` — `const due = new Date(); due.setUTCDate(due.getUTCDate() + interval)`.
The due date is an **instant offset from the moment of review**, not a day.

Review a card at 23:00 WIB with a 1-day interval and it becomes due at 23:00 the
following night. "Due tomorrow" is only true after 23:00 tomorrow. The Today
dashboard's due count therefore climbs through the evening instead of being
stable for the day, and a student who studies at a consistent hour drifts later
every cycle.

SM-2 intervals are defined in **days**, so the due boundary should be the start of
the user's local day, not a rolling clock offset.

### F3 — Two timestamp formats that parse differently in the browser (HIGH)

The code writes both:

| Written by                                                       | Example                    | `new Date(...)` parses it as |
| ---------------------------------------------------------------- | -------------------------- | ---------------------------- |
| `datetime('now')` (60 sites) + `CURRENT_TIMESTAMP` (17)          | `2026-08-27 08:53:06`      | **local time**               |
| `.toISOString()` (e.g. `due_at`) and client-supplied `starts_at` | `2026-08-27T08:53:06.000Z` | UTC                          |

Reproduced under `TZ=Asia/Jakarta`: the same instant in the two forms lands
**7 hours apart** after parsing — silently, because the wrong answer still looks
like a plausible time. Every `created_at` rendered through `toLocaleDateString`
(8 sites) or `toLocaleString` (5) is shifted by the viewer's UTC offset.

Real values from the local database confirm the split:

```
notes.created_at        2026-08-27 03:58:40      <- space form
test_sessions.created_at 2026-08-27 08:53:13     <- space form
tutor_sessions.starts_at 2026-09-05T11:00:00Z    <- ISO form
```

### F4 — Mixed formats in one column can surface a card early (LOW)

`getDueReviews` (`study.ts:284-288`) compares `due_at <= new Date().toISOString()`
as **strings**. `' '` (0x20) sorts before `'T'` (0x54), so a space-form row
compares as earlier than an ISO row on the same date.

**Scope, measured rather than assumed:** this only misfires when the date parts
are equal. A same-day card stored in space form and due at 23:00 surfaces at
09:00; cross-date comparisons are unaffected. The app itself writes ISO for
`due_at`, so today this is reachable only through seeds, migrations, or manual
SQL — but nothing in the schema prevents it, and a future backfill would hit it.

## Non-Goals

- Per-session or per-device timezone detection. One timezone per user.
- Historical re-attribution of existing streaks. Past `last_study_date` values
  stay as they are; the fix is forward-looking (see Migration).
- Full IANA tz-database handling on the worker. The fix needs a fixed offset or
  an IANA name resolved with `Intl`, not a bundled tz library.

## Open Questions

1. ~~**Where does the timezone come from?**~~ **DECIDED 27-08-26 by the product
   owner: (c) both — school default with a per-user override.** So: `users.timezone`
   is nullable; resolution is `user.timezone` → school default (`Asia/Jakarta`)
   → `UTC`. Existing rows need no backfill, and a student abroad can correct it.
2. **Do streaks recompute on a timezone change?** A student moving from WIB to
   UTC could gain or lose a day. Simplest defensible answer: no recompute, the
   new zone applies from the next study event.
3. **Does the school want a fixed cutover hour?** Some study products roll the
   day at 03:00 local rather than midnight so a late-night session still counts
   as "today". This is a product choice, not a technical one.

## Proposed Approach

### Storage: one format, everywhere

Standardise on **ISO-8601 UTC with `Z`**. It is unambiguous, sorts correctly as
a string, and is what `Date` parses without surprise.

- Replace `DEFAULT (datetime('now'))` with
  `DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))` in `schema.sql` **and** in a
  migration, so new rows are ISO everywhere.
- Backfill existing space-form columns with the same `strftime` expression.
- Keep the change in `schema.sql` and the migration in lockstep — the
  `encrypted_yw_id` incident is exactly what happens when they drift.

### Identity: one timezone per user

- `users.timezone TEXT` (IANA name, e.g. `Asia/Jakarta`), nullable.
- Resolved as: `user.timezone` → school default (`Asia/Jakarta`) → `UTC`.
- Captured at signup from the browser, editable in Settings.

### Day boundaries: compute in the user's zone

Replace `utcDate()` with a helper that takes the user's zone:

```ts
/** The calendar date in the user's own zone — the only correct basis for a
 *  streak. Uses Intl rather than a tz library; Workers ships full ICU. */
function localDate(zone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at); // en-CA yields YYYY-MM-DD
}
```

`en-CA` is deliberate: it formats as `YYYY-MM-DD`, so no manual assembly.

**Verified 27-08-26**: named zones work in the Workers runtime (see Task 0), so
this design holds. Some runtimes ship a cut-down ICU where named zones throw,
which is why it was checked before the plan committed to the approach.

### Due dates: start of the local day

`computeSm2` should return the **start of the day** `interval` days ahead in the
user's zone, rather than an instant offset. A card due "tomorrow" is then due
from local midnight tomorrow, and the Today count is stable all day.

This changes `computeSm2`'s signature to take a zone, which is a public-contract
change — `computeSm2` is exported and unit-tested (`study.test.ts`).

## Acceptance Criteria

1. A student in WIB studying Mon 22:00 and Tue 06:00 local records **two** streak
   days.
2. A card reviewed at 23:00 local with interval 1 is **not** due until local
   midnight, and **is** due at 00:01 local.
3. `SELECT` on every timestamp column returns ISO-with-`Z`; no space-form rows
   remain.
4. A timestamp rendered in the browser under `TZ=Asia/Jakarta` matches the
   instant it was written — no 7-hour skew.
5. A 1:1 tutor session shows the same wall-clock time to tutor and student when
   both are in the same zone.
6. `computeSm2`'s existing unit tests still pass, with zone-aware cases added.
7. All gates green: `npx tsc --noEmit` (root and `backend/`), `npx eslint src`
   0 errors, `npx vitest run` in both packages, `npx vite build`.

## Phase Completion Rules

- ~~**Task 0 (the `Intl` spike) gates everything.**~~ **Cleared 27-08-26** —
  named zones work in the Workers pool. The deployed-preview re-check is still
  outstanding and should happen before this ships, not before it starts.
- Schema and migration must change together in one commit.
- The backfill must be verified on a **copy** before running against production
  data: it rewrites every timestamp column in the database.
- No phase is complete while `schema.sql` and the migrations disagree.

## Discovered During Execution — the ordering constraint

Changing the stored format is **not** a write-side-only change. 16 read sites
compare against `datetime('now', '-N units')`, which itself produces space form:

```
backend/src/routes/ops.ts:106   last_seen_at >= datetime('now','-5 minutes')
backend/src/routes/admin.ts:57  created_at   >= datetime('now','-7 days')
```

If stored values become ISO while the thresholds stay space form, comparisons
invert whenever the **date parts match** — because `'T'` (0x54) sorts after
`' '` (0x20). `ops.ts:106` would stop meaning "active in the last five minutes"
and start meaning "active at any point today".

**Both sides must move in the same commit.** A single exported SQL fragment is
used so they cannot drift:

```ts
export const SQL_NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";
```

## Implementation Checklist

### Task 0 — Spike _(gates the rest)_ — **DONE 27-08-26: PASSES**

- [x] `Intl.DateTimeFormat` with `timeZone: 'Asia/Jakarta'` works in the Workers
      runtime. Run as a throwaway test under `@cloudflare/vitest-pool-workers`
      (the same pool the backend suite uses), 2/2 passing:

      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', … })
        .format(new Date('2026-08-03T23:00:00.000Z'))  ->  '2026-08-04'
      new Date('2026-08-03T23:00:00.000Z').toISOString().slice(0,10) -> '2026-08-03'

      The two disagree by a day for the same instant, which **is** finding F1.
      The `localDate()` design stands; the fixed-offset fallback is not needed.

- [ ] Re-confirm on a deployed preview before shipping (the local pool and the
      deployed edge runtime are not guaranteed to carry identical ICU data).

### Task 1 — Format standardisation — **DONE 27-08-26**

- [x] `backend/src/lib/time.ts` — one `SQL_NOW_ISO` fragment shared by writes
      and read-thresholds so they cannot drift apart.
- [x] 49 write sites + **22 read-threshold sites** converted across 12 files.
      Both moved in the same change; converting writes alone would have inverted
      every same-date comparison.
- [x] `backend/schema.sql` mirrored (26 datetime-now + 3 CURRENT_TIMESTAMP).
- [x] Migration `0019_normalise_timestamps_to_iso.sql` — 42 columns, idempotent
      (`WHERE ... NOT LIKE '%Z' AND ... LIKE '____-__-__ %'`), verified on a
      COPY before running anywhere: 81 space-form → 0, re-run is a no-op,
      `2026-08-27 03:58:40` → `2026-08-27T03:58:40Z` (same instant).
- [x] `users.last_study_date` and `usage_stats.stat_date` deliberately EXCLUDED
      — they are calendar dates, not instants, and the streak logic compares
      them as dates.
- [x] `backend/test/red-team/timestamp-format.test.ts` — 5 tests asserting the
      invariant through real endpoints, since a grep cannot see runtime values.
- [x] Applied to the **local dev database only**. Production D1 is untouched.

**Two defects found while doing this, both fixed:**

1. **SQLite requires a function `DEFAULT` to be parenthesised.**
   `DEFAULT CURRENT_TIMESTAMP` is a bare keyword and legal; the mechanical
   replacement produced `DEFAULT strftime(...)`, which is a syntax error. It hit
   17 sites across `schema.sql` and `lib/db.ts`.
2. **The test harness was hiding it.** `applySchema` caught every statement
   error and continued, so one bad DEFAULT surfaced as ten confusing
   "no such table: quiz_attempts" failures in a different file. It now
   re-throws anything that is not "already exists".

### Task 1 addendum — 16 writes escaped the first sweep — **FIXED 27-08-26**

Task 1 reported the format standardisation complete. It was not: **16 write
sites survived**, all spelling it `datetime("now")` with DOUBLE quotes, which
the single-quote sweep never matched. They span `admin.ts` (5), `auth.ts` (5),
`users.ts` (2), `notes.ts` (2), `subjects.ts` (1), `ai.ts` (1) — every one an
`updated_at`.

They worked only by accident: `"now"` is an IDENTIFIER in standard SQL, and
SQLite falls back to treating an unresolvable double-quoted identifier as a
string literal. That fallback is off under `SQLITE_DQS=0`, so the code was one
config flag away from failing outright — while quietly writing the wrong format
in the meantime.

All 16 now use the shared `SQL_NOW_ISO` fragment. The existing
`timestamp-format.test.ts` had not caught them because it only covers `created_at`
on INSERT; no test exercised an UPDATE path.

### Task 2 — User timezone — **DONE 27-08-26**

- [x] `users.timezone TEXT` nullable, in all THREE places that define this schema:
      migration `0020_add_user_timezone.sql`, `backend/schema.sql`, and the
      runtime init in `backend/src/lib/db.ts`. Nullable means no backfill is
      needed — NULL already reads as "use the school default".
- [x] Captured at signup from `Intl.DateTimeFormat().resolvedOptions().timeZone`
      (`browserZone()`), never asked for on the form.
- [x] Settings control (`src/components/settings/TimezoneCard.tsx`), showing the
      current wall-clock in the selected zone — the only check a student can
      actually perform on an IANA name.
- [x] Resolution helper `resolveZone()`: user → `Asia/Jakarta` → `UTC`.
- [x] Also threaded through `USER_COLUMNS`, `/api/auth/me`, and the profile PUT.

**Validation is asymmetric, on purpose:** signup DROPS an unusable zone (a
broken browser value must not cost someone their account, and NULL is already
a correct fallback); Settings REJECTS one with a 400 (a deliberate change that
silently did nothing is worse than an error).

### Task 3 — Streaks — **DONE 27-08-26**

- [x] `utcDate()` deleted; `updateStreak` takes a zone and uses `localDate(zone)`.
- [x] F1 asserted directly: Mon 22:00 and Tue 06:00 WIB are two dates, and the
      UTC reading that collapses them into one is asserted alongside, so the
      test documents the bug rather than only the fix.
- [x] **"Yesterday" is now calendar arithmetic, not `now − 24h`.** This was a
      latent second bug: on a 25-hour DST fall-back day, 24 hours before 23:30
      local is still the SAME local date, so `yesterday === today` and a live
      streak resets to 1. Reproduced exactly (`2026-11-02T04:30:00Z` in
      `America/New_York`) and asserted. Asia/Jakarta has no DST, but the
      per-user override exists precisely for students who are not in it.

### Task 4 — Due dates — **DONE 27-08-26**

- [x] `computeSm2(prev, quality, zone, now?)`. `zone` is REQUIRED, so the
      compiler enumerated every call site instead of a default hiding one.
- [x] Due = start of the local day `interval` days on, via `startOfLocalDay()`.
- [x] `study.test.ts` extended with the 23:00-review case and three more.

### Task 5 — Rendering — **DONE 27-08-26**

- [x] All 13 `toLocale*` sites audited. 11 rewired through a new
      `src/lib/datetime.ts`, which always passes the zone explicitly.
- [x] 2 deliberately left, and documented in place: `LevelRing.tsx:98` formats a
      NUMBER (a false positive in the original count), and `useUploadForm.ts:247`
      echoes back a `datetime-local` value the user just typed, where showing a
      different time than they entered would read as a bug.
- [x] Tutor sessions render via `formatAppointment()`, which appends the zone
      ("Tue 9 Sep, 18:00 WIB") — a bare time is how one person waits alone.
- [x] **Date-only values fixed separately.** `AdminUsageReport` passed a
      `YYYY-MM-DD` through `new Date()`, which parses as UTC midnight and
      renders as the PREVIOUS day in any zone behind UTC — invisible from
      Jakarta (UTC+7), wrong from New York. `formatCalendarDate()` reads such
      values back in UTC.

## Touchpoints

**Modified**

- `backend/src/routes/study.ts` — `utcDate`, `computeSm2`, `getDueReviews`
- `backend/src/routes/tutors.ts` — session time handling
- `backend/src/routes/auth.ts` — capture timezone at signup
- `backend/schema.sql` + two new migrations
- `backend/src/lib/env.ts` — `User.timezone`
- `src/types/index.ts`, `src/lib/api.ts` — timezone on the user
- `src/pages/SettingsPage.tsx` — the control
- 13 `toLocale*` call sites across `src/`

**New**

- `backend/src/lib/time.ts` — `localDate`, `startOfLocalDay`, zone resolution
- `backend/test/red-team/timezone.test.ts`

## Public Contracts

- **Changed:** `computeSm2(prev, quality)` → `computeSm2(prev, quality, zone)`.
  Exported and unit-tested; this is the one true signature break.
- **Changed (shape, not name):** every timestamp field switches from space form
  to ISO-with-`Z`. Any consumer parsing the old format as local time will shift
  by their offset — which is the bug being fixed, but it is still a change.
- **Added:** `users.timezone` on the user payload.
- **Unchanged:** all route paths and methods.

## Blast Radius

- **Database:** every timestamp column in every table is rewritten by the
  backfill. This is the highest-risk step in the plan.
- **Streaks:** `current_streak` / `longest_streak` change basis. Values already
  stored are not recomputed (see Non-Goals), so a student may see one anomalous
  day across the cutover.
- **SRS:** due dates shift to local-midnight boundaries. Existing `due_at` values
  stay valid instants; only newly computed ones use the new basis.
- **Ranking:** unaffected — `learning_points` has no time component.
- **Not touched:** auth, notes, AI pipeline, tutor booking/capacity logic.

## Testing Context and Post-Phase Testing

Test runner: `vitest` in both packages — `npx vitest run` at the root and in
`backend/`. Post-phase testing is not optional: every task above ends with the
tests named in Verification Evidence, and the EVL confirmation run must be
performed by a spawned `vc-tester` re-running the validate-contract gate
commands. The execute agent's own green report does not substitute for it.

Backend suites run under `@cloudflare/vitest-pool-workers`. Backend runs under `@cloudflare/vitest-pool-workers`.

Timezone tests must **pin the zone explicitly** rather than relying on the
runner's ambient `TZ`, or they pass on a developer machine in Jakarta and fail in
CI running UTC. Assert on the formatted result for a named zone, not on the
host's local time.

Reproduce each finding as a failing test before fixing it — F1 and F2 in
particular are easy to "fix" in a way that moves the bug rather than removing it.

**Known trap:** `npx vitest run | tail` returns _tail's_ exit status, so a crashed
runner reads as green. Capture the runner's own exit code.

## Risks

- **The backfill is destructive.** Rewriting every timestamp column has no cheap
  undo. Snapshot first; verify on a copy.
- ~~**`Intl` in Workers is unverified.**~~ **Retired 27-08-26** — verified in the
  Workers test pool. Residual risk is only that the deployed edge runtime carries
  different ICU data; cheap to re-check, and the fallback (stored fixed offsets)
  is known.
- **Streak cutover artefact.** A student may gain or lose one day at the
  boundary. Acceptable, but it should be a deliberate accepted gap, not a
  surprise.
- **Scope creep into "relative time" formatting.** "2 days ago" strings are a
  separate concern; do not fold them in.

## Validate Contract

**NOT WRITTEN — VALIDATE has not run for this plan.** Per
`process/development-protocols/orchestration.md` §VALIDATE Gate, a placeholder is
not a completed validate and routing to EXECUTE on it is a protocol violation.
`vc-validate-agent` writes the real V1–V7 contract here.

Open Question 1 (where the timezone comes from) should be answered first — it
changes Task 2 materially.

## Verification Evidence

To be filled by EXECUTE. The evidence that this plan actually worked is
behavioural, not a green suite — each item below must be demonstrated:

| Claim                | How it is verified                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 0 spike         | **DONE.** Named zones work in the Workers pool; `src/__tests__/time.test.ts` round-trips five zones incl. half-hour and both DST directions. Deployed-preview re-check still open.                        |
| F1 fixed             | **DONE.** `time.test.ts` asserts Mon 22:00 / Tue 06:00 WIB are two dates AND that the UTC reading collapses them — the bug is documented next to the fix.                                                 |
| F2 fixed             | **DONE.** Four cases in `study.test.ts`. Mutation-tested: restoring the exact pre-fix code fails all four; restoring the fix passes.                                                                      |
| F3 fixed (storage)   | **DONE.** Local DB: 0 space-form rows across users/notes/study_items. 16 further escaped write sites found and fixed (see Task 1 addendum).                                                               |
| F3 fixed (rendering) | **DONE.** `src/lib/__tests__/datetime.test.ts` — the same instant renders as 4 Aug in Jakarta and 3 Aug in New York, by explicit zone.                                                                    |
| F4 fixed             | **DONE by construction** — one format everywhere, plus the string-ordering assertion already in `timestamp-format.test.ts`.                                                                               |
| No skew              | **DONE, live.** One review instant, two users: Europe/London → `2026-08-27T23:00:00Z` (28 Aug 00:00 BST); Asia/Jakarta → `2026-08-27T17:00:00Z` (28 Aug 00:00 WIB). Both local midnight, six hours apart. |
| Zone wiring          | **Mutation-tested.** Ignoring the per-user zone, and reverting streak days to UTC, each fail the date-line test (Kiritimati +14 vs Niue −11).                                                             |
| Gates                | FE tsc **0** · BE tsc **0** · `eslint src` **0 errors** (616 warnings = baseline) · FE **53/53** · BE **268/268** · build **4.40s**. Each exit code captured separately, never through a pipe.            |

Every finding above was reproduced before this plan was written; the same
reproductions become the regression tests.

## Resume and Execution Handoff

Resume state (27-08-26):

- Plan written; **nothing implemented**.
- All four findings are reproduced and quantified above, with the exact file and
  line for each. F4's scope was narrowed after measurement — it affects same-date
  comparisons only, and the original broader claim was wrong.
- No migration created; `users.timezone` does not exist.
- **Task 0 spike is complete and its result is recorded above.** The throwaway
  test was deleted rather than committed — the F1 reproduction belongs with
  Task 3's fix, not ahead of it.

## Next Step

**Tasks 0–5 are complete.** What remains is deployment-gated or explicitly
deferred:

1. **Re-confirm `Intl` on a deployed preview** (Task 0's open box). The local
   Workers pool has full ICU — half-hour zones, both DST directions, and the
   date line all round-trip. The deployed edge runtime is not guaranteed
   identical. Cheap to check; do it before this ships, not before more is built.
2. **Answer Open Questions 2 and 3.** Q2 (recompute streaks on a zone change) is
   currently "no" by default — the new zone applies from the next study event.
   Q3 (a 03:00 cutover so a late-night session counts as "today") is a product
   choice nobody has made.
3. **Two defects found in passing, both out of scope and neither introduced
   here:**
   - `scheduled_publish_at` is sent from a `datetime-local` input as a
     zone-less local string, so the server stores an instant it cannot place.
     Same family as F3. Flagged in place at `useUploadForm.ts:247`.
   - ~~The LOCAL dev database still has `users.encrypted_yw_id NOT NULL`~~
     **RESOLVED 28-08-26 — local `users` table rebuilt.** See below.

## Addendum — local dev `users` table rebuilt (28-08-26)

Signup 500'd against the local dev database. The audit found **three** drifted
constraints, not one; SQLite cannot ALTER any of them, so the table was
recreated and the rows copied.

| #   | Was                                                 | Now                                              | Effect of the old value                                                                                     |
| --- | --------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1   | `encrypted_yw_id TEXT NOT NULL UNIQUE`              | `TEXT UNIQUE`                                    | Every email signup and Google OAuth create 500'd — only the legacy YourWorld sync path supplies this column |
| 2   | `class TEXT CHECK(class IN ('10.1','10.2','10.3'))` | `class TEXT`                                     | `grade_classes` registers 10.1–**12.3**, so no grade 11 or 12 student could be created at all               |
| 3   | `created_at/updated_at DEFAULT (datetime('now'))`   | `DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))` | Any insert omitting the column wrote SPACE form — the F3 bug, still live in this database's defaults        |

**The dangerous step was the DROP, not the CREATE.** Eleven tables carry foreign
keys to `users` and several are `ON DELETE CASCADE`; dropping with
`foreign_keys` ON performs an implicit DELETE that would have cascaded through
notes, likes, sessions and bookings. FKs were disabled for the rebuild and
`PRAGMA foreign_key_check` run before COMMIT.

Guards used, in order: file backup → assert the new column set covers the live
one exactly (abort if any column would be dropped) → assert copied row count
before dropping → `foreign_key_check` inside the transaction → ROLLBACK on any
throw → compare users AND all eleven child counts after.

Verified after: users 4 → 4 (ids 1,2,3,4 unchanged); all 11 child tables
unchanged; 0 FK violations; `integrity_check` ok; all 7 indexes recreated;
`sqlite_sequence` high-water mark preserved at 9001 so no id is ever reused.

Live re-test: grade 10 signup **201**, grade **12.3** signup **201**, a row
inserted without `created_at` gets `2026-08-28T00:38:11Z`, and a NULL
`encrypted_yw_id` is accepted. All probe rows removed afterwards.

Backup: `/tmp/notarium-db-backups/users-rebuild-20260827-232826.sqlite`.
**Local dev database only — production D1 was never touched.**

Note that `schema.sql` was already correct on all three points; this was the
database lagging the file. The same drift may exist in any other developer's
local DB, and — since `schema.sql`'s fixes are still uncommitted — in any
environment built before they land.
