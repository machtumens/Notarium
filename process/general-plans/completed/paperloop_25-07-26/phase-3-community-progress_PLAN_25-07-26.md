---
name: plan:paperloop-phase-03-community-progress
description: 'Paperloop — Phase 3: Community label swap + Progress leaderboard (learning_points ranking, personal-stats header)'
date: 25-07-26
metadata:
  node_type: memory
  type: plan
  feature: paperloop
  phase: phase-03
---

# Phase 3 — Community + Progress

**Program:** paperloop
**Umbrella plan:** `process/general-plans/active/paperloop_25-07-26/paperloop-umbrella_PLAN_25-07-26.md`
**Date** 25-07-26 (supplemented 16-08-26)
**Status** ✅ COMPLETE — EVL-green (all 4 gates independently confirmed), source committed as `85cb8e0`. UPDATE PROCESS closed 17-08-26.
**Complexity** SIMPLE
**Report destination:** `process/general-plans/active/paperloop_25-07-26/phase-3-community-progress_REPORT_25-07-26.md`

---

## Overview

Progress page reframing, driven entirely by direct source verification this session (no design ambiguity remained after user decisions — INNOVATE was skipped):

1. **Ranking = learning-only.** Backend `ORDER BY` swaps from the `notes_uploaded + total_likes + total_admin_upvotes` contributor formula to `learning_points DESC` (+ `current_streak DESC` tiebreaker). The frontend's pre-existing Contributors/Top Learners tab toggle is deleted entirely — a single learning-ranked list renders. This is a net code deletion and it eliminates the pre-existing truncation bug (the backend's `LIMIT 100` previously used a different sort key than the frontend's client-side re-sort — now both use the same key).
2. **Personal-stats header (new).** The Progress page gains a small header showing the user's own `current_streak` / `learning_points` / `due_count`, sourced from the pre-existing `GET /api/study/stats` endpoint (client method `api.getStudyStats()`) — the same endpoint `TodayPage.tsx` already consumes. No new backend work.
3. **Community heading untouched.** `SubjectsPage.tsx`'s in-page `<h2>Subjects</h2>` is explicitly left alone — not a Phase 3 touchpoint (user decision).
4. **AppShell nav labels — already done.** Verified this session: `src/components/AppShell.tsx` already reads "Community"/"Progress" (landed in Phase 1, lines 221-222, 804, 862). Phase 3 does **not** touch `AppShell.tsx` — the original stub's A1 item is dropped as stale.

Phase 3 is independent of Phase 2. Both depend on Phase 1.

---

## Locked Decisions (from user this session — INNOVATE intentionally skipped)

1. **Ranking = LEARNING-ONLY.** Backend `ORDER BY learning_points DESC`. Drop the `notes_uploaded + total_likes + total_admin_upvotes` formula from the ranking. In the frontend, remove the Contributors/Top Learners tab toggle entirely — render a single learning-ranked list. Deletes code; eliminates the truncation bug (sort key now matches the `LIMIT 100`/slice key).
2. **Community heading: leave `SubjectsPage.tsx`'s `<h2>Subjects</h2>` unchanged.** Not a Phase 3 touchpoint.
3. **Progress page: add a personal-stats header** atop the ranking (current_streak / learning_points / due_count), reusing the existing `/api/study/stats` endpoint. Do not add new backend for this.

---

## Verified Findings (this PLAN-SUPPLEMENT — direct source read, this session)

