---
phase: phase-3-community-progress
date: 2026-08-17
status: COMPLETE_WITH_GAPS
feature: paperloop
plan: process/general-plans/active/paperloop_25-07-26/phase-3-community-progress_PLAN_25-07-26.md
evl: GATES-GREEN (independently confirmed) — FE 29/29, BE 192/192, tsc clean x2
commit: 85cb8e0 — feat(study-loop): Phase 3 — Community + Progress metric flip
---

# Phase 3 — Community + Progress — EXECUTE Report

**TL;DR:** All 9 checklist items implemented exactly as planned. All four automated gates green
(FE 29/29, BE 192/192, tsc clean x2). Only the 4 declared blast-radius files touched. One
within-blast-radius test deviation (`findByRole` heading query instead of `findByText`, to dodge an
AppShell nav collision). ProfileStats "Rank" badge label is the single word **"Rank"** — neutral, not
misleading in wording, but contextually ambiguous inside a contributor-flavored modal (copy-tweak
candidate, not fixed per instruction). C4 browser agent-probe not run (no dev server) — matches Phase
1/2 precedent.

## What Was Done

| Step | File                                                         | Change                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3a.1 | `backend/src/routes/leaderboard.ts`                          | `ORDER BY` swapped to `learning_points DESC, current_streak DESC`; added `current_streak` to SELECT (additive); **retained** the computed `(notes_uploaded + total_likes + total_admin_upvotes) as points` column and `LIMIT 100`. SELECT otherwise unchanged.                                                                              |
| 3b.1 | `src/pages/LeaderboardPage.tsx`                              | Heading `"Leaderboard"` → `"Progress"`.                                                                                                                                                                                                                                                                                                     |
| 3b.2 | `src/pages/LeaderboardPage.tsx`                              | Deleted `type LeaderboardTab`, `activeTab` state, and the tab-button toggle block. Converted the previously-conditional Indonesian subtitle into an always-rendered static paragraph.                                                                                                                                                       |
| 3b.3 | `src/pages/LeaderboardPage.tsx`                              | Removed `getContributionPoints` and the `rankedLeaderboard` client-side sort. Kept `getLearningPoints`. Renders server order directly via `topEntries = leaderboard.slice(0, 20)`.                                                                                                                                                          |
| 3b.4 | `src/pages/LeaderboardPage.tsx`                              | Per-row stat block simplified to always show `🧠 {getLearningPoints(entry)}` + "learning points"; removed all `activeTab` ternaries and the secondary-dimension 🪙 sub-line.                                                                                                                                                                |
| 3b.5 | `src/pages/LeaderboardPage.tsx`                              | Trimmed `LeaderboardEntry` to `name?/display_name?/class?/learning_points?/photo_url?` (dropped `points`, `score`, `total_likes`).                                                                                                                                                                                                          |
| 3b.6 | `src/pages/LeaderboardPage.tsx`                              | Added personal-stats header: `Flame/Trophy/CalendarClock` chips for streak / learning points / due cards, fetched via existing `api.getStudyStats()` in a dedicated `useEffect` with its own `statsLoading` flag (independent of the `isLoading` list prop), try/catch + `.catch()` fallback + cancel guard. No backend or `api.ts` change. |
| 3c.1 | `backend/test/red-team/leaderboard-ranking.test.ts` (CREATE) | Red-team harness test: seeds 3 users, `UPDATE users SET learning_points` to 10/50/30 via `env.DB`, asserts `/api/leaderboard` returns `[50,30,10]` descending + a global non-increasing invariant.                                                                                                                                          |
| 3c.2 | `src/app/__tests__/appshell-routing.test.tsx`                | Added `getLeaderboard` to the hoisted `api` mock + `beforeEach` reset; added `/progress` routing test asserting the "Progress" heading renders and neither `/contributors/i` nor `/top learners/i` is present.                                                                                                                              |

## What Was Skipped or Deferred

