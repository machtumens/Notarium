---
name: plan:paperloop-phase-01-shell-today
description: 'Paperloop — Phase 1: Extract AppShell, migrate tab-state to routes, build TodayPage, flip default landing'
date: 25-07-26
metadata:
  node_type: memory
  type: plan
  feature: paperloop
  phase: phase-01
---

# Phase 1 — Shell + Today

**Program:** paperloop
**Umbrella plan:** `process/general-plans/active/paperloop_25-07-26/paperloop-umbrella_PLAN_25-07-26.md`
**Date** 25-07-26
**Status** ✅ COMPLETE — EVL PASS (browser C8/C9 waived, accepted known-gap)
**Complexity** COMPLEX
**Report destination:** `process/general-plans/active/paperloop_25-07-26/phase-1-shell-today_REPORT_25-07-26.md`

---

## Overview

Extract the ~1200-line `src/app/HomePage.tsx` shell (nav, ExpandableTabs bottom-nav, mobile hamburger menu, notification bell, profile editor/stats, warning/suspension banners, footer) into a new reusable `src/components/AppShell.tsx` layout component that renders `<Outlet/>` for page content. Migrate the `currentPage` tab-state switch into real react-router-dom v6 layout routes in `src/app/AppRoutes.tsx`. Build a new `src/pages/TodayPage.tsx` as the personal study dashboard. Flip the default landing at `/` from subjects → Today. Zero backend changes. All existing behaviors must be preserved.

---

## Entry Gate

- No prerequisites — this is Phase 1 and the program start.
- Repo is at HEAD 640e66b, `npm test` passes 23 frontend tests, `npx tsc --noEmit` is clean.

---

## Architecture Decision: Layout Route Pattern

**Chosen:** react-router-dom v6 layout route with `<Outlet/>`.

AppRoutes.tsx gains a top-level layout route:

```
<Route element={<AppShell />}>
  <Route path="/" element={<TodayPage />} />
  <Route path="/community" element={<SubjectsPage />} />
  <Route path="/community/:subjectId" element={<SubjectNotesPage />} />
  <Route path="/progress" element={<LeaderboardPage />} />
  <Route path="/chat" element={<ChatPage />} />
  <Route path="/admin" element={<AdminPage />} />
  <Route path="/ops" element={<OpsDashboard />} />
</Route>
```

**Rejected:** keeping tab-state in HomePage.tsx — violates routing hygiene, makes deep-linking impossible, and prevents clean Phase 2 /notes/:id/process route.

**Important nuance — subjects tab-state paths:** The current tab-state uses `currentPage` to switch between SubjectsPage and SubjectNotesPage within the shell. Phase 1 MUST convert these to URL routes (e.g. `/community` and `/community/:subjectId`) so the existing `handleSelectSubject` navigation becomes real `navigate()` calls. The old `handleSelectSubject(subject)` sets currentPage = 'subject-notes' and currentSubject = subject; this maps to `navigate('/community/' + subject.id)`.

**Subject state:** `SubjectNotesPage` currently receives `currentSubject` as a prop from HomePage. After migration, it must read the subject from the URL param (`:subjectId`) and fetch it independently or receive it from a loader. Phase 1 simple approach: SubjectNotesPage fetches from `/api/subjects` by id from `useParams()`.

**Chat route:** The chat tab (ChatPage) gets a real URL `/chat` in Phase 1. It will be REMOVED in Phase 4. Phase 1 just moves it to a proper route — do not remove it yet.

**ExpandableTabs nav:** The ExpandableTabs component currently drives `currentPage` state. After migration, each tab item's `onClick` calls `navigate(path)` instead of `setCurrentPage(...)`.

---

## Phase Completion Rules

Phase 1 is complete when:

1. All 4 automated test gate commands exit 0 (see Exit Gate below)
2. The new routing smoke tests pass (TodayPage at `/`, ReviewPage at `/review`, unauthenticated redirect)
3. The `computeSm2` unit test passes
4. Manual browser verification checklist is confirmed by user (all tabs reachable, mobile menu works, all shell behaviors preserved)
5. vc-validate-agent has written the Validate Contract section in this plan (Gate: PASS or accepted CONDITIONAL)
6. Phase 1 report written and umbrella Current Execution State updated

A phase is NOT complete on code-complete alone. All test gates AND user browser confirmation are required.

---

## Acceptance Criteria