- `backend/src/routes/leaderboard.ts:4-24` — `getLeaderboard(env)`: SELECT includes `display_name, photo_url, class, notes_uploaded, total_likes, total_admin_upvotes, learning_points, (notes_uploaded + total_likes + total_admin_upvotes) as points`; `ORDER BY (notes_uploaded + total_likes + total_admin_upvotes) DESC, notes_uploaded DESC, total_likes DESC LIMIT 100`. `learning_points` is already selected but unused for ordering.
- **Correction to the task brief:** the computed `points` column must be **retained** in the SELECT, not dropped. `backend/test/red-team/journeys.test.ts:55-61` calls `/api/leaderboard` and asserts `expect(row.points).toBeGreaterThanOrEqual(1)` — this is insensitive to the ORDER BY change (confirmed, matches the brief) but is **not** insensitive to removing the `points` column itself. Only the `ORDER BY` clause changes; the SELECT list is untouched.
- `current_streak` confirmed to exist on `users` (`backend/src/routes/study.ts:74,96,476`) — safe to use as an ORDER BY tiebreaker.
- `src/pages/LeaderboardPage.tsx` (full file read this session): heading `"Leaderboard"` at line 77; `type LeaderboardTab` at line 20; `activeTab` state at line 29; `getContributionPoints`/`getLearningPoints`/`rankedLeaderboard` derived sort at lines 31-41; tab-toggle button UI at lines 81-121; conditional Indonesian subtitle (`activeTab === 'learners'`) at lines 123-133; per-row right-hand stat block with the `activeTab` ternary + "secondary dimension badge" sub-line at lines 220-264; `LeaderboardEntry` interface at lines 9-18. `LeaderboardPage` is rendered by `ProgressRoute` (`src/app/routes/ShellPageRoutes.tsx:24-27`) at route path `/progress` (`src/app/AppRoutes.tsx:134`) — receives `isLoading`/`setIsLoading` as **props** from the wrapper, which owns its own `useState`.
- `GET /api/study/stats` handler (`backend/src/routes/study.ts:475-494`) returns `{ current_streak, longest_streak, learning_points, due_count }`. Client method is `api.getStudyStats()` (`src/lib/api.ts:710-716`) — **not `api.study.stats`** (correcting the task brief's generic phrasing). `TodayPage.tsx:52-89` is the exact fetch/loading pattern to mirror: local `useState`, `useEffect` on mount, `.catch(() => EMPTY_STATS)` fallback, `isLoading` gate.
- `AppShell.tsx:221-222,804,862` — nav labels already read `{ title: 'Community', icon: Book }` / `{ title: 'Progress', icon: Trophy }` and the corresponding JSX text. Landed in Phase 1. **Phase 3 does not touch this file.**
- Repo-wide grep confirms **no existing test** anywhere exercises `/progress`, `LeaderboardPage`, or leaderboard ordering beyond `journeys.test.ts`'s single incidental `row.points` assertion (order-insensitive). `src/app/__tests__/appshell-routing.test.tsx` (139 lines, full file read) has no `/progress` case; its hoisted `api` mock has `isAuthenticated`, `getStudyStats`, `getDueReviews`, `request`, `notifications.getUnreadCount` — no `getLeaderboard` (must be added).
- `backend/test/red-team/helpers.ts` (`seedUser`, line 101) does not support setting `learning_points` via opts — new test must seed then directly `UPDATE users SET learning_points = ?` via `env.DB`. **PVL correction:** the plan's original citation (`journeys.test.ts:47-54`) was wrong — those lines are `SELECT` reads (`note.likes` / `author.total_likes`), not an UPDATE. The real `env.DB.prepare('UPDATE ...').bind().run()` precedent for direct-DB test mutation lives at `journeys.test.ts:121` (`UPDATE notes SET deleted_at = ...`) and repeats in `gaps-study-admin.test.ts:48` and `gaps-ratelimit-notes-idor.test.ts:79,93,106` — same idiom, different table/column. `env.DB` is a real binding confirmed available in every red-team test file, so the mechanism (`UPDATE users SET learning_points = ? WHERE id = ?`) is valid — only the citation was wrong.
- `backend/src/__tests__/study.test.ts` is a pure-function unit-test pattern (`computeSm2` called directly, no DB) — **not** the right shape for `getLeaderboard(env)`, which requires a real D1 binding. The red-team integration harness (`applySchema`/`resetData`/`seedUser`/`call`/`env` from `./helpers`) is the correct pattern, matching how `journeys.test.ts` already hits `/api/leaderboard`.

---

## Entry Gate

- Phase 1 verified (✅ COMPLETE — confirmed via umbrella `## Current Execution State`).

---

## Phase Completion Rules

Phase 3 is complete when:

1. `npm test`, `npx tsc --noEmit`, `cd backend && npm test`, `cd backend && npx tsc --noEmit` all exit 0
2. Progress page (browser, manual confirm) shows: heading "Progress", a personal-stats header (streak/learning points/due count), and a single learning_points-ranked list — no Contributors/Top Learners toggle
3. No Phase 1 regressions
4. vc-validate-agent has written the Validate Contract section (Gate: PASS or accepted CONDITIONAL)
5. Phase 3 report written and umbrella Current Execution State updated

---

## Acceptance Criteria

1. `/api/leaderboard` returns users `ORDER BY learning_points DESC` (with `current_streak DESC` tiebreaker) — not the notes/likes/upvotes formula.
2. `LeaderboardPage.tsx` no longer offers a Contributors/Top Learners toggle — a single ranked list renders unconditionally.
3. `LeaderboardPage.tsx` heading reads "Progress" (not "Leaderboard").
4. Progress page shows a personal-stats header (current_streak, learning_points, due_count) sourced from `api.getStudyStats()` — no new backend endpoint added.
5. A new automated backend test asserts `/api/leaderboard` returns users sorted by `learning_points` descending.
6. `npm test` exits 0.
7. `npx tsc --noEmit` exits 0.
8. `cd backend && npm test` exits 0 — including `journeys.test.ts`'s existing `row.points >= 1` assertion, which continues to pass because the computed `points` SQL column is retained.
9. `cd backend && npx tsc --noEmit` exits 0.

---

## Blast Radius

Risk class: LOW. One backend `ORDER BY` swap (no SELECT/schema change), one frontend page rewrite reusing an existing endpoint, two test files. No migration, no new dependencies, no new backend endpoints.

- `backend/src/routes/leaderboard.ts` — MODIFY: `ORDER BY` clause only.
- `src/pages/LeaderboardPage.tsx` — MODIFY: heading rename, toggle deletion, personal-stats header addition.
- `backend/test/red-team/leaderboard-ranking.test.ts` — CREATE: new leaderboard ordering test.
- `src/app/__tests__/appshell-routing.test.tsx` — MODIFY: add `getLeaderboard` to the hoisted `api` mock + one new `/progress` routing test.

**Explicitly NOT touched (verified this session):**

- `src/components/AppShell.tsx` — nav labels "Community"/"Progress" already landed in Phase 1 (lines 221-222, 804, 862). No Phase 3 change needed.
- `src/pages/SubjectsPage.tsx` — `<h2>Subjects</h2>` explicitly left unchanged per user decision 2; not a Phase 3 touchpoint.
- `src/lib/api.ts` — both `getLeaderboard()` and `getStudyStats()` already exist with the shapes needed; no client method changes required.

---

## Implementation Checklist

### 3a — Backend: ranking swap

- [x] 3a.1. In `backend/src/routes/leaderboard.ts`, change the `ORDER BY` clause from `(notes_uploaded + total_likes + total_admin_upvotes) DESC, notes_uploaded DESC, total_likes DESC` to `learning_points DESC, current_streak DESC`. **Keep the SELECT list and the computed `(notes_uploaded + total_likes + total_admin_upvotes) as points` column unchanged** — do not drop it (see Verified Findings: `journeys.test.ts:60-61` depends on `row.points` existing). Keep `LIMIT 100`. Note: `current_streak` is not currently in the SELECT list — add it to the SELECT (needed for the tiebreaker to be usable by ORDER BY; D1/SQLite allows ORDER BY on non-selected columns, but adding it is harmless and keeps the query self-documenting) — this is an additive SELECT change only, not a removal, so it does not affect `journeys.test.ts`.

### 3b — Frontend: Progress page rewrite

- [x] 3b.1. In `src/pages/LeaderboardPage.tsx`, change the page heading text from `"Leaderboard"` to `"Progress"` (confirmed line 77).
- [x] 3b.2. Remove the Contributors/Top Learners tab toggle entirely: delete `type LeaderboardTab` (line 20), the `activeTab` state (line 29), and the tab-button UI block (lines ~81-121). Convert the conditional Indonesian subtitle paragraph (lines ~123-133, previously gated on `activeTab === 'learners'`) into an always-rendered static paragraph under the heading (same copy, no longer conditional).
- [x] 3b.3. Remove `getContributionPoints` (lines 31-32) and the `rankedLeaderboard` client-side derived sort (lines 37-41) — the backend now returns a server-ordered-by-learning_points list, so no client-side re-sort is needed. Keep a single `getLearningPoints(entry)` safe-accessor helper (`Math.max(0, entry.learning_points || 0)`). Render `leaderboard.slice(0, 20).map(...)` directly in place of `rankedLeaderboard.slice(0, 20).map(...)`.
- [x] 3b.4. Simplify the per-row right-hand stat block (lines ~220-264): always show `🧠 {getLearningPoints(entry)}` + `"learning points"` label — remove the `activeTab === 'learners' ? ... : ...` ternaries and delete the "secondary dimension badge" sub-line entirely (the 🪙 contributor-points display has no ranking basis to show anymore).
- [x] 3b.5. Trim the `LeaderboardEntry` interface (lines 9-18) to the fields the single-list view actually uses: `name?: string; display_name?: string; class?: string; learning_points?: number; photo_url?: string;` — drop `points`, `score`, `total_likes` (unused by the frontend after 3b.3/3b.4; the backend still returns them at runtime, which TS's structural typing tolerates without issue).
- [x] 3b.6. Add a personal-stats header above the ranked list. Import `Flame, Trophy, CalendarClock` from `lucide-react` (mirrors `TodayPage.tsx`'s icon usage). Add a local `useState<{ current_streak: number; learning_points: number; due_count: number }>` (default all-zero) plus a separate `useState(true)` loading flag, independent of the `isLoading`/`setIsLoading` props (which continue to gate only the ranked-list fetch — do not conflate the two loading states). On mount (`useEffect`), call `api.getStudyStats()` — mirror `TodayPage.tsx:57-89`'s pattern: try/catch, `.catch()` fallback to the zero-default, `finally` clears the local loading flag. Render 3 small stat chips (streak / learning points / due cards) in a horizontal row above the heading or ranked list, styled with `darkTheme` tokens consistent with the file's existing style (a compact version of `TodayPage.tsx`'s stat-card visual language — smaller padding, no full card grid). No new backend endpoint; no changes to `src/lib/api.ts`.

### 3c — Tests

- [x] 3c.1. Create `backend/test/red-team/leaderboard-ranking.test.ts` — red-team integration harness pattern (`applySchema`, `resetData`, `seedUser`, `call`, `env` imported from `./helpers`, `beforeAll(applySchema)` + `beforeEach(resetData)`, matching `journeys.test.ts`'s existing `/api/leaderboard` HTTP-call pattern). Seed 3 users via `seedUser()`, directly `UPDATE users SET learning_points = ? WHERE id = ?` via `env.DB` for each with distinct values (e.g. 50, 10, 30), call `GET /api/leaderboard` via `call('/api/leaderboard', { ip: ... })`, assert the returned `leaderboard` array's `learning_points` values appear in descending order (locate the 3 seeded users by `display_name` or id and assert their relative rank order matches the seeded values).
- [x] 3c.2. In `src/app/__tests__/appshell-routing.test.tsx`: add `getLeaderboard: vi.fn(() => Promise.resolve({ leaderboard: [] }))` to the hoisted `api` mock object (alongside the existing `getStudyStats`/`getDueReviews`/`request`/`notifications` entries), and add a matching default reset (`api.getLeaderboard.mockResolvedValue({ leaderboard: [] })`) inside the existing `beforeEach` block. Add one new test case: `renders ProgressRoute (LeaderboardPage) at /progress with the Progress heading and no Contributors/Learners toggle` — `renderAt('/progress', { user: AUTHED_USER, loading: false })`; assert `await screen.findByText('Progress')` resolves; assert `screen.queryByText(/contributors/i)` and `screen.queryByText(/top learners/i)` are both `not.toBeInTheDocument()`. This is the first routing-level coverage for `/progress`.
- [x] 3c.3. Run all four gate commands (see Exit Gate) after 3a-3b are complete; fix any failures before considering the phase code-complete. Do not batch all steps to the end — verify backend (3a) independently before starting frontend (3b).

---

## Exit Gate

```bash
npm test
npx tsc --noEmit
cd backend && npm test     # regression + new leaderboard-ranking.test.ts
cd backend && npx tsc --noEmit
```

Manual/agent-probe verification:

- [ ] Browser: navigate to `/progress` — confirm heading reads "Progress", a personal-stats header shows streak/learning points/due count, and a single learning_points-ranked list renders (no toggle).
- [ ] Browser: confirm no Phase 1 regressions (`/`, all nav tabs, `/review`, `/my-notes`, `/settings` still work).

---

## Blockers That Would Justify BLOCKED Status

- Phase 1 not verified.
- `learning_points` or `current_streak` columns missing from `users` table — verified NOT the case this session (both confirmed present and populated via `backend/src/routes/study.ts`).

---

## Accepted Known-Gaps

1. **`ProfileStats.tsx` "Rank" badge silently changes meaning (discovered at PVL; pre-existing consumer, outside Phase 3's declared blast radius).** `src/components/ProfileStats.tsx:39-51` calls `api.getLeaderboard()` directly and computes `userRank` via `lb.findIndex((u) => u.id === user?.id) + 1` — a POSITIONAL read of the raw backend array order (not a client-side re-sort, unlike `LeaderboardPage.tsx`'s now-removed `rankedLeaderboard`). It uses its own `LeaderboardEntry` type from `src/types/index.ts:211-220` (a separate type from `LeaderboardPage.tsx`'s page-local interface of the same name). Because Phase 3 changes the backend `ORDER BY` from the contributor formula to `learning_points DESC`, this badge's "Rank" will silently flip from a contribution-rank to a learning-rank with ZERO code change to `ProfileStats.tsx` itself. This is directionally consistent with the phase's "Ranking = LEARNING-ONLY" intent (Locked Decision 1) but was not explicitly decided by the user for this specific consumer, is not listed in Blast Radius/Touchpoints, and has no test coverage for the semantic change. Not a technical break — no crash, no type error, no test failure; the component continues to function correctly with a different ranking meaning. Accepted as-is; candidate for a documentation/UX-copy follow-up (e.g. relabeling "Rank" contextually, or having it consume the same learning-ranked endpoint deliberately) in a later phase if it becomes a real user-facing complaint.

---

## Deviations

**1 within-blast-radius deviation (EXECUTE, 17-08-26 — documented, no user gate needed):**

- **What deviated:** Checklist 3c.2 specified asserting `await screen.findByText('Progress')` in the new `/progress` routing test. EXECUTE instead used `await screen.findByRole('heading', { name: 'Progress' })`.
- **Why:** `/progress` renders inside `AppShell`, whose desktop sidebar renders a `<button>…Progress</button>` (`AppShell.tsx:862`) that is always in the DOM. `findByText('Progress')` matches BOTH that button and the page `<h2>Progress</h2>`, throwing a "multiple elements" error. The heading-role query uniquely targets the `<h2>` (the sidebar item is a button; `ExpandableTabs` only renders its title text when selected, so it is absent at mount).
- **Impact:** None on criterion coverage — proves the identical criterion C3 ("heading reads Progress"), more precisely. Classified as implementation-detail / library-call variation within the same semantic operation; the test file is inside Phase 3's declared blast radius. Test passes (file 5 → 6 cases green).
- **Not a hard-stop class:** no schema/auth/API/billing/container/secret surface involved.

---

## Phase Loop Progress

- [x] 1. RESEARCH — verified by direct source read this session: `leaderboard.ts`, `LeaderboardPage.tsx` (full file), `study.ts` (stats endpoint + `current_streak`/`learning_points` columns), `api.ts` (`getStudyStats`/`getLeaderboard` client methods), `AppShell.tsx` (nav labels already correct), `journeys.test.ts` (leaderboard test dependency found), `appshell-routing.test.tsx` (full file, no existing `/progress` coverage), `helpers.ts` (`seedUser` shape), `phase-blast-radius-registry.md`.
- [x] 2. INNOVATE — n/a, intentionally skipped. Design forks resolved by explicit user decisions this session (see Locked Decisions above): learning-only ranking + toggle deletion, Community heading untouched, personal-stats header reusing `/api/study/stats`.
- [x] 3. PLAN-SUPPLEMENT — this update. Rewrote Overview, Locked Decisions (new), Verified Findings (new), Phase Completion Rules, Acceptance Criteria, Blast Radius (corrected — dropped AppShell/SubjectsPage, added 2 test files), Implementation Checklist (3a-3c, atomic), Exit Gate, Verification Evidence, Test Infra Improvement Notes. Reconciled `phase-blast-radius-registry.md` Phase 3 section (see accompanying registry update).
- [x] 4. PVL — vc-validate-agent: full V1-V7 complete; validate-contract written (Gate: CONDITIONAL, accepted). Deep-mode direct source-read verification (not inference) confirmed every anchor/claim in the plan; found and fixed 1 concrete concern in-plan (test-precedent citation correction in Verified Findings/3c.1); discovered and documented 1 new pre-existing, out-of-blast-radius known-gap (`ProfileStats.tsx` rank-semantics side effect, Accepted Known-Gap 1). 0 unresolved FAILs.
- [x] 5. EXECUTE — implementation complete (17-08-26): 3a (ORDER BY swap + additive current_streak) + 3b (Progress page rewrite, toggle deleted, personal-stats header) + 3c (backend ordering test + frontend /progress test) all done. Gates: FE 29/29, BE 192/192, `npx tsc --noEmit` clean x2. Only the 4 blast-radius files touched. 1 within-blast-radius test deviation (findByRole heading — see ## Deviations). Report: `phase-3-community-progress_REPORT_25-07-26.md`.
- [x] 6. EVL — orchestrator confirmation run independently re-confirmed all 4 gates GREEN (FE 29/29, BE 192/192, tsc clean x2). C4 browser agent-probe remains waived (matches Phase 1/2 precedent, accepted known-gap). Source committed as `85cb8e0` (feat(study-loop): Phase 3 — Community + Progress metric flip).
- [x] 7. UPDATE PROCESS — this update (17-08-26). Report finalized, umbrella `## Current Execution State` reconciled, registry Phase 3 status set to DONE.

---

## Touchpoints

- `backend/src/routes/leaderboard.ts` — MODIFY (ORDER BY swap + additive `current_streak` SELECT column)
- `src/pages/LeaderboardPage.tsx` — MODIFY (heading, toggle removal, stats header)
- `backend/test/red-team/leaderboard-ranking.test.ts` — CREATE
- `src/app/__tests__/appshell-routing.test.tsx` — MODIFY

---

## Public Contracts

- `/api/leaderboard` endpoint: same path, same response shape (all existing fields retained, including `points`), different sort order only.
- `GET /api/study/stats`: UNCHANGED — reused as-is (existing contract, already consumed by `TodayPage.tsx`).
- Phase 1 routing: preserved.
- `src/lib/api.ts`: no changes — both `getLeaderboard()` and `getStudyStats()` already exist with the needed shapes.

---

## Verification Evidence

| Gate / Scenario                                                                                  | Strategy        | Proves SPEC criterion                           |
| ------------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------- |
| `npm test` exits 0                                                                               | Fully-Automated | No regressions (Criterion 6)                    |
| `npx tsc --noEmit` exits 0                                                                       | Fully-Automated | Types preserved (Criterion 7)                   |
| `cd backend && npm test` exits 0 (incl. `journeys.test.ts`'s existing `row.points` assertion)    | Fully-Automated | No regressions; SELECT retained (Criterion 8)   |
| `cd backend && npx tsc --noEmit` exits 0                                                         | Fully-Automated | Types preserved (Criterion 9)                   |
| `leaderboard-ranking.test.ts`: `/api/leaderboard` returns users sorted by `learning_points` DESC | Fully-Automated | Ranking swap correct (Criteria 1, 5)            |
| `appshell-routing.test.tsx`: `/progress` renders "Progress" heading, no toggle text present      | Fully-Automated | Heading rename + toggle removal (Criteria 2, 3) |
| Browser: `/progress` shows personal-stats header + learning-ranked list                          | Agent-Probe     | Full UX confirmation (Criteria 1-4)             |

---

## Test Infra Improvement Notes

This phase adds the first backend integration test dedicated to leaderboard ranking order (`leaderboard-ranking.test.ts`) — previously the only leaderboard coverage was `journeys.test.ts`'s single incidental assertion (`row.points >= 1`), which is order-insensitive and now serves purely as a passthrough regression guard for the retained `points` SQL column. This phase also adds the first frontend routing-test coverage for `/progress` — `LeaderboardPage` was previously untested at the routing level (confirmed via full-file read of `appshell-routing.test.tsx`).

---

## Inner Loop Refresh Note: 2026-08-16 — changed sections: Overview, Entry Gate, Locked Decisions (new), Verified Findings (new), Phase Completion Rules, Acceptance Criteria, Blast Radius, Implementation Checklist, Exit Gate, Blockers, Touchpoints, Public Contracts, Verification Evidence, Test Infra Improvement Notes, Phase Loop Progress. No prior validate-contract existed for this stub — this note documents the PLAN-SUPPLEMENT for V1's benefit on the next PVL pass regardless.

---

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/paperloop_25-07-26/phase-3-community-progress_PLAN_25-07-26.md`
- Last completed step: Phase Loop Progress Step 4 (PVL) — validate-contract written, Gate: CONDITIONAL (accepted)
- Validate-contract status: written — Gate: CONDITIONAL (accepted, `inner-pvl: phase-3`)
- Supporting context files loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`, umbrella plan, `phase-2-library-process_PLAN_25-07-26.md` (shape reference), `phase-blast-radius-registry.md`
- Next step for a fresh agent: Spawn `vc-execute-agent` (opus). Pass this plan file path explicitly.
- Execute-agent start instruction: implement in checklist order 3a → 3b → 3c; run the Exit Gate commands after 3a (backend-only subset: `cd backend && npm test` + `cd backend && npx tsc --noEmit`) and again after 3b/3c (full four-command set) — matching Checklist 3c.3's own instruction not to batch all steps to the end.

---

## Validate Contract

Status: CONDITIONAL
Date: 17-08-26
date: 2026-08-17
generated-by: inner-pvl: phase-3

Parallel strategy: sequential (deep-mode, single-context direct source-verification)
Rationale: 7-signal score 1/7 (S4 phase program only — no multi-package scope, no schema/API/auth surface change, no 3+ viable directions since INNOVATE was intentionally skipped, no explicit user request for depth, no high-risk class, only 4 files in blast radius) recommends sequential per the threshold table. User explicitly asked to keep this pass efficient and not over-fan-out. Executed as a single deep-mode sequential session: every claim in the plan (line anchors, endpoint shapes, existing-consumer search) was independently confirmed against the real files on disk via direct read and repo-wide grep, evidence-equivalent to a Layer 1+2 fan-out for a blast radius this size.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior                                                                                                                                                                                      | strategy                      | proving test                                                                                                                                            | gap-resolution |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| C1           | `/api/leaderboard` returns users `ORDER BY learning_points DESC, current_streak DESC` (not the notes/likes/upvotes formula)                                                                   | Fully-Automated               | `cd backend && npm test` — new `leaderboard-ranking.test.ts` (3c.1)                                                                                     | A              |
| C2           | `LeaderboardPage.tsx` no longer offers a Contributors/Top Learners toggle                                                                                                                     | Fully-Automated               | `npm test` — `appshell-routing.test.tsx` new `/progress` case, asserts `queryByText(/contributors/i)`/`queryByText(/top learners/i)` both absent (3c.2) | A              |
| C3           | `LeaderboardPage.tsx` heading reads "Progress" (not "Leaderboard")                                                                                                                            | Fully-Automated               | `npm test` — `appshell-routing.test.tsx` new `/progress` case, `findByText('Progress')` (3c.2)                                                          | A              |
| C4           | Personal-stats header (current_streak/learning_points/due_count) renders via `api.getStudyStats()`                                                                                            | Agent-Probe                   | Browser: navigate to `/progress`, confirm stat chips render with real values                                                                            | A              |
| C5           | Single learning_points-ranked list renders (no toggle, server-ordered)                                                                                                                        | Fully-Automated + Agent-Probe | C1 proves server ordering; Browser confirms visual single-list render                                                                                   | A              |
| C6           | `npm test` exits 0 (frontend, no regressions incl. new `/progress` case)                                                                                                                      | Fully-Automated               | `npm test`                                                                                                                                              | A              |
| C7           | `npx tsc --noEmit` exits 0 (frontend)                                                                                                                                                         | Fully-Automated               | `npx tsc --noEmit`                                                                                                                                      | A              |
| C8           | `cd backend && npm test` exits 0 (incl. `journeys.test.ts`'s existing `row.points >= 1` assertion — unaffected by the ORDER BY-only change since it looks up by `display_name`, not position) | Fully-Automated               | `cd backend && npm test`                                                                                                                                | A              |
| C9           | `cd backend && npx tsc --noEmit` exits 0 (backend)                                                                                                                                            | Fully-Automated               | `cd backend && npx tsc --noEmit`                                                                                                                        | A              |

gap-resolution legend:

- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a `strategy:` value here — the `ProfileStats.tsx` rank-semantics finding is a named residual row carried in Open Gaps below, not a proving strategy.

Legacy line form (retained so existing validate-contract consumers still parse):

- backend leaderboard ordering test: Fully-automated: `cd backend && npm test`
- frontend routing/toggle-removal test: Fully-automated: `npm test` (from repo root)
- typecheck frontend: Fully-automated: `npx tsc --noEmit`
- typecheck backend: Fully-automated: `cd backend && npx tsc --noEmit`
- browser verification: agent-probe: dev server smoke run (`/progress` heading, stats header, single ranked list, no Phase 1 regressions)

Failing stubs (for the 2 newly-introduced Fully-Automated scenario rows, to be written by execute-agent at 3c.1/3c.2):

C1 (`leaderboard-ranking.test.ts`):

```
test("GET /api/leaderboard returns users ordered by learning_points descending", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: leaderboard ORDER BY learning_points DESC")
})
```

C2/C3 (`appshell-routing.test.tsx`):

```
test("renders ProgressRoute (LeaderboardPage) at /progress with the Progress heading and no Contributors/Learners toggle", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: /progress renders Progress heading, no toggle")
})
```

Dimension findings:

- Infra fit: PASS — no container/infra/port/runtime surface touched; pure backend query-clause edit + frontend page rewrite reusing an existing endpoint. `/api/leaderboard` route registration (`backend/src/index.ts:803-805`) confirmed unchanged (no new if-block needed, matching the plan's claim that only the handler body changes).
- Test coverage: CONCERN — `leaderboard-ranking.test.ts` insertion approach (seed via `seedUser` + raw `UPDATE users SET learning_points = ?` via `env.DB`) is mechanically sound and matches a real, confirmed idiom in this test suite, but the plan's original citation for that precedent (`journeys.test.ts:47-54`) was inaccurate — those lines are `SELECT` reads, not an `UPDATE`. **Fixed in-plan at PVL** (see Verified Findings correction): re-cited to the real precedent at `journeys.test.ts:121` / `gaps-study-admin.test.ts:48` / `gaps-ratelimit-notes-idor.test.ts:79,93,106`. Every acceptance criterion has a Fully-Automated or Agent-Probe row — no criterion rests on Known-Gap alone (net-gate vacuous-green check: PASS).
- Breaking changes: CONCERN — `/api/leaderboard`'s response shape is confirmed unchanged (all fields retained, same path, same auth-none contract) — the plan's own Public Contracts claim holds. However, PVL discovered an UNLISTED downstream consumer: `src/components/ProfileStats.tsx` (via a separate `LeaderboardEntry` type in `src/types/index.ts:211-220`) computes a "Rank" badge via positional `findIndex` on the raw `api.getLeaderboard()` array order. This file is not in Blast Radius/Touchpoints and will have its "Rank" badge silently change meaning (contribution-rank → learning-rank) as a side effect of the `ORDER BY` swap, with zero test coverage of that semantic change. Not a technical break (no crash/type error/test failure) and directionally consistent with the phase's "Ranking = LEARNING-ONLY" intent, but undocumented until this PVL pass. **Documented as Accepted Known-Gap 1** (added to the plan this pass) rather than expanded into this phase's checklist, per the phase's minimal-scope intent.
- Security surface: PASS — `/api/leaderboard` confirmed unauthenticated-read both before and after (`backend/src/index.ts:803-805`, no token/auth check); no new security surface introduced by the `ORDER BY`/SELECT-additive change.
- Section 3a (backend ranking swap): PASS — mechanically feasible; SELECT list and computed `points` column confirmed retained exactly as claimed (`backend/src/routes/leaderboard.ts` read in full); `journeys.test.ts:59-61`'s `row.points >= 1` assertion confirmed order-insensitive (looks up the row by `display_name`, not array position) — will not regress.
- Section 3b (frontend Progress page rewrite): PASS — every cited line/range in `LeaderboardPage.tsx` (interface 9-18, `type LeaderboardTab` line 20, `activeTab` state line 29, `getContributionPoints`/`rankedLeaderboard` lines 31-41, heading line 77, tab-toggle block ~81-121, conditional subtitle ~123-133, per-row stat block ~220-264) confirmed exact via full-file read; repo-wide grep confirms none of `LeaderboardEntry`/`getContributionPoints`/`rankedLeaderboard`/`activeTab` (this file's local symbols) are imported or referenced anywhere outside `LeaderboardPage.tsx` itself, so the toggle deletion and interface trim are safe with no dangling references. Personal-stats header's `api.getStudyStats()` call confirmed to return the exact shape claimed (`src/lib/api.ts:710-716`, `backend/src/routes/study.ts:469-497`), matching `TodayPage.tsx`'s existing fetch pattern closely enough to mirror safely.
- Section 3c (Tests): CONCERN — mechanically feasible; `appshell-routing.test.tsx`'s hoisted `api` mock (confirmed, lines 29-44) already includes `getStudyStats` (used by `TodayPage`'s existing test), so adding `getLeaderboard` per 3c.2 is sufficient for the new `/progress` test to exercise the REAL `LeaderboardPage` component (unlike `ProcessPage`/`CaptureNotePage`, which are sentinel-mocked) — the personal-stats header fetch will resolve cleanly against the existing mock with no further changes needed. One inaccurate citation found and fixed in-plan (see Test coverage above).

Open gaps:

- Accepted Known-Gap 1 (`ProfileStats.tsx` "Rank" badge silently changes ranking meaning, discovered this PVL pass): known-gap: documented — pre-existing consumer, outside Phase 3's declared blast radius, not a technical break, directionally consistent with phase intent; candidate for a documentation/UX follow-up if it becomes a real complaint.

What this coverage does NOT prove:

- C1 (`leaderboard-ranking.test.ts`): proves the SQL ordering is correct for the 3 seeded users in that test; does not prove behavior at scale (100-row `LIMIT`) or tie-breaking behavior beyond the `current_streak` tiebreaker for exact `learning_points` ties among more than 2 users.
- C2/C3 (`appshell-routing.test.tsx` new case): proves the correct heading text renders and the toggle text is absent for the mocked `getLeaderboard`/`getStudyStats` fixtures (empty/zero data); does NOT prove the ranked-list rows themselves render correctly with real data, nor that the personal-stats header's chip values are visually correct (that is the Agent-Probe row, C4).
- `tsc`/regression rows: static types / no-regression only, not runtime correctness.
- C4 (Agent-Probe): manual, not automated; depends on a working dev server and a real logged-in session with real `learning_points`/`current_streak`/`due_count` values; not exercised by any automated gate.
- None of the automated or agent-probe rows prove or disprove the `ProfileStats.tsx` rank-semantics side effect (Known-Gap 1) — that consumer is entirely untouched and untested by this phase.

Gate: CONDITIONAL
Accepted by: session (autonomous inner-PVL pass, direct source-verification) — fixed-in-plan: test-precedent-citation-corrected (Test coverage / Section 3c, Verified Findings — `journeys.test.ts:47-54` → `journeys.test.ts:121` / `gaps-study-admin.test.ts:48` / `gaps-ratelimit-notes-idor.test.ts:79,93,106`); documented known-gap (out of Phase 3 blast radius, not introduced by this plan, not a technical break): profilestats-rank-badge-semantics-change (Known-Gap 1, newly added `## Accepted Known-Gaps` section).