- **C4 — browser agent-probe** (navigate to `/progress`, confirm stat chips + single ranked list
  visually): NOT run — no dev server / browser session available this session. This matches the
  Phase 1 (browser check WAIVED, automated smoke tests accepted in lieu) and Phase 2 (browser
  agent-probe recorded verification-pending) precedent in the blast-radius registry.
- **ProfileStats "Rank" badge copy** — explicitly report-only per the EXECUTE handoff; not fixed (see
  ProfileStats Label Report below).

## Test Gate Outcomes

| Gate               | Command                          | Result                                                                                                                                       |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend tests     | `npm test`                       | **PASS — 29/29** (7 files). Baseline 28 → +1 (`/progress` case).                                                                             |
| Frontend typecheck | `npx tsc --noEmit`               | **PASS (exit 0)**                                                                                                                            |
| Backend tests      | `cd backend && npm test`         | **PASS — 192/192** (26 files). Includes `journeys.test.ts` `row.points >= 1` (retained `points` column) + new `leaderboard-ranking.test.ts`. |
| Backend typecheck  | `cd backend && npx tsc --noEmit` | **PASS (exit 0)**                                                                                                                            |

New tests verified non-vacuous:

- `leaderboard-ranking.test.ts` asserts `[50,30,10]` — would fail against the old contributor
  formula (all `points`=0 → arbitrary/insert order), so it genuinely proves the ORDER BY swap.
- `/progress` case renders the REAL `LeaderboardPage` inside `AppShell` (not sentinel-mocked) and
  ran green (file 5 → 6 tests).

Note on baseline: backend baseline was 187 (Phase 2 closeout); current pre-edit count was higher due
to the other session's uncommitted red-team additions (`gaps-*.test.ts`). My contribution is exactly
+1 backend test; all 192 pass with zero failures.

## Plan Deviations

**1 within-blast-radius deviation (documented, continue):**

- **File:** `src/app/__tests__/appshell-routing.test.tsx` (in my declared blast radius)
- **Deviated:** Plan 3c.2 said assert `await screen.findByText('Progress')`. I used
  `await screen.findByRole('heading', { name: 'Progress' })` instead.
- **Why:** `/progress` renders inside `AppShell`, whose desktop sidebar renders a
  `<button>…Progress</button>` (AppShell.tsx:862) that is always in the DOM. A plain
  `findByText('Progress')` matches BOTH that button and the page `<h2>Progress</h2>` → "multiple
  elements" throw. The heading-role query uniquely targets the `<h2>` (the sidebar item is a button,
  not a heading; ExpandableTabs only renders its title text when selected, so it is absent at mount).
- **Impact:** None on criterion coverage — proves the same criterion C3 ("heading reads Progress"),
  more precisely. Classified as implementation-detail / library-call variation within the same
  semantic operation. Test passes.

No hard-stop-class deviations. No schema/auth/API/billing/container changes.

## ProfileStats Label Report (accepted known-gap — report only, NOT edited)

Read `src/components/ProfileStats.tsx` per instruction:

- **(a) Exact rank-badge label text:** the label is the single word **"Rank"** (`ProfileStats.tsx:546`).
  The value above it renders as `#{userRank}` or `"N/A"` (line 544), where `userRank` is computed
  positionally: `lb.findIndex((u) => u.id === user?.id) + 1` (line 43) over the raw
  `api.getLeaderboard()` array order.
- **(b) Does the label now mislead?** **Word-level: NO — it is neutral.** "Rank" says nothing about
  "contributor", "uploads", "likes", or any contribution dimension, so after the ORDER BY swap it is
  not literally wrong; it simply now reflects learning-rank, which is directionally consistent with
  the phase's "Ranking = LEARNING-ONLY" intent.
  **Context-level: MILD AMBIGUITY.** The badge sits in the "My Profile" modal directly beside
  contributor-flavored stats — "🪙 Points" (lines 386, 562), "Notes Created" (line 505), "Likes
  Received" (line 521). A user scanning that cluster could reasonably read the neutral "Rank" as a
  _contribution_ rank when it is now a _learning_ rank. Not a technical break (no crash, no type
  error, no failing test — confirmed: `getLeaderboard` response shape unchanged, `id` still present
  for the `findIndex`). **Recommendation for the orchestrator:** a low-priority copy follow-up
  (e.g. relabel to "Learning Rank") would remove the ambiguity; no code fix was made here.