1. Navigating to `/` in a browser shows TodayPage (streak, due count, due-card preview, recent notes) — not SubjectsPage
2. All nav tabs (Today, Community, Progress, Chat, Admin, Ops) navigate to correct routes via react-router-dom `navigate()`; no tab-state switch remains
3. `/review` still renders ReviewPageRoute (standalone, not wrapped in AppShell)
4. `/my-notes` and `/settings` still render correctly
5. Mobile hamburger menu opens/closes and closes on nav item click
6. Notification bell polling (60s interval) still functions
7. Profile editor, profile stats, founders modal all still open from AppShell
8. Theme change listener fires correctly
9. Warning/suspension banners still display for affected users
10. `npm test` exits 0 with ≥10 tests passing (existing 23 + 3 new routing smoke tests + 1 computeSm2 test minimum)
11. `npx tsc --noEmit` exits 0 (frontend)
12. `cd backend && npm test` exits 0 (no regressions)
13. `cd backend && npx tsc --noEmit` exits 0

---

## Blast Radius

**Files modified:**

- `src/app/HomePage.tsx` — gutted: remove all shell/nav/tab-switch code; after extraction this file has minimal or no content
- `src/app/AppRoutes.tsx` — add layout route wrapping AppShell; nest content routes; convert `/` to TodayPage; add `/community`, `/community/:subjectId`, `/progress`, `/chat`, `/admin`, `/ops` routes
- `src/app/lazyPages.ts` — add `TodayPage` lazy export
- `src/pages/SubjectNotesPage.tsx` — prop→useParams() migration for subjectId
- `backend/src/routes/study.ts` — add `export` keyword to `computeSm2` function (required for unit test import)

**Files created:**

- `src/components/AppShell.tsx` — new: contains all shell UI extracted from HomePage.tsx
- `src/pages/TodayPage.tsx` — new: streak, due count, due-card preview, recent notes
- `src/app/__tests__/appshell-routing.test.tsx` — new: routing smoke tests
- `backend/src/__tests__/study.test.ts` — new: computeSm2 unit test

**Files explicitly unchanged (do NOT touch):**

- `src/app/ReviewPageRoute.tsx` — standalone, remains exactly as-is
- `src/app/AuthProvider.tsx`, `src/app/AuthContext.ts` — auth untouched
- `src/app/routes/ProtectedRoute.tsx`, `AdminRoute.tsx`, `OpsRoute.tsx` — unchanged
- All `src/pages/*` except TodayPage.tsx (new) and SubjectNotesPage.tsx (prop migration)
- All other backend files — zero backend changes in Phase 1 except the computeSm2 export
- `backend/test/red-team/I-chat-study.test.ts` — untouched until Phase 4

---

## Detailed Touchpoints

| File                                          | Action          | Why                                                                                            |
| --------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| `src/app/HomePage.tsx`                        | MODIFY (gutted) | Remove shell/nav/tab-switch; after extraction this file has minimal or no content              |
| `src/app/AppRoutes.tsx`                       | MODIFY          | Add layout route with AppShell + nested content routes; convert `/` to TodayPage               |
| `src/app/lazyPages.ts`                        | MODIFY          | Add TodayPage lazy export                                                                      |
| `src/components/AppShell.tsx`                 | CREATE          | Full shell extraction: nav, hamburger, notifications, profile, banners, footer, ExpandableTabs |
| `src/pages/TodayPage.tsx`                     | CREATE          | Personal study dashboard (streak + due count + due-cards + recent notes)                       |
| `src/pages/SubjectNotesPage.tsx`              | MODIFY          | prop→useParams() migration for subjectId                                                       |
| `src/app/__tests__/appshell-routing.test.tsx` | CREATE          | Routing smoke tests                                                                            |
| `backend/src/__tests__/study.test.ts`         | CREATE          | computeSm2 unit test (baseline)                                                                |
| `backend/src/routes/study.ts`                 | MODIFY (1 line) | Add `export` to `computeSm2` function declaration                                              |

---

## Implementation Checklist

### Step A — Create AppShell.tsx (extract shell from HomePage.tsx)

The shell is everything in HomePage.tsx EXCEPT the content switch (SubjectsPage / SubjectNotesPage / LeaderboardPage etc.). Extract to a new file, preserve every UI piece.

