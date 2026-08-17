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

Status: DONE
EVL: ALL GATES PASS (2026-08-16) — frontend 28/28 (was 26/26), backend 187/187 (was 184/184), tsc clean x2
Browser check (agent-probe rows: already-processed card, full capture→OCR→confirm→redirect, summary-never-empty-content, quiz-caching): NOT run this closeout — no live dev-server/browser session available; recorded as verification-pending in `phase-2-library-process_REPORT_25-07-26.md` (backlog NOTEs)
Claimed files (corrected + expanded during PLAN-SUPPLEMENT; original stub claimed only 3 files) — all actually modified as claimed, no deviations:

- src/pages/ProcessPage.tsx (CREATE)
- src/pages/CaptureNotePage.tsx (CREATE — added during supplement; capture entry route)
- src/app/AppRoutes.tsx (MODIFY — add /notes/capture and /notes/:id/process routes, both standalone outside AppShell; sequenced AFTER Phase 1)
- src/app/lazyPages.ts (MODIFY — ProcessPage + CaptureNotePage exports; sequenced AFTER Phase 1)
- src/app/**tests**/appshell-routing.test.tsx (MODIFY — added during supplement; routing smoke tests for both new standalone routes; sequenced AFTER Phase 1's CREATE)
- src/lib/api.ts (MODIFY — added during supplement; new `notes.getNote(id)` client method + `NoteDetail` local type)
- backend/src/routes/notes.ts (MODIFY — added during supplement; new `getNote` handler, inserted after `getNotesBySubject`)
- backend/src/index.ts (MODIFY — added during supplement; new `GET /api/notes/:id` if-block; sequenced BEFORE Phase 4's chat-removal/quiz-route edits and Phase 5's primer-route edit to the same file)
- backend/test/red-team/G-idor.test.ts (MODIFY — added during supplement; 2 new ownership cases for GET /api/notes/:id)
- backend/test/red-team/I-chat-study.test.ts (MODIFY — added during supplement; 1 new case proving note_id-scoped study_items upsert; sequenced BEFORE Phase 4's SPLIT of this file — the new case stays in the "study half" Phase 4 keeps)

---

## Phase 3 — Community + Progress

Status: DONE (EVL-green, committed 85cb8e0)
EVL: ALL GATES PASS (2026-08-17, independently confirmed) — frontend 29/29 (was 28/28), backend 192/192 (was 187/187), tsc clean x2
Browser check (C4 agent-probe): NOT run — no dev server/browser session available; waived per Phase 1/2 precedent, accepted known-gap
Claimed files (corrected during PLAN-SUPPLEMENT — original stub claimed 3 files, one dropped as stale, two test files added):

- backend/src/routes/leaderboard.ts (MODIFY — ORDER BY swap: learning_points DESC, current_streak DESC; SELECT list unchanged, additive current_streak column only)
- src/pages/LeaderboardPage.tsx (MODIFY — heading "Leaderboard"→"Progress", Contributors/Learners toggle deleted, personal-stats header added via existing api.getStudyStats())
- backend/test/red-team/leaderboard-ranking.test.ts (CREATE — new leaderboard ordering test)
- src/app/**tests**/appshell-routing.test.tsx (MODIFY — add getLeaderboard mock + new /progress routing test; sequenced AFTER Phase 1's CREATE and Phase 2's MODIFY of this same file)

Dropped from the original stub claim: src/components/AppShell.tsx — verified during PLAN-SUPPLEMENT (16-08-26) that the nav label swap ("Subjects"→"Community", "Leaderboard"→"Progress") already landed in Phase 1 (AppShell.tsx:221-222,804,862). Phase 3 does not touch this file.

---

## Phase 4 — Quiz + Test Simulator

Status: PLAN + PVL complete (17-08-26) — Gate: CONDITIONAL, user-accepted 17-08-26. EXECUTE HELD — see Current Execution State in the umbrella plan for the blocking pre-condition (two concurrent uncommitted work-streams share files with this phase's blast radius: SRS-hardening session on `study.ts`/`I-chat-study.test.ts`/`G-idor.test.ts`/migration 0016; firebase-auth session on `provider-mocks.test.ts`/`auth.ts`/`db.ts`/`env.ts`/`schema.sql`).
Claimed files (corrected + expanded during PLAN-SUPPLEMENT — original stub claimed 11 files and missed 3: `src/lib/api.ts`, `src/types/index.ts`, and `backend/test/red-team/provider-mocks.test.ts`; that last one is a genuine new-discovery, not a naming correction — see plan's Verified Source Facts):

- src/pages/QuizBuilderPage.tsx (CREATE)
- src/pages/TestSimulatorPage.tsx (CREATE)
- src/pages/TestResultsPage.tsx (CREATE)
- src/pages/ChatPage.tsx (DELETE)
- src/app/AppRoutes.tsx (MODIFY — swap ComingSoonPage for QuizBuilderPage at /quiz; remove /chat route + ChatPage import; sequenced AFTER Phases 1+2+3)
- src/app/lazyPages.ts (MODIFY — quiz exports; remove ChatPage; sequenced AFTER Phases 1+2+3)
- src/components/AppShell.tsx (MODIFY — ONE atomic edit: remove chat tab desktop (tabs[]+paths[] positional pair) + MessageSquare import + mobile Chat button; confirm Tests tab target; sequenced AFTER Phase 3)
- src/lib/api.ts (MODIFY — delete `chat: {...}` block (307-367); add `ai.generateStructuredQuiz`)
- src/types/index.ts (MODIFY — delete Chat\* interfaces (188-249))
- backend/src/routes/chat.ts (DELETE)
- backend/src/routes/ai.ts (MODIFY — remove chatWithGemini/getUserNotes/formatNotesForContext; add resolveQuizSourceContent (private) + generateStructuredQuiz + generateStructuredQuizEndpoint — does NOT touch the kept generateQuiz/generateQuizEndpoint)
- backend/src/index.ts (MODIFY — remove chat import block (47-53) + chat if-blocks (807-833); add generateStructuredQuizEndpoint import + /api/ai/quiz if-block; sequenced AFTER Phase 2's GET /api/notes/:id if-block addition to the same file)
- backend/test/red-team/I-chat-study.test.ts (SPLIT — keep study half (136-140, 137b, 137c) + hashQuestion; must preserve Phase 2's note_id/study_items case in the retained half; BLOCKED on the Fork G pre-condition — a concurrent session is hardening this same file, re-verify at EXECUTE before editing)
- backend/test/red-team/provider-mocks.test.ts (MODIFY — NEW claim, discovered during PLAN-SUPPLEMENT 17-08-26: delete the I135 chat describe block (113-130), which exercises the same chat endpoints G1 deletes; missed by the original stub)
- backend/test/red-team/ai-quiz-contract.test.ts or equivalent (CREATE — new tests for POST /api/ai/quiz contract + subject-source IDOR; exact file placement deferred to PVL to avoid colliding with the concurrent G-idor.test.ts hardening session — see plan's Accepted Known-Gap 4)

Explicitly NOT touched (verified during PLAN-SUPPLEMENT, 17-08-26): `backend/test/red-team/G-idor.test.ts` — mid-hardening in a concurrent session; the new /api/ai/quiz IDOR test lands elsewhere by design, not folded into this file.

---

## Phase 5 — Primer

Status: PLAN-SUPPLEMENT complete (17-08-26) — ready for PVL. EXECUTE transitively gated: sequenced AFTER Phase 4 EXECUTE commits (6 shared files below), and Phase 4 EXECUTE is itself HELD on its own separate concurrent-session pre-condition (see Phase 4 section above / umbrella `## Current Execution State`).
Claimed files (corrected + expanded during PLAN-SUPPLEMENT 17-08-26 — original stub claimed 5 files and missed 4: `src/types/index.ts`, `backend/test/red-team/H-ai.test.ts`, `src/app/__tests__/appshell-routing.test.tsx` were entirely absent from the stub, and `backend/src/routes/ai.ts`'s claim was expanded from "add generatePrimer" to also cover `generatePrimerEndpoint`):

- src/pages/PrimerPage.tsx (CREATE — topic-input form, calls api.ai.generatePrimer, renders overview/key_concepts/questions, ephemeral)
- src/pages/TodayPage.tsx (MODIFY — NEW claim, missed by original stub: add "Prep for class" card linking to /primer; placement TBD at EXECUTE, no new API call)
- src/app/AppRoutes.tsx (MODIFY — add /primer route nested inside the AppShell layout-route block; sequenced AFTER Phase 4, SHARED file)
- src/app/lazyPages.ts (MODIFY — PrimerPage lazy export; sequenced AFTER Phase 4, SHARED file)
- src/lib/api.ts (MODIFY — NEW claim, missed by original stub: add `ai.generatePrimer` method inside the existing `ai: {...}` object; sequenced AFTER Phase 4, SHARED file — Phase 4 also modifies this same object with `generateStructuredQuiz`)
- src/types/index.ts (MODIFY — NEW claim, missed by original stub: add `PrimerResponse` interface; sequenced AFTER Phase 4, SHARED file — Phase 4 also modifies this file, deleting Chat\* interfaces)
- backend/src/routes/ai.ts (MODIFY — expanded claim: add `generatePrimer` (DeepSeek fetch, mirrors generateStudyPlan/explainConcept + generateQuiz's JSON-parse shape) AND `generatePrimerEndpoint` (mirrors generateStudyPlanEndpoint); sequenced AFTER Phase 4, SHARED file — Phase 4 also modifies this file, removing 3 chat helpers and adding generateStructuredQuiz/generateStructuredQuizEndpoint)
- backend/src/index.ts (MODIFY — add /api/ai/primer if-block with requireUser+checkRateLimit wrapper, inserted after the existing /api/concept-explain if-block; sequenced AFTER Phase 4, SHARED file — Phase 4 also modifies this file, removing the chat import+5 if-blocks and adding /api/ai/quiz)
- backend/test/red-team/H-ai.test.ts (MODIFY — NEW claim, missed by original stub: add /api/ai/primer to the '125 & auth' 401-path array + new 400-missing-topic test case; NOT shared with Phase 4 — Phase 4 does not touch this file)
- src/app/**tests**/appshell-routing.test.tsx (MODIFY — NEW claim, missed by original stub: add /primer routing smoke test (sentinel-mock PrimerPage) + extend the existing `/` TodayPage case with a "Prep for class" card assertion; NOT shared with Phase 4's own edits to this file — Phase 4 does not touch appshell-routing.test.tsx either)

---

## Conflict Analysis

AppRoutes.tsx and lazyPages.ts are claimed by Phases 1, 2, 4, and 5. Sequencing rules enforce no concurrent writes — each phase executes after the previous one verifies. Phase 3 does NOT claim either file (verified during Phase 3 PLAN-SUPPLEMENT, 16-08-26: /progress already routes via Phase 1's ShellPageRoutes.tsx wrapper — no new route or lazy export needed). Phases 2 and 3 are fully parallel-safe (disjoint file sets).

src/components/AppShell.tsx claimed by Phase 1 (CREATE) and Phase 4 (MODIFY tabs) — Phase 3 no longer claims this file (nav labels already landed in Phase 1; verified during Phase 3 PLAN-SUPPLEMENT, 16-08-26). Phase 5 explicitly does NOT claim this file (Locked Decision 2 — Primer is a TodayPage card, not a nav tab; adding a second concurrent editor to AppShell's positionally-indexed tabs/paths arrays alongside Phase 4's own edit there was deliberately avoided). Sequential execution prevents conflicts.

backend/src/routes/ai.ts claimed by Phase 4 (remove chat, add generateStructuredQuiz/generateStructuredQuizEndpoint) and Phase 5 (add generatePrimer/generatePrimerEndpoint). Sequential execution required — Phase 5 sequenced AFTER Phase 4.

backend/src/index.ts claimed by Phase 2 (new GET /api/notes/:id if-block), Phase 4 (chat removal + quiz route) and Phase 5 (primer route, inserted after the existing /api/concept-explain if-block). Sequential execution required — Phase 2 executes first in program order, so its if-block addition is safely in place before Phase 4/5 touch the same file; Phase 5 sequenced AFTER Phase 4.

src/lib/api.ts claimed by Phase 2 (notes.getNote), Phase 4 (delete chat block, add ai.generateStructuredQuiz), and Phase 5 (add ai.generatePrimer to the same `ai: {...}` object Phase 4 modifies). Sequential execution required — Phase 5 sequenced AFTER Phase 4 so both new `ai.*` methods land without a merge conflict on the same object literal.

src/types/index.ts claimed by Phase 4 (delete Chat\* interfaces) and Phase 5 (add PrimerResponse). Sequential execution required — Phase 5 sequenced AFTER Phase 4; the two edits are in disjoint regions of the file (Chat\* interfaces vs. the StudyPlanResponse/ConceptExplanationResponse response-interface group) so no line-level conflict is expected, only ordering discipline.

backend/test/red-team/I-chat-study.test.ts claimed by Phase 2 (MODIFY — add note_id/study_items case) and Phase 4 (SPLIT — keep study half). Sequential execution required; Phase 4's split must preserve Phase 2's new case in the retained "study half." Phase 5 does NOT touch this file.

src/app/**tests**/appshell-routing.test.tsx claimed by Phase 1 (CREATE), Phase 2 (MODIFY — add 2 new standalone-route smoke tests), Phase 3 (MODIFY — add getLeaderboard mock + new /progress routing test), and Phase 5 (MODIFY — add /primer smoke test + extend the `/` TodayPage case). Phase 4 does NOT claim this file (its own routing smoke test, T3, was placed in this same file per its Implementation Checklist — **note for EXECUTE**: Phase 4's checklist T3 item does in fact target `appshell-routing.test.tsx` even though this registry's Phase 4 entry above did not list it explicitly as a claimed file; re-verify at EXECUTE whether Phase 4 or Phase 5 lands first in this file and merge additively, not overwrite). Sequential execution prevents conflicts for all confirmed claimants.

backend/test/red-team/H-ai.test.ts claimed by Phase 5 only (add /api/ai/primer to the 401-path array + new 400 test). No other phase claims this file — no conflict.

No conflicts within any single phase. All multi-phase conflicts are resolved by sequential execution order; Phase 5 is sequenced to EXECUTE after Phase 4 on every shared file.