## Test Infra Gaps Found

- None introduced. This phase ADDED the first backend integration test dedicated to leaderboard
  ordering (`leaderboard-ranking.test.ts`) and the first frontend routing coverage for `/progress`.
- Observation (non-blocking): `process/context/` routing tables in `all-context.md` / `all-tests.md`
  are still empty seed placeholders ("no groups yet"). The root docs themselves are fully populated
  (architecture, data model, commands) and were sufficient — no `CONTEXT_PARTIAL` blocker. Flagging
  only so UPDATE PROCESS can decide whether to backfill the generated routing block.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/paperloop_25-07-26/phase-3-community-progress_PLAN_25-07-26.md`
- **Finished:** 3a + 3b (all 6 sub-steps) + 3c (both tests) — 9/9 checklist items.
- **Verified:** all 4 automated gates green (FE 29/29, BE 192/192, tsc x2 clean); blast radius
  confirmed to exactly the 4 planned files; forbidden files (AppShell/SubjectsPage/api.ts/study.ts)
  untouched.
- **Unverified:** C4 browser agent-probe (deferred — no dev server; matches Phase 1/2 precedent).
- **Cleanup remaining:** archive plan + update umbrella `## Current Execution State` (Phase 3 → DONE)
  - registry Phase 3 status → DONE (UPDATE PROCESS owns these); optional ProfileStats copy follow-up.
- **Follow-up plan stubs created:** NONE.
- **CONTEXT_PARTIAL items:** NONE.
- **Best next state:** Ready for UPDATE PROCESS archival (orchestrator EVL will independently re-run
  the 4 automated gates first; the C4 browser probe can be waived-in-lieu per Phase 1/2 precedent or
  run manually).

## EVL Confirmation (orchestrator, independent re-run)

All 4 declared gates re-run independently and confirmed GREEN: `npm test` (FE 29/29), `npx tsc --noEmit` (FE clean), `cd backend && npm test` (BE 192/192), `cd backend && npx tsc --noEmit` (BE clean). C4 browser agent-probe remains waived — matches Phase 1/2 precedent; recorded as an accepted known-gap, not a blocking gap. Source changes committed as `85cb8e0` (`feat(study-loop): Phase 3 — Community + Progress metric flip`).

## Forward Preview

### Test Infra Found

- Backend red-team harness (`backend/test/red-team/helpers.ts`) is the correct pattern for any test
  needing a real D1 binding + HTTP call through the Worker (`applySchema`/`resetData`/`seedUser`/
  `call`/`env`). `seedUser()` does NOT set `learning_points`/`current_streak`/points columns — set
  them with a direct `env.DB.prepare('UPDATE users SET ... WHERE id = ?')`.
- Frontend routing tests: the hoisted `api` mock in `appshell-routing.test.tsx` must include every
  api method the mounted page/AppShell calls on mount. `LeaderboardPage` needs `getLeaderboard` +
  `getStudyStats`. Real (non-sentinel) pages rendered inside AppShell must use role-scoped queries
  (`findByRole('heading', ...)`) for any text that collides with a nav label.

### Blast Radius Changes

- Phase 3 touched exactly: `backend/src/routes/leaderboard.ts`, `src/pages/LeaderboardPage.tsx`,
  `backend/test/red-team/leaderboard-ranking.test.ts` (new), `src/app/__tests__/appshell-routing.test.tsx`.
- `/api/leaderboard` response shape UNCHANGED (all fields retained incl. `points`; `current_streak`
  now additionally present). Sort order is the only behavioral change.

### Commands to Stay Green

- `npm test` (FE, from root) · `npx tsc --noEmit` (FE) · `cd backend && npm test` · `cd backend && npx tsc --noEmit`.

### Dependency Changes

- NONE. No new packages, no new backend endpoints, no migration, no schema change.