- [ ] A1. Create `src/components/AppShell.tsx`. Import all the same deps currently imported by HomePage.tsx that are shell-related: `ExpandableTabs`, `BeamsBackground`, `NotificationPanel`, `ProfileEditor`, `ProfileStats`, `FoundersModal`, `useAuth`, `useTheme`, `darkThemeStyles`, `Bell`, `LogOut`, etc.
- [ ] A2. Move the shell state into AppShell: `isMobileMenuOpen`, `isMobile`, `showProfileEditor`, `showProfileStats`, `showFoundersModal`, `showNotifications`, `unreadCount`, `loading`. Keep the `forceUpdate` theme-change listener. Keep the notification polling `useEffect`.
- [ ] A3. Move the nav JSX (fixed nav bar, hamburger button, logo, desktop nav links, notification bell, user avatar, logout button) into AppShell. Move the mobile menu overlay. Move the warning/suspension banner. Move the footer. Move the `BeamsBackground`.
- [ ] A4. Replace the content area (the `if (currentPage === 'subjects')` switch) with `<Outlet />` from `react-router-dom`. AppShell renders the shell + `<Outlet />` only; all page components are rendered by the router.
- [ ] A5. The ExpandableTabs component currently calls `setCurrentPage(...)`. Replace each tab's `onClick` with `navigate(path)` from `useNavigate()`. Tab items: Today (`/`), Community (was Subjects, navigate to `/community`), Progress (was Leaderboard, navigate to `/progress`), Chat (`/chat`), leave a placeholder "Tests" tab that navigates to `/quiz` but renders a "Coming soon" stub route (not blank). Admin and Ops tabs: keep as-is, navigate to `/admin` and `/ops`.
- [ ] A6. Determine active tab from `useLocation()` pathname instead of `currentPage` state. Update any tab highlighting logic to use `location.pathname` matching.
- [ ] A7. Export AppShell as a named export: `export function AppShell() { ... }`.
- [ ] A8. Add TypeScript type for AppShell props (none needed — no props; AppShell reads everything from auth context and URL).

### Step B — Update AppRoutes.tsx (add layout route + nested content routes)

- [ ] B1. Import `AppShell` from `../components/AppShell`. Also import `AdminRoute` from `./routes/AdminRoute` (needed for Step B2).
- [ ] B2. Add the layout route wrapping AppShell around all content routes that should render inside the shell. The `/admin` route MUST be nested inside `AdminRoute` for route-level auth enforcement (not just nav-level). Structure:
  ```
  <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
    <Route path="/" element={<TodayPage />} />
    <Route path="/community" element={<SubjectsPage />} />
    <Route path="/community/:subjectId" element={<SubjectNotesPage />} />
    <Route path="/progress" element={<LeaderboardPage />} />
    <Route path="/chat" element={<ChatPage />} />
    <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
    <Route path="/ops" element={<OpsRoute><OpsDashboard /></OpsRoute>} />
  </Route>
  ```
  Note: `/ops` already uses `OpsRoute` in the current flat structure — preserve that wrapper.
- [ ] B3. Remove the existing `<Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />` flat route — it is replaced by the layout route above.
- [ ] B4. Keep all non-shell routes exactly as-is: `/login`, `/admin-login`, `/signup`, `/suspended`, `/pwd-reset`, `/auth/callback`, `/settings`, `/my-notes`, `/review`.
- [ ] B5. Lazy-import `TodayPage`, `SubjectsPage`, `SubjectNotesPage`, `LeaderboardPage`, `ChatPage`, `AdminPage` from `./lazyPages` (they are already there except TodayPage — add TodayPage).
- [ ] B6. Remove the import of `HomePage` from AppRoutes.tsx (HomePage is being gutted; the named export may be kept as a redirect shim or removed — see Step D).

### Step C — Update lazyPages.ts (add TodayPage lazy export)

- [ ] C1. Add: `export const TodayPage = lazy(() => import('../pages/TodayPage'));`
- [ ] C2. Verify existing lazy exports are still valid. No removals in Phase 1.

### Step D — Handle HomePage.tsx after extraction

After extraction, `src/app/HomePage.tsx` may be:

- Option D-A: reduced to a redirect `<Navigate to="/" replace />`.
- Option D-B: deleted entirely if AppRoutes.tsx no longer imports it.

Choose Option D-B (delete) if no imports remain. If AppRoutes still imports `HomePage` for any reason, reduce to Option D-A. **Execution agent decision:** check imports before deleting.

- [ ] D1. After Step B is complete, search for any remaining imports of `HomePage` across the codebase: `grep -r "HomePage" src/`.
- [ ] D2. If no imports remain: delete `src/app/HomePage.tsx`. If imports remain: reduce to a redirect shim.
- [ ] D3. Update `src/app/lazyPages.ts` if `HomePage` was exported there (it currently is NOT in lazyPages.ts — verify).

### Step E — Create TodayPage.tsx

TodayPage is the new personal study dashboard. It uses ONLY existing API endpoints — zero new backend.

**Verified endpoint shapes (confirmed by PVL agent reading backend/src/routes/study.ts):**

- `GET /api/study/stats` — actual response: `{ current_streak: number, longest_streak: number, learning_points: number, due_count: number }`. NOTE: the plan previously listed wrong field names (`streak`, `total_xp`, `cards_due_today`) — use the corrected names above.
- `GET /api/reviews/due` — returns `{ items: StudyItem[], due_count: number }`. Use `items` array for the preview strip.
- `GET /api/notes/my-notes` — returns user's own notes list. NOTE: the plan previously listed wrong URL `/api/notes?my=true&limit=3` — use `/api/notes/my-notes` instead. Add client-side `.slice(0, 3)` for the 3-note preview.

