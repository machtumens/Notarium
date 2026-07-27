---
phase: phase-01-shell-today
date: 2026-07-26
status: COMPLETE
feature: paperloop
plan: process/general-plans/active/paperloop_25-07-26/phase-1-shell-today_PLAN_25-07-26.md
---

# Phase 1 — Shell + Today — EXECUTE Report

## TL;DR

Phase 1 is code-complete and all four automated gates are green (frontend 26/26, backend 184/184, `tsc` clean on both packages). This EXECUTE session **resumed a partially-completed prior session**: Steps A, B, C, E, F, G, H5, I were already implemented (uncommitted in the working tree) and verified correct here; the only two remaining items — **Step H (routing smoke tests)** and **Step D (delete the orphaned `HomePage.tsx`)** — were completed this session. No plan deviations. Two files changed this session: created `src/app/__tests__/appshell-routing.test.tsx`, deleted `src/app/HomePage.tsx`. Awaiting user browser verification (agent-probe C8/C9) before UPDATE PROCESS.

## What Was Done

### This session (the 2 remaining items)

- **`src/app/__tests__/appshell-routing.test.tsx` (CREATED)** — Steps H0–H4. Three routing smoke tests driving the real `<AppRoutes>` through `MemoryRouter` + a real `AuthContext.Provider`: (1) `/` authed → TodayPage, (2) `/review` authed → ReviewPageRoute, (3) `/` unauthed → redirect to `/login`. Step H0 satisfied: `vi.mock('@/components/ui/beams-background', () => ({ BeamsBackground: () => null }))` (jsdom can't run the Three.js/WebGL background). Followed the repo's established mock conventions exactly (`vi.hoisted` api stub mirroring `Signup.test.tsx`; `@/` alias `vi.mock` mirroring the existing `shader-animation` mock). Stubbed the self-fetching lazy page bodies (`ReviewPage`, `Login`) to stable sentinels so the tests assert routing wiring, not page internals or network.
- **`src/app/HomePage.tsx` (DELETED)** — Step D. The prior session migrated `SubjectNotesPage` off its `subject`/`onBack` props but left the orphaned `HomePage.tsx` still rendering `<SubjectNotesPage subject=... onBack=.../>`, which broke `tsc` (TS2322). Step D1 grep confirmed zero code imports of `HomePage` (only a comment reference in `AppShell.tsx`), so Step D2 Option D-B (delete) applied. Resolved the typecheck error; `lazyPages.ts` confirmed clean (Step D3, HomePage was never exported there).

### Verified from the prior session (in blast radius, self-reviewed against the plan)

- **`src/components/AppShell.tsx` (CREATE, Steps A1–A8)** — full shell extraction with `<Outlet/>`; desktop `ExpandableTabs` `onChange` maps index→route (`['/', '/community', '/progress', '/chat', '/quiz', '/review']` + conditional Admin/Ops + My Notes/Logout offset, preserving the original cursor logic); mobile menu uses explicit per-item `go('/route')`; active tab derived from `location.pathname`. All shell behaviors preserved: BeamsBackground, nav, hamburger/mobile overlay, notification bell + 60s poll, profile editor/stats modals, founders modal, theme listener + forceUpdate, warning/suspension banners, footer, logout.
- **`src/app/AppRoutes.tsx` (MODIFY, Steps B1–B6)** — layout route `<ProtectedRoute><AppShell/></ProtectedRoute>` wrapping `/`, `/community`, `/community/:subjectId`, `/progress`, `/chat`, `/quiz` (ComingSoonPage stub, not blank), `/admin` (nested in `AdminRoute` — B2 explicit), `/ops` (nested in `OpsRoute`). Standalone `/review`, `/my-notes`, `/settings` and all auth routes preserved.
- **`src/app/lazyPages.ts` (MODIFY, Steps C1–C2)** — `TodayPage` lazy export present; no removals.
- **`src/pages/TodayPage.tsx` (CREATE, Steps E1–E8)** — uses the PVL-corrected field names (`current_streak`, `longest_streak`, `learning_points`, `due_count` from `/api/study/stats`; `items[]` from `/api/reviews/due`; `/api/notes/my-notes` with `.slice(0,3)`); loading spinner + `toast.error`; named local types, no `any`; default export.
- **`src/app/routes/ShellPageRoutes.tsx` (CREATE — prior session addition)** — `CommunityRoute`/`ProgressRoute` thin wrappers supplying `isLoading`/`setIsLoading` (+ navigate-based `onSelectSubject`) so `SubjectsPage`/`LeaderboardPage` mount as standalone routes without signature changes. Satisfies Step F12/F13.
- **`src/pages/SubjectNotesPage.tsx` (MODIFY, Steps G1–G4)** — reads `subjectId` from `useParams()`, self-fetches the subject via `api.getSubjects()` and finds by id, `onBack` → `navigate('/community')`, props removed from interface.
- **`backend/src/routes/study.ts` (MODIFY 1 line, Step I)** — `export function computeSm2` present at line 42.
- **`backend/src/__tests__/study.test.ts` (CREATE, Step H5)** — imports `{ computeSm2 }`; asserts quality=5 → `interval_days:1`, `ease_factor>=2.5`, `repetitions:1`; plus a failure-case test (quality<3 resets + 1.3 floor).

## What Was Skipped or Deferred

- Nothing in Phase 1 scope was skipped. All Steps A–I are complete.
- Agent-probe browser verification (C8/C9 — Exit Gate manual checklist) is NOT automatable in this environment; deferred to user browser confirmation per the plan's Phase Completion Rules #4 (a phase is not complete on code-complete alone — user browser confirmation required).

## Test Gate Outcomes

| Gate               | Command                          | Result                                                                                              |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Frontend tests     | `npm test` (repo root)           | **PASS** — `Test Files 7 passed (7)`, `Tests 26 passed (26)`. New routing suite: 3/3 pass.          |
| Frontend typecheck | `npx tsc --noEmit` (repo root)   | **PASS** — 0 errors (after HomePage.tsx deletion).                                                  |
| Backend tests      | `cd backend && npm test`         | **PASS** — `Test Files 25 passed (25)`, `Tests 184 passed (184)`. `computeSm2` unit test: 2/2 pass. |
| Backend typecheck  | `cd backend && npx tsc --noEmit` | **PASS** — 0 errors.                                                                                |

Verbatim pass lines:

- Frontend: `Test Files  7 passed (7)` / `Tests  26 passed (26)`
- Backend: `Test Files  25 passed (25)` / `Tests  184 passed (184)`
- computeSm2 (explicit): `✓ src/__tests__/study.test.ts > computeSm2 > quality=5 ...` / `✓ ... quality<3 ...` — `Tests  2 passed (2)`

New routing smoke tests (all ✓):

- `renders TodayPage at / for an authenticated user (new default landing)` — 491ms
- `renders ReviewPageRoute at /review for an authenticated user (preserved route)` — 312ms
- `redirects an unauthenticated user at / to /login` — 310ms

Acceptance Criterion 10 (≥26 frontend tests): met exactly (23 baseline + 3 new = 26).

## Plan Deviations

None. Both actions taken this session (write the routing test file; delete the orphaned `HomePage.tsx`) are explicit plan steps (Step H and Step D respectively). `HomePage.tsx` is listed as MODIFY/DELETE in Blast Radius, Touchpoints, and Step D — deletion is the sanctioned Option D-B outcome. All files touched remain inside the validate-contract blast radius.

## Test Infra Gaps Found

- **Frontend coverage still below 80%** — carried-forward known gap, documented in `process/context/tests/all-tests.md` and the plan's Test Infra notes. Phase 1 adds the first route-render coverage (3 tests) + the first direct SM-2 unit test (2 tests) but does not close the threshold. Each subsequent phase should add ≥1 smoke test per new page.
- **No e2e / Playwright** — no browser-driven tests in this repo. Agent-probe tier (C8/C9) covers Phase 1 browser verification manually; not automated.

## OUT-OF-SCOPE working-tree changes (flagged, NOT touched)

The working tree contained pre-existing uncommitted changes to **auth/schema/migration surfaces** that are Phase 1 hard-stop classes and on the plan's explicit "do NOT touch" list. I left them entirely alone:

- `backend/src/lib/auth.ts` (+89 lines), `backend/src/lib/db.ts` (+8), `backend/src/lib/env.ts` (+2)
- `backend/migrations/0015_add_firebase_uid.sql` (new — schema migration)
- `backend/test/red-team/gaps-auth-rbac.test.ts`, `gaps-ratelimit-notes-idor.test.ts`, `gaps-study-admin.test.ts` (new), `provider-mocks.test.ts` + README (modified)

These predate this session and are unrelated to Phase 1. **Recommend the user review/commit them separately** — they should not be bundled into the Phase 1 commit. (They are currently green under the backend suite, so they do not block Phase 1 gates.)

## Closeout Packet

- **Selected plan path:** `process/general-plans/active/paperloop_25-07-26/phase-1-shell-today_PLAN_25-07-26.md`
- **What was finished:** All Phase 1 code (Steps A–I). All 4 automated gates green.
- **Verified vs unverified:** Automated gates fully verified (frontend/backend tests + typecheck). Agent-probe browser flow (C8/C9) unverified — requires a running dev server + auth credentials + user confirmation.
- **Cleanup/context capture remaining:** UPDATE PROCESS (archive plan when user confirms browser verification; update umbrella `## Current Execution State`; commit Phase 1 files — excluding the out-of-scope backend/auth changes above).
- **Single best next valid state:** `Keep in active/testing` — code-complete and green, but the plan's Phase Completion Rules require user browser confirmation (agent-probe) before archival. The orchestrator's EVL confirmation run (independent vc-tester re-run of the 4 gates) should run next.

## Forward Preview

### Test Infra Found

- vitest (frontend jsdom via root `vitest.config.ts`, setup `src/test/setup.ts`; backend `@cloudflare/vitest-pool-workers` via `backend/vitest.config.ts`).
- Mock conventions locked for future frontend route tests: `vi.hoisted` api stub + `vi.mock('../../lib/api', () => ({ default: api }))`; `@/`-alias `vi.mock` for WebGL/canvas components (`beams-background`, `shader-animation`); `AuthContext.Provider` + `MemoryRouter` for auth-gated route rendering.
- `AuthContextType` lives in `src/app/types.ts` (NOT `src/types/`); import as `../types` from `src/app/__tests__/`.

### Blast Radius Changes

- `src/app/HomePage.tsx` no longer exists — future work must not reference it. The shell now lives in `src/components/AppShell.tsx`; routes in `src/app/AppRoutes.tsx`; shell-page wrappers in `src/app/routes/ShellPageRoutes.tsx`.
- New default landing `/` = TodayPage. Phase 2's `/notes/:id/process` route slots into the same `<AppShell>` layout-route block.

### Commands to Stay Green

- Frontend: `npm test` + `npx tsc --noEmit` (repo root).
- Backend: `cd backend && npm test` + `cd backend && npx tsc --noEmit`.

### Dependency Changes

- None. Zero new packages. Zero backend API/endpoint changes (only the `export` keyword added to an existing internal function in a prior session).

---

## UPDATE PROCESS Closeout (2026-07-26)

**Closeout classification:** `Keep in active/testing` — Phase 1 plan stays in `active/` task folder; the whole program is mid-flight (4 phases remaining). Phase plan is NOT archived to `completed/` until the full program finishes.

**SPEC Achievement:**

- C1 (TodayPage at /): MET — routing smoke test green
- C2 (ReviewPageRoute at /review): MET — routing smoke test green
- C3 (unauthenticated redirect): MET — routing smoke test green
- C4 (frontend tsc clean): MET — `npx tsc --noEmit` exits 0
- C5 (backend regression clean): MET — `cd backend && npm test` 184/184
- C6 (backend tsc clean): MET — `cd backend && npx tsc --noEmit` exits 0
- C7 (computeSm2 unit test): MET — 2/2 tests green
- C8 (browser TodayPage with real data, all tabs): UNMET — waived by user this session; accepted known-gap (automated routing smoke tests accepted in lieu). Not an open blocker.
- C9 (browser shell behaviors — hamburger, notifications, profile, logout): UNMET — waived by user this session; accepted known-gap. Not an open blocker.

**Known gaps (accepted):**

- C8/C9 browser verification: user consciously waived; accepted known-gap; automated routing smoke tests are the acceptance basis.
- Frontend test coverage below 80%: pre-existing known-gap; Phase 1 adds 4 tests, does not close threshold.
- No Playwright/e2e CI: pre-existing known-gap; agent-probe tier is the browser coverage strategy.

**Drift score:** MEDIUM (2 signals: ≥1 file touched [signal a], 3+ memory-worthy observations [signal c] — new mock conventions, API field names, ShellPageRoutes pattern)
Recommend UPDATE PROCESS -- significant changes detected.

**Phase plan stays in active/:** Phase 1 plan and report remain at `process/general-plans/active/paperloop_25-07-26/` — the full task folder moves as a unit only after the program completes.

**Process commit note:** This UPDATE PROCESS update is a process-only commit (plan status, registry, report, umbrella state). The Phase 1 execution commit (source files) is a SEPARATE commit and must be committed before Phase 2 begins — see umbrella hard safety constraint.

**Next action:** Phase 2 Step 0 RESEARCH — spawn vc-research-agent for `phase-2-library-process_PLAN_25-07-26.md`. Confirm execution commit for Phase 1 source files is made first (separate from this process commit).
