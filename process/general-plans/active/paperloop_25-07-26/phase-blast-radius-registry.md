# Paperloop — Phase Blast-Radius Registry

Coordinator: vc-plan-agent (created 25-07-26)
Purpose: track per-phase file claims to prevent parallel blast-radius conflicts.

Append-only. Never overwrite existing entries.

---

## Phase 1 — Shell + Today

Status: DONE
EVL: ALL GATES PASS (2026-07-26) — frontend 26/26, backend 184/184, tsc clean x2
Browser check (C8/C9): WAIVED by user — automated routing smoke tests accepted in lieu; recorded as accepted known-gap
Files actually modified:

- src/app/HomePage.tsx (DELETED — Option D-B; zero imports confirmed)
- src/app/AppRoutes.tsx (MODIFIED — layout route + nested content routes)
- src/app/lazyPages.ts (MODIFIED — TodayPage lazy export added)
- src/components/AppShell.tsx (CREATED — full shell extraction)
- src/pages/TodayPage.tsx (CREATED — streak/due count/due-card preview/recent notes)
- src/pages/SubjectNotesPage.tsx (MODIFIED — prop→useParams migration)
- src/app/**tests**/appshell-routing.test.tsx (CREATED — 3 routing smoke tests)
- backend/src/**tests**/study.test.ts (CREATED — computeSm2 unit tests x2)
- backend/src/routes/study.ts (MODIFIED — export keyword added to computeSm2)
- src/app/routes/ShellPageRoutes.tsx (CREATED — prior session addition; CommunityRoute/ProgressRoute thin wrappers)
  Out-of-scope changes left untouched (pending separate review by user):
- backend/src/lib/auth.ts, backend/src/lib/db.ts, backend/src/lib/env.ts
- backend/migrations/0015_add_firebase_uid.sql
- backend/test/red-team/gaps-\*.test.ts, provider-mocks.test.ts

---

## Phase 2 — My Library + Process Inbox

Status: PLANNED (stub)
Claimed files:

- src/pages/ProcessPage.tsx (CREATE)
- src/app/AppRoutes.tsx (MODIFY — add /notes/:id/process route; sequenced AFTER Phase 1)
- src/app/lazyPages.ts (MODIFY — ProcessPage export; sequenced AFTER Phase 1)

---

## Phase 3 — Community + Progress

Status: PLANNED (stub)
Claimed files:

- src/pages/LeaderboardPage.tsx (MODIFY — label swap)
- src/components/AppShell.tsx (MODIFY — nav label "Subjects"→"Community"; sequenced AFTER Phase 1)
- backend/src/routes/leaderboard.ts (MODIFY — ORDER BY swap)

---

## Phase 4 — Quiz + Test Simulator

Status: PLANNED (stub)
Claimed files:

- src/pages/QuizBuilderPage.tsx (CREATE)
- src/pages/TestSimulatorPage.tsx (CREATE)
- src/pages/TestResultsPage.tsx (CREATE)
- src/pages/ChatPage.tsx (DELETE)
- src/app/AppRoutes.tsx (MODIFY — quiz routes; remove chat; sequenced AFTER Phases 1+2+3)
- src/app/lazyPages.ts (MODIFY — quiz exports; remove ChatPage; sequenced AFTER Phases 1+2+3)
- src/components/AppShell.tsx (MODIFY — remove chat tab, add Tests tab; sequenced AFTER Phase 3)
- backend/src/routes/chat.ts (DELETE)
- backend/src/routes/ai.ts (MODIFY — remove chatWithGemini; add generateQuiz endpoint)
- backend/src/index.ts (MODIFY — remove chat if-blocks; add /api/ai/quiz if-block)
- backend/test/red-team/I-chat-study.test.ts (SPLIT — keep study half)

---

## Phase 5 — Primer

Status: PLANNED (stub)
Claimed files:

- src/pages/PrimerPage.tsx (CREATE)
- src/app/AppRoutes.tsx (MODIFY — add /primer route; sequenced AFTER Phase 3)
- src/app/lazyPages.ts (MODIFY — PrimerPage export; sequenced AFTER Phase 3)
- backend/src/routes/ai.ts (MODIFY — add generatePrimer; sequenced AFTER Phase 4 if same session)
- backend/src/index.ts (MODIFY — add /api/ai/primer if-block; sequenced AFTER Phase 4)

---

## Conflict Analysis

AppRoutes.tsx and lazyPages.ts are claimed by Phases 1, 2, 3, 4, and 5. Sequencing rules enforce no concurrent writes — each phase executes after the previous one verifies. These are NOT parallel-safe for execution (but Phases 2 and 3 are parallel-safe if they do not both touch AppRoutes in the same session — they can be, but coordination is needed).

src/components/AppShell.tsx claimed by Phase 1 (CREATE), Phase 3 (MODIFY label), Phase 4 (MODIFY tabs). Sequential execution prevents conflicts.

backend/src/routes/ai.ts claimed by Phase 4 (remove chat) and Phase 5 (add primer). Sequential execution required.

backend/src/index.ts claimed by Phase 4 (chat removal + quiz route) and Phase 5 (primer route). Sequential execution required.

No conflicts within any single phase. All multi-phase conflicts are resolved by sequential execution order.