- [ ] E1. Create `src/pages/TodayPage.tsx`.
- [ ] E2. Implement study stats fetch: call `api.request<{ current_streak: number; longest_streak: number; learning_points: number; due_count: number }>('/api/study/stats', { method: 'GET' })`.
- [ ] E3. Implement due cards fetch: call `api.request<{ items: DueCard[]; due_count: number }>('/api/reviews/due', { method: 'GET' })`. Use `response.items.slice(0, 3)` for the preview strip.
- [ ] E4. Implement recent notes fetch: call `api.request<{ notes: Note[] }>('/api/notes/my-notes', { method: 'GET' })`. Use `response.notes.slice(0, 3)` for the preview.
- [ ] E5. Render: streak count (large number) + streak label. Due count with a "Start Review" button linking to `/review`. Due cards preview strip (3 cards, each shows question_text truncated to 80 chars). Recent notes strip (3 notes, each shows title and subject). Apply the same `darkThemeStyles` + `currentTheme` pattern used in other pages.
- [ ] E6. Handle loading state (spinner) and error state (toast.error) following the existing pattern.
- [ ] E7. Export as named: `export function TodayPage() { ... }`.
- [ ] E8. TypeScript: define local types for stats and due-card response shapes (do not use `any`). Use the confirmed field names: `current_streak`, `learning_points`, `due_count`.

### Step F — Preserve all shell behaviors (verification checklist during implementation)

This step is a reminder list to check during Steps A–E, not separate code changes.

- [ ] F1. Notification bell and unread count polling (60s interval) — must be in AppShell, not lost.
- [ ] F2. Mobile hamburger menu: opens/closes overlay, closes on nav, closes on resize to desktop — all in AppShell.
- [ ] F3. Profile editor modal (`showProfileEditor`, `setShowProfileEditor`) — in AppShell, triggered by avatar click.
- [ ] F4. Profile stats modal (`showProfileStats`, `setShowProfileStats`) — in AppShell.
- [ ] F5. Founders modal (`showFoundersModal`, `setShowFoundersModal`) — in AppShell.
- [ ] F6. Theme change listener (`window.addEventListener('themeChange', ...)`) + `forceUpdate` — in AppShell.
- [ ] F7. Warning banner (user.warned state check) — in AppShell (verify field names from types).
- [ ] F8. Suspension banner (user.suspended) — verify: if `/suspended` page already handles this, check whether the banner in HomePage.tsx is redundant or additive. Preserve behavior.
- [ ] F9. Logout button (calls `logout()` from useAuth) — in AppShell.
- [ ] F10. `BeamsBackground` fixed overlay — in AppShell, same z-index structure.
- [ ] F11. `darkThemeStyles` injection — in AppShell.
- [ ] F12. Subjects data loading (`loadSubjects()`) — CRITICAL: before removing `loadSubjects` from AppShell, read `src/pages/SubjectsPage.tsx` to verify it self-fetches subjects. If SubjectsPage does NOT self-fetch (relies on props), add a `useEffect` fetch to SubjectsPage before removing the AppShell call. Do not skip this check — missing subjects fetch will render an empty page.
- [ ] F13. `handleSelectSubject` and `handleBackToSubjects` — replace with `navigate('/community/' + subject.id)` and `navigate('/community')` in SubjectsPage/SubjectNotesPage respectively; remove from AppShell entirely.

### Step G — SubjectNotesPage prop migration

Currently SubjectNotesPage receives `currentSubject` as a prop from HomePage. After layout route migration, it reads from URL params.

- [ ] G1. Read `src/pages/SubjectNotesPage.tsx` to confirm how it currently uses the `currentSubject` prop.
- [ ] G2. Replace the `currentSubject` prop with `useParams()` to get `:subjectId`. The subjectId from the URL is a string — use it to fetch the subject from `/api/subjects` (GET all subjects, then find by id), or display the subject name from a separate `/api/subjects/:id` endpoint if it exists. Do NOT try to read the subject name from the URL — only the id is in the URL path.
- [ ] G3. Remove the `currentSubject` prop type from SubjectNotesPage's interface.
- [ ] G4. Update `handleBackToSubjects` navigation: SubjectNotesPage calls `navigate('/community')` via its own back button instead of calling a prop callback.

### Step H — Create routing smoke tests

- [ ] H0. (REQUIRED FIRST) Add jsdom mock for `BeamsBackground` at the top of the test file (before any imports). Without this mock, jsdom will throw on Three.js WebGL usage: `vi.mock('@/components/ui/beams-background', () => ({ BeamsBackground: () => null }))`. Also mock any other Three.js / Rive / canvas components used in AppShell if they throw in jsdom.
- [ ] H1. Create `src/app/__tests__/appshell-routing.test.tsx`.
- [ ] H2. Write test: `renders TodayPage at /` — render `<MemoryRouter initialEntries={['/']}>` + `<AppRoutes />` inside a mock `<AuthProvider>`. Assert that `<TodayPage />` is rendered.
- [ ] H3. Write test: `renders ReviewPageRoute at /review` — same pattern, assert ReviewPage rendered.
- [ ] H4. Write test: `redirects unauthenticated user at / to /login` — render with unauthenticated user. Assert redirect to `/login`.
- [ ] H5. Write a baseline unit test for `computeSm2` in `backend/src/__tests__/study.test.ts` (new file). Import `{ computeSm2 }` from `../routes/study`. Call `computeSm2({ ease_factor: 2.5, interval_days: 1, repetitions: 0 }, 5)`. Assert result has `ease_factor >= 2.5` and `interval_days === 1`.

### Step I — Export computeSm2 (prerequisite for Step H5)

This step MUST be done before Step H5 or the import will fail at compile time.

- [ ] I1. In `backend/src/routes/study.ts` line 42, change `function computeSm2(prev: Sm2State, quality: number): Sm2Result {` to `export function computeSm2(prev: Sm2State, quality: number): Sm2Result {`. This is a single-word addition (`export`). Verify no other callers in the file are affected (only `gradeReview` and `gradeRecall` call it internally — they will continue to work).

---

## Exit Gate

```bash
# 1. Frontend tests (from repo root)
npm test
# Expected: all tests pass (≥ 26 tests: existing 23 + 3 new smoke tests + 1 computeSm2); exit code 0

# 2. Frontend typecheck (from repo root)
npx tsc --noEmit
# Expected: 0 errors, exit code 0

# 3. Backend tests (regression guard only — minor export change)
cd backend && npm test
# Expected: all existing tests pass; exit code 0

# 4. Backend typecheck
cd backend && npx tsc --noEmit
# Expected: 0 errors, exit code 0
```

Manual verification checklist (agent-probe tier):

- [ ] Browser: navigate to `/` — TodayPage renders (streak, due count, due cards preview, recent notes visible)
- [ ] Browser: click "Today" tab in ExpandableTabs — stays on `/`, TodayPage visible
- [ ] Browser: click "Community" tab — navigates to `/community`, SubjectsPage renders
- [ ] Browser: click a subject in SubjectsPage — navigates to `/community/:subjectId`, SubjectNotesPage renders
- [ ] Browser: click back in SubjectNotesPage — navigates to `/community`
- [ ] Browser: click "Progress" tab — navigates to `/progress`, LeaderboardPage renders
- [ ] Browser: click "Chat" tab — navigates to `/chat`, ChatPage renders
- [ ] Browser: navigate to `/review` — ReviewPageRoute renders
- [ ] Browser: navigate to `/my-notes` — MyNotesPage renders
- [ ] Browser: navigate to `/settings` — SettingsPage renders
- [ ] Browser: click hamburger on mobile viewport — mobile menu opens; clicking a nav item closes it
- [ ] Browser: click notification bell — NotificationPanel opens
- [ ] Browser: click user avatar — ProfileEditor opens
- [ ] Browser: logout button works (redirects to /login)
- [ ] Browser: warning/suspension banner shows for affected user (or absent for normal user)

---

## Blockers That Would Justify BLOCKED Status

- `SubjectNotesPage` has a deeply coupled prop interface that cannot be refactored to URL params without extensive rewrite (route to PLAN supplement if discovered)
- `ExpandableTabs` component has internal routing logic that conflicts with `useNavigate()` (investigate before coding)
- `computeSm2` unit test reveals the function has an incorrect signature or is not importable from outside its module (skip H5, route to Phase 4)
- TypeScript strict mode rejects the AppShell extraction due to prop type mismatches (fix inline — not a blocker, just additional checklist items)

---

## Phase Loop Progress

Orchestrator reads this before deciding which subagent to spawn next. The canonical 7-step inner loop `R → I → P → PVL → E → EVL → UP` SKIPS SPEC.

- [x] 1. RESEARCH — completed via PLAN session context loading (all-context.md, tests/all-tests.md, file structure scan, HomePage.tsx read)
- [x] 2. INNOVATE — approach decided: layout route with Outlet (see Architecture Decision above)
- [x] 3. PLAN-SUPPLEMENT — this plan IS the supplement; Inner Loop Refresh Note: n/a — first plan write
- [x] 4. PVL — vc-validate-agent: full V1–V7 complete; validate-contract written (Gate: CONDITIONAL, accepted)
- [x] 5. EXECUTE — all checklist items done; per-section test gates run and green (26/26 frontend, 184/184 backend, tsc clean both). Resumed a partially-complete prior session: only Step H (routing smoke tests) and Step D (delete orphaned HomePage.tsx) remained; both done this session.
- [x] 6. EVL — all EVL gates green (26/26 frontend, 184/184 backend, tsc clean x2); follow-up stubs registered; EVL verdict ALL GATES PASS; browser-check C8/C9 consciously waived by user (automated routing smoke tests accepted in lieu) — recorded as accepted known-gap, not open blocker.
- [x] 7. UPDATE PROCESS — phase report written, umbrella state updated, commit done

**Phase 1 COMPLETE.** All automated gates pass. Browser verification (C8/C9) waived by user this session — accepted as known-gap. Phase 2 (My Library + Process Inbox) is the next phase. Start at Step 0 RESEARCH.

---

## Touchpoints

- `src/app/HomePage.tsx` — MODIFY/DELETE: shell extracted; file either deleted or reduced to redirect shim
- `src/app/AppRoutes.tsx` — MODIFY: layout route + nested content routes added
- `src/app/lazyPages.ts` — MODIFY: TodayPage lazy export added
- `src/components/AppShell.tsx` — CREATE: full shell extraction (nav, hamburger, notifications, profile, banners, footer, ExpandableTabs, BeamsBackground)
- `src/pages/TodayPage.tsx` — CREATE: streak + due count + due-card preview + recent notes dashboard
- `src/pages/SubjectNotesPage.tsx` — MODIFY: prop→useParams() migration for subjectId
- `src/app/__tests__/appshell-routing.test.tsx` — CREATE: routing smoke tests (3 scenarios)
- `backend/src/__tests__/study.test.ts` — CREATE: computeSm2 unit test (baseline, low-cost)
- `backend/src/routes/study.ts` — MODIFY (1 line): `export function computeSm2`

---

## Public Contracts

- `/review` URL and `ReviewPageRoute` component: unchanged (standalone, not wrapped in AppShell)
- `/my-notes` URL and `MyNotesPage`: unchanged in AppRoutes
- `/settings` URL and `SettingsPage`: unchanged
- `/api/*` endpoints: zero backend API changes in Phase 1 (only adding export keyword to an internal function)
- Auth token pattern (sessionStorage `notarium_token`): unchanged
- `ExpandableTabs` component API: unchanged; only its usage (onClick handlers) changes from setState to navigate

---

## Verification Evidence

| Gate / Scenario                                                              | Strategy        | Proves SPEC criterion                                    |
| ---------------------------------------------------------------------------- | --------------- | -------------------------------------------------------- |
| `npm test` exits 0 with ≥26 passing tests                                    | Fully-Automated | No regressions; new smoke tests green                    |
| `npx tsc --noEmit` exits 0                                                   | Fully-Automated | TypeScript contracts preserved                           |
| `cd backend && npm test` exits 0                                             | Fully-Automated | Backend untouched, no regressions                        |
| `cd backend && npx tsc --noEmit` exits 0                                     | Fully-Automated | Backend types unchanged                                  |
| Smoke test: `<MemoryRouter initialEntries={['/']}>` renders TodayPage        | Fully-Automated | Default landing is TodayPage (Acceptance Criterion 1)    |
| Smoke test: `<MemoryRouter initialEntries={['/review']}>` renders ReviewPage | Fully-Automated | ReviewPageRoute preserved at /review (Criterion 4)       |
| Smoke test: unauthenticated `/` → redirect to `/login`                       | Fully-Automated | ProtectedRoute wrapper functional (Criterion 2)          |
| `computeSm2` unit test: quality=5 → interval_days≥1 and ease_factor≥2.5      | Fully-Automated | SRS engine baseline covered (known gap addressed)        |
| Browser: TodayPage loads at /, streak and due count visible                  | Agent-Probe     | TodayPage renders correctly with real data (Criterion 1) |
| Browser: all nav tabs reachable + mobile menu works                          | Agent-Probe     | No tab lost in shell extraction (Criteria 2, 5, 6)       |
| Browser: profile editor, notification panel, logout all work                 | Agent-Probe     | All shell behaviors preserved (Criteria 6–9)             |

**Failing stubs (red-first TDD baseline for smoke tests):**

```
test("renders TodayPage at /", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: renders TodayPage at /")
})
test("renders ReviewPageRoute at /review", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: renders ReviewPageRoute at /review")
})
test("redirects unauthenticated user at / to /login", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: redirects unauthenticated user at / to /login")
})
test("computeSm2 quality=5 returns valid interval and ease_factor", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: computeSm2 quality=5 returns valid result")
})
```

---

## Test Infra Improvement Notes

- Phase 1 introduces the first routing smoke tests for AppRoutes (`src/app/__tests__/appshell-routing.test.tsx`). Before Phase 1, no frontend test exercises route rendering end-to-end.
- `computeSm2` unit test in `backend/src/__tests__/study.test.ts` is the first dedicated test for the SRS computation function, addressing the known gap from `all-tests.md` ("No tests for SM-2 logic directly").
- Frontend coverage was 6 files / 23 tests / minimal before Phase 1. Phase 1 adds at minimum 4 new test cases. Coverage delta is still below 80% threshold — this is a known gap carried forward. Each subsequent phase should add at least one smoke test per new page.
- jsdom quirk reminder: `BeamsBackground` uses Canvas/WebGL (Three.js). In smoke tests, mock `BeamsBackground` to `() => null` via `vi.mock`. This is now in Step H0.
- `ExpandableTabs` uses DOM event listeners. In routing smoke tests, render the full AppShell component and assert on rendered output, not on internal state.

---

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/paperloop_25-07-26/phase-1-shell-today_PLAN_25-07-26.md`
- Last completed step: Steps 1–4 (RESEARCH, INNOVATE, PLAN, PVL complete)
- Validate-contract status: written — Gate: CONDITIONAL (accepted)
- Supporting context files loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`
- Next step for a fresh agent: Spawn vc-execute-agent. Pass this plan file path explicitly. Begin at Step I (export computeSm2), then Step A (AppShell.tsx creation). After each Step A–H, run `npm test` and `npx tsc --noEmit` before moving to the next step. If any test fails, fix before continuing. Do not batch all steps and test at the end.
- Execute-agent start instruction: Read this plan fully. Read the umbrella plan. Begin at Step I (export computeSm2 in backend/src/routes/study.ts — one line change). Then Step A (AppShell.tsx creation). After each Step, run the relevant gate commands before moving to the next step.

**Critical context for execute-agent:**

- Step I MUST run before Step H5 — `computeSm2` is not exported yet and the test import will fail at compile time.
- Verified API field names for TodayPage (E2–E4): `current_streak`, `learning_points`, `due_count` (from `/api/study/stats`); `items[]` (from `/api/reviews/due`); notes list (from `/api/notes/my-notes`).
- Read `src/pages/SubjectsPage.tsx` before Step F12 — verify it self-fetches before removing AppShell's `loadSubjects`.
- Read `src/pages/SubjectNotesPage.tsx` fully before implementing Step G (prop→useParams migration).
- Read `src/components/ui/expandable-tabs.tsx` before implementing Step A5 — the `onChange` prop receives the tab index; map indexes to route paths.
- The existing `src/app/routes/ProtectedRoute.test.tsx` and `AdminRoute.test.tsx` are the test file templates for the routing smoke tests (Step H) — read them for the mock pattern.
- AdminRoute wrapping in B2 is REQUIRED — do not skip. Wrap `/admin` route in `<AdminRoute>` inside the layout route.

---

## Validate Contract

Status: CONDITIONAL
Date: 25-07-26
date: 2026-07-25
generated-by: inner-pvl: phase-1

Parallel strategy: sequential
Rationale: 1/7 signals (S7 only — 8 files in blast radius). No fan-out needed. All layer checks run inline by single validate agent.

Test gates (C3 5-column table):

| criterion id | behavior                                                                       | strategy        | proving test                                                                             | gap-resolution |
| ------------ | ------------------------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------- | -------------- |
| C1           | TodayPage renders at / after route migration                                   | Fully-Automated | `npm test` — `src/app/__tests__/appshell-routing.test.tsx` test "renders TodayPage at /" | A              |
| C2           | ReviewPageRoute renders at /review (preserved)                                 | Fully-Automated | `npm test` — same file, test "renders ReviewPageRoute at /review"                        | A              |
| C3           | Unauthenticated / redirects to /login                                          | Fully-Automated | `npm test` — same file, test "redirects unauthenticated user at / to /login"             | A              |
| C4           | Frontend TypeScript contracts clean                                            | Fully-Automated | `npx tsc --noEmit` exits 0                                                               | A              |
| C5           | Backend regression clean (no backend changes)                                  | Fully-Automated | `cd backend && npm test` exits 0                                                         | A              |
| C6           | Backend TypeScript clean                                                       | Fully-Automated | `cd backend && npx tsc --noEmit` exits 0                                                 | A              |
| C7           | computeSm2 SM-2 computation correct                                            | Fully-Automated | `cd backend && npm test` — `backend/src/__tests__/study.test.ts`                         | A              |
| C8           | Browser: TodayPage renders with real data, all tabs navigable                  | Agent-Probe     | Dev server: log in, navigate to /, verify streak/due count visible; click each tab       | A              |
| C9           | Browser: shell behaviors preserved (hamburger, notifications, profile, logout) | Agent-Probe     | Dev server: test each shell interaction manually                                         | A              |

gap-resolution legend:

- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form:

- routing smoke tests: Fully-automated: `npm test` (from repo root)
- typecheck frontend: Fully-automated: `npx tsc --noEmit`
- backend regression: Fully-automated: `cd backend && npm test`
- backend typecheck: Fully-automated: `cd backend && npx tsc --noEmit`
- browser verification: agent-probe: dev server smoke run

Failing stubs (for Fully-Automated rows C1–C4, to be written by execute-agent at Step H):

C1:

```
test("renders TodayPage at /", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: renders TodayPage at /")
})
```

C2:

```
test("renders ReviewPageRoute at /review", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: renders ReviewPageRoute at /review")
})
```

C3:

```
test("redirects unauthenticated user at / to /login", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: redirects unauthenticated user at / to /login")
})
```

C7:

```
test("computeSm2 quality=5 returns valid interval and ease_factor", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: computeSm2 quality=5 returns valid result")
})
```

Dimension findings:

- Infra fit: CONDITIONAL — computeSm2 not exported (FAIL → resolved by plan Step I addition); wrong API field names in Step E corrected by P2 supplement
- Test coverage: CONCERN — BeamsBackground mock missing from checklist (resolved by P3 / Step H0 addition)
- Breaking changes: PASS — all existing routes (/review, /my-notes, /settings, auth routes) preserved; zero backend API changes
- Security surface: PASS — no auth/billing/schema/trust-boundary surface touched; AdminRoute wrapping made explicit by P4 supplement
- Section A (AppShell extraction): CONCERN — /quiz Tests tab stub rendered as "Coming soon" (not blank) per P5-adjacent cosmetic fix; resolved inline
- Section B (AppRoutes update): CONCERN — AdminRoute nesting implicit; resolved by P4 (B1/B2 now explicit)
- Section E (TodayPage creation): CONCERN — wrong endpoint URL and field names; resolved by P2 (Step E corrected)
- Section F (shell behavior preservation): CONCERN — SubjectsPage self-fetch not explicit; resolved by P5 (Step F12 updated)
- Section G (SubjectNotesPage migration): CONCERN — "or read from URL" ambiguity; resolved inline (G2 clarified)
- Section H (smoke tests): CONDITIONAL — BeamsBackground mock now Step H0; computeSm2 export now Step I

Open gaps:

- Frontend test coverage below 80% threshold: known-gap: documented as pre-existing — see `process/context/tests/all-tests.md`. Not introduced by Phase 1. Each subsequent phase adds smoke tests per new page.
- No e2e CI browser tests: known-gap: no Playwright in this repo. Agent-probe tier covers Phase 1 browser verification manually.

What this coverage does NOT prove:

- C1 (TodayPage renders at /): does not prove TodayPage fetches and displays real API data (mocked in jsdom test)
- C2 (ReviewPageRoute at /review): does not prove ReviewPage content loads or SRS cards display correctly
- C3 (unauthenticated redirect): does not prove sessionStorage token is correctly validated by the API on real requests
- C4 (frontend typecheck): does not prove runtime behavior — only static type contracts
- C5 (backend regression): does not prove frontend→backend integration; backend tests run in miniflare isolation
- C6 (backend typecheck): same as C4 for backend
- C7 (computeSm2 unit test): does not cover edge cases (quality < 3 resets, ease_factor floor, large repetition counts)
- C8/C9 (agent-probe): not automated; depends on manual agent run with working dev server and auth credentials

Gate: CONDITIONAL
Accepted by: session (autonomous, /goal execution) — accepted concerns: computeSm2-not-exported (fixed via Step I), wrong-api-fields-in-step-E (corrected in Step E), beams-background-mock-missing (added as Step H0), adminroute-nesting-implicit (explicit in B1/B2), subjectspage-self-fetch-not-explicit (explicit in F12)

---

## Autonomous Goal Block

SESSION GOAL: Paperloop Phase 1 — Extract AppShell, migrate tab-state to react-router routes, build TodayPage as default landing
Charter + umbrella plan: process/general-plans/active/paperloop_25-07-26/paperloop-umbrella_PLAN_25-07-26.md
Autonomy: auto-proceed on all reversible decisions; surface only hard stops (irreversible actions without explicit contract instruction, outward-facing API changes not in plan)
Hard stop conditions:

- Do not modify any backend API endpoint signatures or add new routes beyond `export function computeSm2`
- Do not delete files without running grep to confirm zero remaining imports
- Do not skip the BeamsBackground mock (Step H0) — omitting it will cause test suite failure on jsdom
- Do not proceed to Step H5 without completing Step I first (computeSm2 must be exported)
  Next phase: EXECUTE: process/general-plans/active/paperloop_25-07-26/phase-1-shell-today_PLAN_25-07-26.md
  Validate contract: inline in plan (## Validate Contract section above)
  Execute start: `npm test` (baseline 23 tests) | agent-probe: dev server browser verification | high-risk pack: no
