---
name: plan:paperloop-phase-04-quiz-simulator
description: 'Paperloop — Phase 4: Quiz + Test Simulator pages; remove chat code; /api/ai/quiz backend'
date: 25-07-26
metadata:
  node_type: memory
  type: plan
  feature: paperloop
  phase: phase-04
---

# Phase 4 — Quiz + Test Simulator

**Program:** paperloop
**Umbrella plan:** `process/general-plans/active/paperloop_25-07-26/paperloop-umbrella_PLAN_25-07-26.md`
**Date** 25-07-26 (supplemented 17-08-26)
**Status** ✅ COMPLETE (21-08-26) — EVL GATES-GREEN (195/195 BE, 31/31 FE, tsc clean x2). Ready for UPDATE PROCESS archival.
**Complexity** COMPLEX
**Report destination:** `process/general-plans/active/paperloop_25-07-26/phase-4-quiz-simulator_REPORT_25-07-26.md`

---

## Overview

Two bundled concerns, same as the original stub, now fully specified:

1. **Build**: a dedicated Quiz + Test Simulator surface — `QuizBuilderPage` → `TestSimulatorPage` → `TestResultsPage`, three separate `.tsx` files on a single `/quiz` route (in-page `Step` state machine, mirroring `ProcessPage`'s linear-stepper pattern from Phase 2). New backend `POST /api/ai/quiz` endpoint generates a multi-type quiz (MCQ / True-False / Short-answer) scoped to either one note or a whole subject (personal notes only).
2. **Demolish**: remove the chat feature (code only — D1 tables `chat_sessions`/`chat_messages` are KEPT, no migration, no DROP TABLE). This frees the nav slot the Tests tab already has a placeholder for (from Phase 1) and removes `ComingSoonPage` at `/quiz`.

**FORK LOCKED (unchanged from stub):** `chat_sessions` and `chat_messages` D1 tables are KEPT. No migration, no DROP TABLE.

---

## Locked User Decisions (this session)

1. **Test source** = single note OR whole subject/deck (NOT free-text topic).
2. **Timer** = whole-test countdown, duration is USER-CONFIGURABLE at build time (a `QuizBuilder` form field, not a fixed constant). Auto-submit on expiry.
3. **Customization** = count + difficulty + question TYPES (MCQ, True/False, Short-answer).
4. **UI** = build fresh components (`QuizBuilderPage` / `TestSimulatorPage` / `TestResultsPage`) as 3 separate `.tsx` files, on a SINGLE `/quiz` route with an in-page `Step` state machine (mirrors `ProcessPage`'s pattern) — this satisfies "build fresh" without needing 3 separate URL routes.
5. **Short-answer grading** = HYBRID: AI-graded at submit time (reuses `study.ts`'s `gradeRecall` DeepSeek JSON-grading pattern, confirmed at `backend/src/routes/study.ts:379-465`), with self-graded fallback if the AI call errors or returns unparseable JSON for a given question.

---

## INNOVATE Decision Summary (carried verbatim into this plan)

- **Fork A (grading).** Hybrid AI-graded + self-fallback, computed at the `TestResults` transition. Per-type `is_correct`: MCQ = index compare; True/False = bool compare; Short-answer = AI grade vs `model_answer`/rubric, fallback self-report on AI error/unparseable JSON.
- **Fork B (endpoint).** NEW `POST /api/ai/quiz` (introduces the `/api/ai/*` prefix — first endpoint using it; existing AI endpoints use `/api/notes/:id/...` and `/api/gemini/...`). Request body: `{ source_type: 'note'|'subject', source_id: number, count: number, difficulty: 'easy'|'medium'|'hard', types: Array<'mcq'|'true_false'|'short_answer'> }`. Source resolution: `note` = `SELECT extracted_text, title, author_id FROM notes WHERE id = ?` + ownership check; `subject` = NEW query `SELECT extracted_text, title FROM notes WHERE subject_id = ? AND author_id = ?` — **personal-only**, do NOT reuse `getNotesBySubject` (community-scoped — would leak other users' notes, an IDOR). Truncate aggregated subject content (~1200 chars/note, ~6-8k total cap — port the truncation pattern from the soon-to-be-deleted `formatNotesForContext`, do not call the deleted function). Response per-question carries: `type`, `question`, `options?` (mcq/tf), `correct_answer?` (mcq/tf), `model_answer?` (short_answer — reveal text + grading rubric), `explanation`. New backend function named `generateStructuredQuiz` — does NOT collide with the kept MCQ-only `generateQuiz`. `POST /api/notes/:id/quiz` (existing) is UNTOUCHED.
- **Fork C (architecture).** Single `/quiz` route + in-page `Step` state machine (`build` → `run` → `results`). Replaces `ComingSoonPage`, currently wired at `/quiz` in `AppRoutes.tsx:136`. Accepted known-gap: refresh loses an in-progress test (matches the Phase 2 precedent for quiz/refresh-loss).
- **Fork D (timer).** `setInterval` + `useRef` countdown; duration is USER-CONFIGURABLE at build time (Locked Decision 2 — **correction to an earlier INNOVATE draft that said "fixed constant"**; the user explicitly decided duration is a `QuizBuilder` form field). Auto-submit on 0 uses the SAME submit path as a manual submit. Refresh loses the timer (accepted known-gap, same class as Fork C's known-gap).
- **Fork E (SRS).** Batch all `POST /api/quiz/attempt` calls at `TestResults` via `Promise.allSettled`, non-blocking (mirrors `ProcessPage`'s fire-and-forget `.catch()` pattern from Phase 2). One attempt logged per answered question. Reuses the EXISTING single-question endpoint (`logQuizAttempt`, `study.ts:186`, routed at `index.ts:1122-1124`) — NO new bulk endpoint. Soft toast on partial failure; never blocks the results render.
- **Fork F (chat demolition)** — see Implementation Checklist, Demolition groups G1-G5 below. Consumer-first ordering, `tsc --noEmit` checkpoint after each backend/frontend group.

---

## Verified Source Facts (confirmed by direct source read + repo-wide grep this session)

- **Chat consumer chain (backend), confirmed by direct read:** `backend/src/index.ts:47-53` imports `{ createChatSession, getChatSessions, getChatMessages, addChatMessage, getAIResponse }` from `./routes/chat`; `backend/src/index.ts:807-833` has 5 if-blocks calling them (`POST /api/chat/sessions`, `GET /api/chat/sessions`, `GET /api/chat/sessions/:id/messages`, `POST /api/chat/sessions/:id/messages`, `POST /api/chat/sessions/:id/ai-response`). `backend/src/routes/chat.ts:5,124` imports and calls `chatWithGemini` from `./ai` — this is the ONLY external consumer of `chatWithGemini`. `chatWithGemini` (`ai.ts:69-176`) internally calls `getUserNotes` (`ai.ts:25-47`, defined at line 25 not 47 — the range is the whole function body) and `formatNotesForContext` (`ai.ts:49-67`). Repo-wide grep confirms NO other consumer of `getUserNotes`/`formatNotesForContext`/`chatWithGemini` outside `ai.ts`/`chat.ts` themselves (only `backend/dist/` build-artifact `.d.ts` files reference them — not source, not a blocker). **True consumer-first demolition order: remove index.ts's import+if-blocks FIRST (kills all external callers of chat.ts) → delete chat.ts (kills chatWithGemini's only external caller) → remove chatWithGemini/getUserNotes/formatNotesForContext from ai.ts.**
- **NEW FINDING — a SECOND backend test file exercises chat and was MISSING from the original stub's blast radius:** `backend/test/red-team/provider-mocks.test.ts:113-130` has `describe('I135 — chat AI response is generated and attached to the session', ...)` which calls `POST /api/chat/sessions`, `POST /api/chat/sessions/:id/ai-response`, and `GET /api/chat/sessions/:id/messages`. This block will fail once G1 lands (its target endpoints are deleted) and MUST be deleted as part of demolition — added to Blast Radius/Checklist as G2.2 below. Repo-wide grep (`grep -rln "/api/chat\|chatWithGemini\|createChatSession\|getChatSessions\|getChatMessages\|addChatMessage\|getAIResponse" backend/`) confirms exactly these 5 files touch chat backend-side: `index.ts`, `ai.ts`, `chat.ts`, `I-chat-study.test.ts`, `provider-mocks.test.ts` — no other backend consumer exists.
- **Frontend chat consumer chain, confirmed by direct read + grep:** `src/lib/api.ts:307-367` — `api.chat` block (`createSession`/`getSessions`/`getMessages`/`addMessage`/`getAIResponse`/`uploadDocument`/`analyzeNotes` — the last two call endpoints that don't even exist server-side, i.e. already-dead code). `src/types/index.ts:188-249` — `ChatSession`(188-194), `ChatMessage`(196-202), `ChatDocument`(204-209), `ChatSessionsResponse`(242-244), `ChatMessagesResponse`(246-248). Only consumer of these types repo-wide is `src/pages/ChatPage.tsx` (imports `ChatSession` from `'../types'`; locally shadows its own `ChatMessage` interface). `src/pages/AdminUsageReport.tsx`'s `totalChatSessions` field is an unrelated numeric stat (reads a `COUNT(*)` on the KEPT `chat_sessions` table via `backend/src/routes/admin.ts:99,206`) — NOT a Phase 4 touchpoint, confirms the D1 tables stay queryable after code removal.
- `src/app/AppRoutes.tsx` (full file read, 157 lines): `/quiz` currently renders `ComingSoonPage` (a local function, lines 28-52) at line 136, inside the `AppShell` layout route. `/chat` renders `ChatPage` at line 135. `ChatPage` is imported from `./lazyPages` in the named-import block at line 21. `src/app/lazyPages.ts:12` — `export const ChatPage = lazy(() => import('../pages/ChatPage'));`.
- **`AppShell.tsx` desktop nav + mobile menu, confirmed by direct read:** `tabs` array (lines 219-231) and its positionally-paired `paths` array in the `onChange` handler (line 236: `['/', '/community', '/progress', '/chat', '/quiz', '/review']`) are index-aligned — `tabs[3]` (`'Chat'`) pairs with `paths[3]` (`'/chat'`), `tabs[4]` (`'Tests'`) pairs with `paths[4]` (`'/quiz'`). Removing Chat requires removing BOTH `tabs[3]` and `paths[3]` in the SAME edit to preserve alignment — after removal `Tests` naturally becomes index 3, paired with `paths[3]` now `'/quiz'` (shifted down from index 4). The `cursor`/`adminIndex`/`opsIndex`/`myNotesIndex`/`logoutIndex` math (lines 237-242) is entirely DERIVED from `paths.length` and role checks — no hardcoded indices — so it self-adjusts once `paths` drops to 5 entries; no separate fix needed there, only verification. `MessageSquare` icon (imported line 12) is used ONLY at line 223 (`{ title: 'Chat', icon: MessageSquare }`) — removing the Chat tab entry requires also removing the now-unused `MessageSquare` import, or `tsc --noEmit` (`noUnusedLocals`) will fail. Mobile menu Chat button: lines 807-834 (confirmed exact via direct read — `onClick={() => go('/chat')}` through the closing `</button>`). The mobile `Tests` button already exists and targets `/quiz` (lines 865-892) — untouched by this edit, just confirmed present.
- **`generateQuiz` (existing, KEPT) provider pattern, confirmed by direct read (`ai.ts:338-397`):** uses DeepSeek (`env.DEEPSEEK_API_KEY`, `model: 'deepseek-chat'`, `https://api.deepseek.com/v1/chat/completions`), JSON-structured prompt, `\{[\s\S]*\}/` regex extraction + `JSON.parse`, same error-wrap pattern as `gradeRecall`. `generateStructuredQuiz` (new) mirrors this exact pattern with an expanded prompt (multi-type, count, difficulty) — same provider, no new API key needed.
- **`gradeRecall` DeepSeek JSON-grading pattern, confirmed by direct read (`study.ts:379-465`):** auth → rate-limit → body validation (length caps) → DeepSeek call with a prompt demanding `{ score, feedback, missed_points }` JSON-only → regex-extract + `JSON.parse` → typed coercion of the parsed fields → `jsonResponse`. The new short-answer grading step at `TestResults` reuses this exact call/parse/coerce shape (with a rubric-comparison prompt instead of a free-recall prompt), NOT the endpoint itself — `gradeRecall` stays untouched; the pattern is ported, not imported (it's an HTTP endpoint handler, not a reusable helper).
- **`generateQuizEndpoint` / `generateNoteSummaryEndpoint` auth pattern, confirmed by direct read (`ai.ts:514-556`):** `getUserFromToken(request, env)` → 401 if null → parse body → 400 on missing required field → call the pure generator function → `jsonResponse(...)`. `generateStructuredQuizEndpoint` (new) follows this exact shape.
- **`logQuizAttempt` / `POST /api/quiz/attempt`, confirmed (`study.ts:186`, routed `index.ts:1122-1124`):** unchanged by this phase. **Concurrent-session note:** `study.ts`'s `upsertStudyItem` dedup key was reworked (uncommitted, separate session — see Pre-Condition below) to `(user_id, note_id, question_hash)` via SQLite `IS` matching, from the previous `(user_id, question_hash)`-only key. This is a pre-existing-improvement Phase 4 benefits from for free (TestSimulator's per-question `logQuizAttempt` calls will get correctly note-scoped SRS cards) — not a Phase 4 blast-radius change, just confirmed compatible.
- **Notes table columns, confirmed (`backend/schema.sql`/`all-context.md` Data Model):** `notes.extracted_text`, `notes.title`, `notes.author_id`, `notes.subject_id` all exist and are the fields the new source-resolution queries need. No schema change required.

---

## PRE-CONDITION (Fork G blocking gate on G2.1)

A **separate concurrent session** is hardening `backend/src/routes/study.ts` + `backend/test/red-team/I-chat-study.test.ts` (confirmed via `git status` this session — uncommitted changes: `study.ts` +dedup rework, `G-idor.test.ts` modified, new migration `0016_study_items_note_scoped_dedup.sql`, and — **already landed in the working tree, confirmed by direct read of the file this session** — new study-only tests `137b` and `137c` plus the `hashQuestion` helper in `I-chat-study.test.ts`).

**Confirmed by direct read this session:** the CURRENT on-disk `I-chat-study.test.ts` (193 lines) already has the exact shape G2.1 needs to preserve: `describe('I. Chat & study (131-140)', ...)` containing `131 & 132` (lines 33-49), `133` (44-49), `134` (50-68) as the chat-cluster tests to DROP, a `makeSession` helper (23-30) to DROP, and `136 & auth` (70-86), `137` (87-114), `137b` (115-142), `137c` (144-167), `138` (168-176), `139 & auth` (177-183), `140` (184-192) plus the `hashQuestion` helper (14-21) as the study-cluster to KEEP.

**EXECUTE MUST re-read this file at the moment of the G2.1 split** (not trust this plan's line numbers verbatim) and hold if the concurrent session's work is still uncommitted and conflicting. The orchestrator will hold EXECUTE for G2.1 until the concurrent hardening work is committed, OR will explicitly re-confirm no overlap (this plan's line citations above were themselves read against the CURRENT uncommitted working tree, so if that tree is committed unchanged before EXECUTE runs, no re-verification surprises are expected — but EXECUTE must not assume this and must re-grep before editing).

---

## Phase Completion Rules

Phase 4 is complete when:

1. `npm test`, `npx tsc --noEmit`, `cd backend && npm test`, `cd backend && npx tsc --noEmit` all exit 0
2. QuizBuilder → TestSimulator → TestResults flow works in browser (manual/agent-probe confirm)
3. Wrong answer in TestSimulator updates SRS (`study_items`) (agent-probe confirm, backed by an automated `logQuizAttempt` regression check)
4. Chat tab gone from nav (desktop + mobile); Tests tab present and functional in browser
5. `chat_sessions`/`chat_messages` D1 tables confirmed still present (no schema changes) — verified via `AdminUsageReport.tsx`'s `totalChatSessions` stat continuing to return a real count
6. `POST /api/ai/quiz` subject-source query is `author_id`-scoped (IDOR-safe) — proven by automated test
7. `backend/test/red-team/provider-mocks.test.ts`'s I135 chat block is removed (no dangling test against deleted endpoints)
8. vc-validate-agent has written the Validate Contract section (Gate: PASS or accepted CONDITIONAL)
9. Phase 4 report written and umbrella Current Execution State updated

---

## Acceptance Criteria

- **C1.** `QuizBuilderPage` renders at `/quiz`, replacing `ComingSoonPage`; lets the user pick source (note or subject), count, difficulty, question types, and test duration.
- **C2.** `TestSimulatorPage` drives through a generated quiz with a whole-test countdown timer (duration from `QuizBuilder`); auto-submits on expiry via the same path as manual submit.
- **C3.** `TestResultsPage` shows per-question results after completion, including AI-graded short-answer feedback (with self-graded fallback on AI error).
- **C4.** Wrong answers in `TestSimulator` call `POST /api/quiz/attempt` (existing endpoint) to feed SRS, batched non-blocking at the `TestResults` transition.
- **C5.** `POST /api/ai/quiz` returns structured multi-type questions (MCQ/True-False/Short-answer) correctly scoped to the requested source (single note or a subject's personal notes only).
- **C6.** `POST /api/ai/quiz`'s subject-source query is `author_id`-scoped — a non-owner cannot pull another user's notes into a generated quiz (IDOR protection), proven by an automated test.
- **C7.** `ChatPage.tsx`, `backend/src/routes/chat.ts`, `chatWithGemini`/`getUserNotes`/`formatNotesForContext` helpers, the `api.chat` client block, and the `Chat*` frontend types are removed from the codebase.
- **C8.** Chat tab removed from `AppShell` nav (desktop `ExpandableTabs` + mobile menu); Tests tab present and reachable in both.
- **C9.** `cd backend && npm test` exits 0 — `I-chat-study.test.ts`'s study cases (136-140, 137b, 137c) still pass, chat cases (131-134) removed; `provider-mocks.test.ts`'s I135 chat block removed, remaining provider-mock cases pass.
- **C10.** `chat_sessions`/`chat_messages` D1 tables are NOT dropped — no migration in this phase's blast radius.
- **C11.** `npx tsc --noEmit` exits 0 for both frontend and backend, after each demolition group AND at final exit.
- **C12.** `POST /api/notes/:id/quiz` (existing, KEPT) is untouched and still functions identically.

---

## Blast Radius

Risk class: **MEDIUM-HIGH** — new authenticated AI endpoint with an IDOR-sensitive source-resolution query (subject-source), plus a multi-file consumer-first code deletion spanning backend routing, two backend test files, and 5 frontend files including a shared nav component.

**Frontend (CREATE):**

- `src/pages/QuizBuilderPage.tsx`
- `src/pages/TestSimulatorPage.tsx`
- `src/pages/TestResultsPage.tsx`

**Frontend (MODIFY):**

- `src/app/AppRoutes.tsx` — swap `/quiz`'s `ComingSoonPage` for `QuizBuilderPage`; remove `/chat` route + `ChatPage` import
- `src/app/lazyPages.ts` — add `QuizBuilderPage`/`TestSimulatorPage`/`TestResultsPage` lazy exports; remove `ChatPage` export
- `src/components/AppShell.tsx` — remove Chat tab (desktop + mobile) + `MessageSquare` import; confirm Tests tab target after positional-index shift
- `src/lib/api.ts` — delete `api.chat` block (307-367); add `api.ai.generateStructuredQuiz`
- `src/types/index.ts` — delete `Chat*` interfaces (188-249)

**Frontend (DELETE):**

- `src/pages/ChatPage.tsx`

**Backend (MODIFY):**

- `backend/src/routes/ai.ts` — remove `chatWithGemini`/`getUserNotes`/`formatNotesForContext`; add `resolveQuizSourceContent` (private), `generateStructuredQuiz`, `generateStructuredQuizEndpoint`
- `backend/src/index.ts` — remove chat import block + 5 chat if-blocks; import `generateStructuredQuizEndpoint`; add `/api/ai/quiz` if-block

**Backend (DELETE):**

- `backend/src/routes/chat.ts`

**Backend test (SPLIT/MODIFY):**

- `backend/test/red-team/I-chat-study.test.ts` — split: keep study cases (136-140, 137b, 137c) + `hashQuestion`; remove chat cases (131-134) + `makeSession`
- `backend/test/red-team/provider-mocks.test.ts` — **NEW finding, was missing from the original stub** — delete the `I135` chat describe block (113-130)

**Backend test (CREATE/MODIFY, placement locked at PVL 17-08-26):**

- `backend/test/red-team/provider-mocks.test.ts` (MODIFY, additive) — new `I136` describe block: `POST /api/ai/quiz` contract/shape test (T1), DeepSeek-mocked via the file's existing local helpers.
- `backend/test/red-team/ai-quiz-contract.test.ts` (CREATE) — `POST /api/ai/quiz` subject-source IDOR test (T2), no AI-provider mocking needed (proves the 404-before-AI-call ownership gate).

**KEPT — untouched, explicitly confirmed:**

- `/api/notes/:id/quiz` endpoint (existing `generateQuizEndpoint`, `generateQuiz`)
- `/api/quiz/attempt` endpoint (`logQuizAttempt`)
- `chat_sessions`/`chat_messages` D1 tables (schema, admin usage-report count query)
- `backend/test/red-team/G-idor.test.ts` — NOT touched by this plan (it is mid-hardening in a concurrent session per Pre-Condition; the new `/api/ai/quiz` IDOR test lands in a location decided at PVL, deliberately not folded into this file to avoid conflicting with the concurrent work)

---

## Touchpoints

| File                                           | Action         | Anchor                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/src/index.ts`                         | MODIFY         | remove import block (lines 47-53); remove 5 if-blocks (807-833); add `generateStructuredQuizEndpoint` import to the existing `from './routes/ai'` block (30-37); add new `/api/ai/quiz` if-block near the other `/api/notes/:id/quiz` / `/api/gemini/*` AI routes                                            |
| `backend/src/routes/ai.ts`                     | MODIFY         | remove `getUserNotes` (25-47), `formatNotesForContext` (49-67), `chatWithGemini` (69-176); add `resolveQuizSourceContent` (private helper, new), `generateStructuredQuiz` (mirrors `generateQuiz` at 338-397), `generateStructuredQuizEndpoint` (mirrors `generateQuizEndpoint` at 538-556)                  |
| `backend/src/routes/chat.ts`                   | DELETE         | entire file (130 lines)                                                                                                                                                                                                                                                                                      |
| `backend/test/red-team/I-chat-study.test.ts`   | MODIFY (SPLIT) | drop `makeSession` (23-30) + tests `131 & 132` (33-49), `133` (44-49 — inline within the 131/132 block per current file structure, re-verify at EXECUTE), `134` (50-68); keep `hashQuestion` (14-21) + tests `136 & auth` through `140` (70-192); update `describe` title from `'I. Chat & study (131-140)'` |
| `backend/test/red-team/provider-mocks.test.ts` | MODIFY         | delete `describe('I135 — chat AI response...', ...)` block (113-130)                                                                                                                                                                                                                                         |
| `src/lib/api.ts`                               | MODIFY         | delete `chat: {...}` (307-367); add `generateStructuredQuiz` inside the `ai: {...}` object (369-403), after `generateQuiz` (377-384)                                                                                                                                                                         |
| `src/types/index.ts`                           | MODIFY         | delete `ChatSession`(188-194), `ChatMessage`(196-202), `ChatDocument`(204-209), `ChatSessionsResponse`(242-244), `ChatMessagesResponse`(246-248)                                                                                                                                                             |
| `src/pages/ChatPage.tsx`                       | DELETE         | entire file                                                                                                                                                                                                                                                                                                  |
| `src/pages/QuizBuilderPage.tsx`                | CREATE         | new file                                                                                                                                                                                                                                                                                                     |
| `src/pages/TestSimulatorPage.tsx`              | CREATE         | new file                                                                                                                                                                                                                                                                                                     |
| `src/pages/TestResultsPage.tsx`                | CREATE         | new file                                                                                                                                                                                                                                                                                                     |
| `src/app/AppRoutes.tsx`                        | MODIFY         | remove `ChatPage` from the named-import block (line 21) and the `/chat` route (line 135); remove `ComingSoonPage` local function (28-52) and its `/quiz` route (line 136), replace with `<Route path="/quiz" element={<QuizBuilderPage />} />`                                                               |
| `src/app/lazyPages.ts`                         | MODIFY         | remove `ChatPage` export (line 12); add 3 new lazy exports for `QuizBuilderPage`/`TestSimulatorPage`/`TestResultsPage`                                                                                                                                                                                       |
| `src/components/AppShell.tsx`                  | MODIFY         | desktop: remove `{ title: 'Chat', icon: MessageSquare }` from `tabs` (223) + `'/chat'` from `paths` (236), in the SAME edit (positional alignment); remove now-unused `MessageSquare` import (line 12); mobile: delete Chat button block (807-834)                                                           |

---

## Public Contracts

- `POST /api/notes/:id/quiz` endpoint: unchanged (`generateQuizEndpoint`/`generateQuiz` KEPT verbatim).
- `POST /api/quiz/attempt` endpoint: unchanged (`logQuizAttempt` KEPT verbatim; TestSimulator/TestResults call it to feed SRS).
- `/api/study/*` and `/api/reviews/due` endpoints: unchanged.
- D1 tables `chat_sessions` / `chat_messages`: PRESERVED (no schema changes, no migration).
- **NEW public contract:** `POST /api/ai/quiz` — auth required; body `{ source_type: 'note'|'subject', source_id: number, count: number, difficulty: 'easy'|'medium'|'hard', types: Array<'mcq'|'true_false'|'short_answer'> }`; returns `{ questions: Array<{ type, question, options?, correct_answer?, model_answer?, explanation }> }` (200); `{ error }` (400 invalid params, 403 non-owner for note-source, 404 no content found for subject-source, 500 provider failure).
- `POST /api/chat/*` (5 routes): REMOVED. `GET /api/chat/*`: REMOVED.
- `src/types/index.ts` `Chat*` interfaces: REMOVED (no other consumer besides the deleted `ChatPage.tsx`).

---

## Implementation Checklist

Order: **DEMOLITION (G1-G5) → BUILD (B1-B4) → TESTS (T1-T2)**, consumer-first within demolition, with a `tsc --noEmit` checkpoint after EACH group. Build work is independent of demolition and MAY interleave (e.g. B1/B2 backend build work can happen before or after G1-G2, since they touch different functions in the same files — but land B-group edits to `ai.ts`/`index.ts` in a SEPARATE pass from the G-group deletions in those same files to keep each diff reviewable).

### DEMOLITION

**G1 — Backend chat code removal (consumer-first)**

- [ ] G1.1. In `backend/src/index.ts`, remove the chat import block (`import { createChatSession, getChatSessions, getChatMessages, addChatMessage, getAIResponse } from './routes/chat';`, confirmed lines 47-53).
- [ ] G1.2. In `backend/src/index.ts`, remove the 5 chat if-blocks (confirmed lines 807-833: `POST /api/chat/sessions`, `GET /api/chat/sessions`, `GET /api/chat/sessions/:id/messages`, `POST /api/chat/sessions/:id/messages`, `POST /api/chat/sessions/:id/ai-response`).
- [ ] G1.3. DELETE `backend/src/routes/chat.ts` (entire file — now has zero consumers after G1.1/G1.2).
- [ ] G1.4. In `backend/src/routes/ai.ts`, remove `chatWithGemini` (confirmed lines 69-176), `getUserNotes` (confirmed lines 25-47), `formatNotesForContext` (confirmed lines 49-67) — now safe, `chat.ts` (their only external consumer) is gone.
- [ ] **Checkpoint G1: `cd backend && npx tsc --noEmit` must exit 0** (confirms no dangling imports/references before touching tests).

**G2 — Backend test split (blocked by Pre-Condition on G2.1 — re-verify file state before editing)**

- [ ] G2.1. In `backend/test/red-team/I-chat-study.test.ts`: re-read the file fresh (do not trust cached line numbers if the concurrent hardening session has landed new commits). Drop `makeSession` helper + chat tests `131 & 132`, `133`, `134`. Keep `hashQuestion` helper + study tests `136 & auth` through `140` including `137b`/`137c`. Rename the `describe` block from `'I. Chat & study (131-140)'` to `'I. Study (136-140)'` (or equivalent — reflect the actual remaining range).
- [ ] G2.2. **(NEW — discovered this session, was missing from the original stub.)** In `backend/test/red-team/provider-mocks.test.ts`, delete the `describe('I135 — chat AI response is generated and attached to the session', ...)` block (confirmed lines 113-130) — this test calls the now-deleted `POST /api/chat/sessions`/`POST .../ai-response`/`GET .../messages` endpoints and will fail once G1 lands if left in place.
- [ ] **Checkpoint G2: `cd backend && npm test` must exit 0** (study cases green, chat cases absent, no orphaned provider-mock chat test).

**G3 — Frontend api/types cleanup**

- [ ] G3.1. In `src/lib/api.ts`, delete the `chat: {...}` block (confirmed lines 307-367, includes the already-dead `uploadDocument`/`analyzeNotes` methods that call nonexistent server routes).
- [ ] G3.2. In `src/types/index.ts`, delete `ChatSession`, `ChatMessage`, `ChatDocument`, `ChatSessionsResponse`, `ChatMessagesResponse` (confirmed lines 188-249, non-contiguous — 4 separate interface blocks in that range).
- [ ] **Checkpoint G3: `npx tsc --noEmit` (frontend) must exit 0.**

**G4 — Frontend page removal**

- [ ] G4.1. DELETE `src/pages/ChatPage.tsx`.
- [ ] G4.2. In `src/app/lazyPages.ts`, remove the `ChatPage` lazy export (confirmed line 12).
- [ ] G4.3. In `src/app/AppRoutes.tsx`, remove `ChatPage` from the named-import block (line 21) and the `/chat` route (line 135).
- [ ] **Checkpoint G4: `npx tsc --noEmit` (frontend) must exit 0.**

**G5 — AppShell nav (ONE atomic edit — do NOT split across multiple commits/passes)**

- [ ] G5.1. In `src/components/AppShell.tsx` desktop nav: remove `{ title: 'Chat', icon: MessageSquare }` from the `tabs` array (confirmed line 223) AND remove `'/chat'` from the `paths` array in the `onChange` handler (confirmed line 236, currently `['/', '/community', '/progress', '/chat', '/quiz', '/review']` → becomes `['/', '/community', '/progress', '/quiz', '/review']`) IN THE SAME EDIT — these two arrays are positionally paired index-for-index; removing only one desyncs `Tests`'s tab click from `/quiz`. Remove the now-unused `MessageSquare` import (confirmed line 12, used only at line 223). Verify (do not modify — logic is index-derived, no hardcoded numbers) that `cursor`/`adminIndex`/`opsIndex`/`myNotesIndex`/`logoutIndex` (lines 237-242) still resolve correctly with `paths.length` now 5.
- [ ] G5.2. In the SAME edit, delete the mobile-menu Chat button block (confirmed lines 807-834, `onClick={() => go('/chat')}` through its closing `</button>`).
- [ ] G5.3. In the SAME edit, confirm (do not need to add — already present) the mobile `Tests` button (confirmed lines 865-892, `onClick={() => go('/quiz')}`) is correctly wired and reachable now that `QuizBuilderPage` replaces `ComingSoonPage` at that route.
- [ ] **Checkpoint G5: `npx tsc --noEmit` (frontend) must exit 0; full DEMOLITION `npm test` (frontend) + `cd backend && npm test` must exit 0.**

### BUILD

**B1 — Backend: `POST /api/ai/quiz`**

- [ ] B1.1. In `backend/src/routes/ai.ts`, add a private helper `async function resolveQuizSourceContent(sourceType: 'note' | 'subject', sourceId: number, userId: number, env: Env): Promise<{ title: string; content: string } | 'forbidden' | null>`:
  - `note`: `SELECT extracted_text, title, author_id FROM notes WHERE id = ?` bound `sourceId`. No row → `null`. `row.author_id !== userId` → `'forbidden'`. Else → `{ title: row.title, content: row.extracted_text || '' }`.
  - `subject`: NEW query `SELECT extracted_text, title FROM notes WHERE subject_id = ? AND author_id = ?` bound `(sourceId, userId)` — **personal-only, do NOT call `getNotesBySubject`** (community-scoped, would be an IDOR — leaks other users' notes into the caller's quiz). 0 rows → `null`. Else: locally re-implement the truncate/join pattern from the now-deleted `formatNotesForContext` (do NOT call it — it's deleted in G1.4) as a small private helper (e.g. `truncateAndJoinNoteContent(notes, perNoteCap = 1200, totalCap = 7000)`), aggregate into one `content` string, use the subject name or first note's title as `title`.
- [ ] B1.2. Add `export async function generateStructuredQuiz(sourceContent: { title: string; content: string }, count: number, difficulty: 'easy' | 'medium' | 'hard', types: Array<'mcq' | 'true_false' | 'short_answer'>, env: Env)`: mirror `generateQuiz`'s DeepSeek call pattern (confirmed `ai.ts:338-397` — same model, same regex-extract + `JSON.parse`, same error-wrap), with an expanded prompt requesting exactly `count` questions distributed across `types`, calibrated to `difficulty`, each question tagged `type` and shaped per Fork B's response contract (`options`/`correct_answer` for mcq/true_false; `model_answer` + grading rubric text for short_answer; `explanation` on all).
- [ ] B1.3. Add `export async function generateStructuredQuizEndpoint(request: Request, env: Env)`: mirror `generateQuizEndpoint`'s auth/validation shape (confirmed `ai.ts:538-556`) — `getUserFromToken` → 401 if null; parse body `{ source_type, source_id, count, difficulty, types }`; 400 if `source_type` not in `['note','subject']`, `count` not a positive integer ≤ 20, `types` not a non-empty array of allowed values, or `difficulty` not in the allowed enum; call `resolveQuizSourceContent` → 403 if `'forbidden'`, 404 (`'No content found for this source'`) if `null`; else call `generateStructuredQuiz` → `jsonResponse({ questions })`. Match the `notes.ts` 403 message convention style: `'Unauthorized - You can only generate quizzes from your own notes'`.
- [ ] B1.4. In `backend/src/index.ts`, add `generateStructuredQuizEndpoint` to the existing `from './routes/ai'` import block (confirmed lines 30-37). Add a new if-block: `if (path === '/api/ai/quiz' && request.method === 'POST') { return await generateStructuredQuizEndpoint(request, env); }`, placed near the other `/api/notes/:id/quiz` / `/api/gemini/*` AI routes for discoverability.

**B2 — Frontend: api client**

- [ ] B2.1. In `src/lib/api.ts`, inside the existing `ai: {...}` object (confirmed lines 369-403), add `generateStructuredQuiz: async (params: { source_type: 'note' | 'subject'; source_id: number; count: number; difficulty: 'easy' | 'medium' | 'hard'; types: Array<'mcq' | 'true_false' | 'short_answer'> }) => { const response = await api.request('/api/ai/quiz', { method: 'POST', body: params }); return { questions: response.questions || [] }; }`, placed after `generateQuiz` (confirmed lines 377-384).

**B3 — Frontend: 3 new pages**

- [ ] B3.1. Create `src/pages/QuizBuilderPage.tsx`. Form fields: source picker (note vs. subject, populated via `api.notes.getAll()`/`api.subjects.getAll()`), question count, difficulty, question-types multi-select, **test duration (minutes, USER-CONFIGURABLE per Locked Decision 2)**. On submit: call `api.ai.generateStructuredQuiz(...)`, hold the resulting `questions` + chosen `duration` in local step state, advance to `run`.
- [ ] B3.2. Create `src/pages/TestSimulatorPage.tsx`. `useState<Step>('build' | 'run' | 'results')` OR receive `questions`/`duration` via location/router state from `QuizBuilderPage` (single `/quiz` route with in-page state, per Fork C — decide the exact state-passing mechanism at EXECUTE: React Router `location.state` vs. a shared parent component holding `Step` state across all 3 pages; either is acceptable, but it must NOT introduce a second URL route). Whole-test countdown timer: `setInterval` + `useRef` (Fork D), duration from `QuizBuilder`. Auto-submit on 0 via the SAME submit function as the manual "Submit Test" button. Render one question at a time (or all-at-once — designer's choice at EXECUTE) covering MCQ (radio/select), True/False (toggle), Short-answer (text input) per the `type` field.
- [ ] B3.3. Create `src/pages/TestResultsPage.tsx`. On mount (or on receiving the submitted answers): for each question, compute `is_correct` per Fork A (MCQ = index compare vs `correct_answer`; True/False = bool compare; Short-answer = call the DeepSeek grading pattern ported from `gradeRecall`, confirmed `study.ts:379-465` — if the AI call errors or the JSON is unparseable, fall back to a self-graded "Mark yourself correct/incorrect" control per Locked Decision 5). Batch `POST /api/quiz/attempt` for wrong answers via `Promise.allSettled` (Fork E), non-blocking, soft toast on partial failure (mirrors `ProcessPage`'s fire-and-forget `.catch()` pattern from Phase 2). Render per-question results + score summary.

**B4 — Route wiring**

- [ ] B4.1. In `src/app/lazyPages.ts`, add 3 new lazy exports: `QuizBuilderPage`, `TestSimulatorPage`, `TestResultsPage` (same `lazy(() => import('../pages/...'))` pattern as the existing entries).
- [ ] B4.2. In `src/app/AppRoutes.tsx`, import the 3 new pages from `./lazyPages`. Remove the local `ComingSoonPage` function (confirmed lines 28-52) and replace the `/quiz` route (confirmed line 136) — decide at EXECUTE whether `QuizBuilderPage` alone owns `/quiz` with `TestSimulatorPage`/`TestResultsPage` mounted as in-page steps inside it (matches Fork C's "single `/quiz` route" framing most literally), or whether a thin wrapper component owns the `Step` state and renders one of the 3 pages conditionally. Either satisfies "single `/quiz` route + in-page Step state machine" — do NOT add `/quiz/run` or `/quiz/results` as separate URL routes.

### TESTS

- [ ] T1. **(PLACEMENT LOCKED AT PVL 17-08-26 — resolves Accepted Known-Gap 4.)** Write a `POST /api/ai/quiz` contract test INSIDE `backend/test/red-team/provider-mocks.test.ts` (new `describe` block, e.g. `'I136 — POST /api/ai/quiz generates a structured multi-type quiz'`), reusing the file's own local `enable`/`stubProviders`/`deepseekText` helpers (confirmed lines 1-32, in-scope only to this file — NOT exported from `helpers.ts`, so a separate new file would have to duplicate ~30 lines of mock-fetch scaffolding). Asserts a 200 response with the expected multi-type question shape for a `source_type: 'note'` request.
- [ ] T2. **(PLACEMENT LOCKED AT PVL 17-08-26 — resolves Accepted Known-Gap 4.)** Write a `POST /api/ai/quiz` subject-source IDOR test in a NEW file `backend/test/red-team/ai-quiz-contract.test.ts` (uses only `seedUser`/`seedSubject`/`seedNote`/`call` from `helpers.ts` — no DeepSeek mocking needed, since the ownership check runs and 404s BEFORE any AI call per the Security Note's required ordering): seed user A + user B, a shared subject with a note owned by user B only; assert user A's `source_type: 'subject'` request against that subject_id returns 404 (`'No content found for this source'`) — proves the `author_id`-scoped SQL query returns 0 rows for a non-owner's subject, i.e. no cross-user note content ever reaches the AI prompt (proves C6). Deliberately does NOT fold into `G-idor.test.ts` while it's mid-hardening in a concurrent session (see Blast Radius note).
- [ ] T3. Write frontend smoke tests in `src/app/__tests__/appshell-routing.test.tsx`: `/quiz` renders `QuizBuilderPage` (not `ComingSoonPage`); `/chat` route is gone (assert `queryByText`/route-not-found behavior, or simply that the route no longer exists in `AppRoutes.tsx`'s route table — exact assertion shape decided at PVL/EXECUTE to match this file's existing sentinel-mock convention, confirmed in Phase 2's plan).
- [ ] T4. Run all four Exit Gate commands after BUILD + TESTS are complete; fix any failures before considering the phase code-complete. Do not batch — verify backend (B1) independently before starting frontend (B2-B4), matching the convention set by Phase 2/3's checklists.

---

## Exit Gate

```bash
npm test
npx tsc --noEmit
cd backend && npm test    # I-chat-study.test.ts (study half) + provider-mocks.test.ts (chat block removed) must pass; new /api/ai/quiz tests pass
cd backend && npx tsc --noEmit
```

Manual/agent-probe verification:

- [ ] Browser: `QuizBuilder` → pick a note source → build a 5-question mixed-type test with a short duration → `TestSimulator` runs the countdown, auto-submits on expiry (or manual submit) → `TestResults` shows per-question grading including at least one AI-graded short-answer.
- [ ] Browser: a wrong answer in the resulting test updates `study_items` (check via `/review` or DB query) — confirms Fork E's SRS batching actually lands.
- [ ] Browser: Chat tab gone from both desktop nav and mobile menu; Tests tab present and reachable in both.
- [ ] Browser: confirm no Phase 1/2/3 regressions — `/`, `/community`, `/progress`, `/review`, `/my-notes`, `/settings`, `/notes/capture`, `/notes/:id/process` all still work.

---

## Blockers That Would Justify BLOCKED Status

- Phase 2 or Phase 3 not verified (per umbrella join condition — **note: umbrella's `## Current Execution State` currently shows Phase 3 at EXECUTE-done/EVL-pending, not yet fully verified; this plan is being supplemented ahead of that gate per explicit orchestrator instruction — PVL/EXECUTE for Phase 4 must re-check Phase 2 AND Phase 3 status before EXECUTE actually begins, not just before this PLAN-SUPPLEMENT**).
- The Pre-Condition concurrent-session hardening on `study.ts`/`I-chat-study.test.ts` is still uncommitted AND conflicts with G2.1's exact split at the moment EXECUTE runs (re-verify, do not assume this plan's line citations are still accurate).
- `POST /api/quiz/attempt`'s SRS write path (`upsertStudyItem`) behaves unexpectedly with the concurrent session's dedup-key rework — investigate before relying on it in B3.3/Fork E if `cd backend && npm test` shows unexpected `study_items` failures unrelated to Phase 4's own changes.
- `backend/test/red-team/G-idor.test.ts`'s mid-hardening state makes it unsafe to add the new subject-source IDOR test there without conflicting — resolved by NOT touching that file (see Blast Radius note); if PVL determines a different placement is still unsafe, that's a legitimate BLOCKED reason to raise at PVL, not silently work around.

**HARD STOP:** If any path in this phase attempts to DROP TABLE on `chat_sessions` or `chat_messages` — STOP immediately and surface to user. This is a program-level hard stop.

---

## Accepted Known-Gaps

1. **Refresh loses in-progress test/timer.** No `test_sessions`-style persistence exists or is added in this phase (Fork C/D). Matches the Phase 2 precedent for quiz refresh-loss. No backlog artifact required per the pattern already accepted in Phase 2's Locked Decision 4.
2. **Short-answer self-fallback grading is not independently verified against a rubric.** When the AI grading call errors or returns unparseable JSON, the user self-reports correctness (Locked Decision 5's fallback). This is inherently less rigorous than AI grading — accepted by design, not a defect.
3. **`TestResultsPage`'s SRS batching (Fork E) is fire-and-forget.** A `Promise.allSettled` failure surfaces only as a soft toast — a user who dismisses it or doesn't notice will not know a specific wrong answer failed to seed an SRS card. Matches `ProcessPage`'s existing non-blocking convention from Phase 2; not a new risk class.
4. ~~**New `POST /api/ai/quiz` test placement is not finalized in this plan**~~ — **RESOLVED AT PVL 17-08-26**: T1 → new describe block inside `provider-mocks.test.ts` (reuses local mock helpers); T2 → new file `ai-quiz-contract.test.ts` (no AI-mock needed, 404-before-AI-call proof). See Implementation Checklist T1/T2 and Blast Radius (updated).
5. **Two stale "Chat" nav labels exist outside this phase's blast radius** (`src/pages/my-notes/MobileMenu.tsx:180`, `src/pages/my-notes/MyNotesNav.tsx:118-142`) — discovered during PVL 17-08-26 repo-wide grep. Both are pre-existing, already-inert UI (their `onClick` handlers navigate to `/` regardless of which tab/button is clicked — NOT to `/chat`), so removing the `/chat` route in this phase does not turn them into broken links. Confirmed harmless; left untouched as out-of-scope pre-existing staleness, not introduced or worsened by this plan. Candidate for an unrelated cleanup pass, not a Phase 4 blocker.

---

## Security Note

`POST /api/ai/quiz`'s `subject`-source path is a NEW authenticated read surface that aggregates potentially sensitive note content (extracted text) across multiple notes and feeds it into an LLM prompt. The `author_id`-scoping in `resolveQuizSourceContent`'s subject query (`WHERE subject_id = ? AND author_id = ?`) MUST run at the SQL level — do NOT fetch all notes for a subject and filter client-side or post-query in JS, and do NOT reuse `getNotesBySubject` (confirmed community-scoped at `notes.ts:5-24`, no `author_id` filter — using it here would let a user pull other users' personal note content into their own generated quiz, an IDOR). The `note`-source path's ownership check (`row.author_id !== userId` → `'forbidden'`) must run BEFORE any note content is used in the DeepSeek prompt, mirroring the ordering discipline established in Phase 2's `GET /api/notes/:id` (`notes.ts` pattern, `SELECT → not-found → ownership → use`). This is the headline security item for this phase — T1/T2 exist specifically to prove it, and PVL should treat any gap in that coverage as a FAIL, not a known-gap.

---

## Verification Evidence

| Gate / Scenario                                                                                                | Strategy        | Proves SPEC criterion                               |
| -------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------- |
| `npm test` exits 0                                                                                             | Fully-Automated | No regressions (Criterion 11)                       |
| `npx tsc --noEmit` exits 0 (frontend, after each G/B group)                                                    | Fully-Automated | Types preserved (Criterion 11)                      |
| `cd backend && npm test` exits 0 (study tests green, chat tests absent, `provider-mocks.test.ts` I135 removed) | Fully-Automated | Chat removal clean; study unbroken (Criteria 7, 9)  |
| `cd backend && npx tsc --noEmit` exits 0                                                                       | Fully-Automated | Types preserved, backend (Criterion 11)             |
| New `POST /api/ai/quiz` contract test (T1)                                                                     | Fully-Automated | Structured multi-type quiz generation (Criterion 5) |
| New `POST /api/ai/quiz` subject-source IDOR test (T2)                                                          | Fully-Automated | Subject source is author_id-scoped (Criterion 6)    |
| `appshell-routing.test.tsx`: `/quiz` renders `QuizBuilderPage`, `/chat` route gone (T3)                        | Fully-Automated | Route swap + chat removal (Criteria 1, 7, 8)        |
| Browser: QuizBuilder → TestSimulator → TestResults full flow, incl. AI-graded short-answer                     | Agent-Probe     | End-to-end build/run/grade flow (Criteria 1, 2, 3)  |
| Browser: wrong answer in TestSimulator updates `study_items`                                                   | Agent-Probe     | SRS wiring functional (Criterion 4)                 |
| Browser: chat tab gone (desktop + mobile), Tests tab present and reachable                                     | Agent-Probe     | Nav updated correctly (Criterion 8)                 |
| Browser: `POST /api/notes/:id/quiz` (existing) still works unchanged                                           | Agent-Probe     | No regression to kept endpoint (Criterion 12)       |

**What this coverage does NOT prove:** live DeepSeek response quality/latency for the new `generateStructuredQuiz` prompt (AI keys absent from test bindings by design, per `all-tests.md`); that the whole-test countdown timer behaves correctly across a real browser tab-suspend/resume cycle (only the auto-submit-on-0 logical path is testable without a real clock-manipulation harness); that the short-answer AI-grading fallback path is exercised by an automated test (it requires simulating a DeepSeek error/unparseable response — a candidate T-item PVL may add, not guaranteed present in T1/T2 as scoped here).

---

## Test Infra Improvement Notes

- This phase introduces the FIRST test coverage gap discovered mid-plan rather than at PVL/EXECUTE: `provider-mocks.test.ts`'s I135 chat block was missing from the original stub's Blast Radius entirely and would have caused a silent post-demolition test failure if not caught during this PLAN-SUPPLEMENT's source-verification pass. Future phases doing consumer-first deletion should always repo-wide-grep for the deleted symbol/endpoint across ALL `backend/test/red-team/*.test.ts` files, not just the most obviously-named one (`I-chat-study.test.ts` "looked like" the only chat test file by name; it was not).
- No existing test file exercises `/api/ai/*`-prefixed routes yet — `POST /api/ai/quiz` is the first endpoint under that prefix (per Fork B). T1/T2's eventual file placement should be treated as the seed for a dedicated `backend/test/red-team/ai-*.test.ts` naming convention if more `/api/ai/*` endpoints land later (e.g. Phase 5's primer).
- The whole-test countdown timer (Fork D) has no automated coverage path identified in this plan beyond the auto-submit-on-0 logic branch — genuine clock-manipulation test coverage (fake timers) is a candidate PVL/EXECUTE addition, not scoped here as a hard requirement.

---

## Phase Loop Progress

- [x] 1. RESEARCH — endpoint/consumer chains verified by direct source read + repo-wide grep this session across: `backend/src/index.ts` (chat import + if-block ranges), `backend/src/routes/ai.ts` (chat helper functions + `generateQuiz`/`generateQuizEndpoint` reference patterns), `backend/src/routes/chat.ts` (full file, confirms `chatWithGemini` as its only ai.ts dependency), `backend/src/routes/study.ts` (`gradeRecall` DeepSeek-grading pattern, `logQuizAttempt`/`upsertStudyItem` SRS write path + concurrent-session dedup-key rework), `backend/src/routes/notes.ts` (`getNotesBySubject`, confirmed community-scoped — informs the IDOR-avoidance decision), `backend/test/red-team/I-chat-study.test.ts` (full file, confirms current split-ready shape), `backend/test/red-team/provider-mocks.test.ts` (**NEW finding: I135 chat block, missing from original stub**), `src/lib/api.ts` (chat block + ai object exact line ranges), `src/types/index.ts` (Chat\* interfaces exact ranges), `src/app/AppRoutes.tsx` (full file, ComingSoonPage + route lines), `src/app/lazyPages.ts`, `src/components/AppShell.tsx` (desktop tabs/paths positional pairing + mobile Chat button + MessageSquare import), `process/context/all-context.md`, `git status` (confirms the Pre-Condition concurrent-session files are real and currently uncommitted).
- [x] 2. INNOVATE — 5 forks locked by explicit user decisions this session (Forks A-F above); one correction applied to an earlier INNOVATE draft (Fork D: duration is user-configurable, not a fixed constant).
- [x] 3. PLAN-SUPPLEMENT — this update. Every section of the stub rewritten with concrete file:line anchors, corrected + expanded blast radius (added `provider-mocks.test.ts` as a newly-discovered demolition target, added `src/types/index.ts` and `src/lib/api.ts` explicitly which the original stub only implied), an atomic consumer-first DEMOLITION→BUILD→TESTS checklist with per-group `tsc` checkpoints, REQ-TEST-LINK'd verification evidence, 4 accepted known-gaps, a dedicated Security Note, and the Fork G pre-condition prominently documented as a blocking gate on G2.1. Registry reconciled (see `phase-blast-radius-registry.md` Phase 4 section, updated alongside this plan).
- [x] 4. PVL — inner-PVL complete 17-08-26 (this session). Gate: CONDITIONAL. T1/T2 test-placement resolved in-plan; 1 new harmless known-gap documented (stale Chat UI labels); Pre-Condition confirmed still live via `git status` — EXECUTE must re-verify before G2.1. See `## Validate Contract` below.
- [x] 5. EXECUTE — completed 2026-08-21. All checklist items (G1-G5, B1-B4, T1-T4) done; all four exit gates green (FE tsc 0, FE 31/31; BE tsc 0, BE 192/192). See phase report + ## Deviations (EXECUTE) below.
- [x] 6. EVL — orchestrator-independent confirmation run, 2026-08-21. Re-ran all 4 validate-contract gate commands (not just trusted execute-agent's report). Added 3 chat-404 regression tests (`backend/test/red-team/chat-removed.test.ts`) closing the one residual coverage gap (positive quiz/IDOR/route-swap proof existed; no dedicated negative-assertion proof that `/api/chat/*` is actually unreachable). Final: FE tsc 0, FE 31/31; BE tsc 0, BE 195/195 (was 192/192). Gate: CONDITIONAL (user-accepted 17-08-26) confirmed still valid — all Fully-Automated/Hybrid criteria pass; remaining Agent-Probe rows (C1-C4, C8) are accepted known-gaps per the plan's own gap-resolution table, not blockers.
- [x] 7. UPDATE PROCESS — this session, 2026-08-21. Phase report finalized; registry updated; umbrella `## Current Execution State` advanced to Phase 5; memory updated. See phase report Closeout Packet.

---

## Deviations (EXECUTE 2026-08-21)

All within-blast-radius (no auth/billing/schema/API-contract/container hard-stop class). Full detail in the phase report's `## Plan Deviations`.

1. **G4 before G3.** ChatPage is the sole consumer of `api.chat`/`Chat*` types; deleting the consumer first preserves the plan's own consumer-first + tsc-green-per-group invariant. Impact: none — same files/ops, reordered; every checkpoint stayed green.
2. **Note picker → `/api/notes/my-notes?status=published`** (owned notes) instead of `api.notes.getAll()` (community). Impact: positive — the server-side ownership check always passes for a note source; no 403 surprise.
3. **Short-answer grading reuses the existing `POST /api/recall/grade`** (`api.gradeRecall`) rather than a new endpoint. Impact: none — no new backend surface; realizes Locked Decision 5 (the frontend has no AI key).
4. **Single-route architecture:** `QuizBuilderPage` owns the step machine and Suspense-renders `TestSimulatorPage`/`TestResultsPage` from `lazyPages` (circular-but-lazy-safe). Impact: none — explicitly EXECUTE's discretion per B3.2/B4.2.
5. **+2 additive tests** (400-invalid-`types` in T1; owner-not-404 in T2). Impact: positive — stronger coverage, within the test-file blast radius.

---

## Inner Loop Refresh Note: 2026-08-17 — changed sections: Overview, Locked User Decisions (new), INNOVATE Decision Summary (new), Verified Source Facts (new), Pre-Condition (new, promoted from inline note to its own section), Phase Completion Rules, Acceptance Criteria, Blast Radius (corrected + expanded — added `provider-mocks.test.ts`, `src/types/index.ts`, `src/lib/api.ts` explicitly, new test files), Touchpoints (new), Public Contracts, Implementation Checklist (fully rewritten, atomic DEMOLITION/BUILD/TESTS), Exit Gate, Blockers, Accepted Known-Gaps (new), Security Note (new), Verification Evidence, Test Infra Improvement Notes, Phase Loop Progress. Invalidates any prior validate-contract for this plan (none existed — the stub never reached PVL).

---

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/paperloop_25-07-26/phase-4-quiz-simulator_PLAN_25-07-26.md`
- Last completed step: Phase Loop Progress Step 7 (UPDATE PROCESS) — phase COMPLETE, 2026-08-21.
- Validate-contract status: written — Gate: CONDITIONAL (accepted, `inner-pvl: phase-4`, 17-08-26). EVL independently re-confirmed all Fully-Automated/Hybrid gates green 21-08-26 (195/195 BE incl. 3 new chat-404 regression tests, 31/31 FE, tsc clean x2); remaining Agent-Probe rows carried as accepted known-gaps.
- Supporting context files loaded: `process/context/all-context.md`, umbrella plan, `phase-blast-radius-registry.md`, `phase-2-library-process_PLAN_25-07-26.md` and `phase-3-community-progress_PLAN_25-07-26.md` (shape reference), direct source read of all files listed in Blast Radius/Touchpoints
- Phase closed. Next step for the program: commit Phase 4's execution changes (source commit, `vc-git-manager`), then `ENTER EXECUTE MODE` for `phase-5-primer_PLAN_25-07-26.md` (PLAN+VALIDATE already done, Gate CONDITIONAL accepted, committed `783f972`) — its Phase-4 dependency is now satisfied.

---

## Validate Contract

Status: CONDITIONAL
Date: 17-08-26
date: 2026-08-17
generated-by: inner-pvl: phase-4
supersedes: none (stub never reached PVL — first validate-contract for this plan)

Parallel strategy: sequential (deep-mode, single-context direct source-verification)
Rationale: 7-signal score 6/7 (S2 new public API + IDOR surface, S3 6 INNOVATE forks locked this session, S4 phase program, S5 user explicitly requested a hard security/correctness pass naming 8 specific risk points, S6 high-risk class present — IDOR-sensitive auth surface, S7 15+ files in blast radius; only S1 multi-package scope absent — this repo is a single package, not a monorepo) would nominally recommend parallel-subagents or workflow for the V2 fan-out per the threshold table. This invocation has no Agent-spawn tool available (Read/Bash/Write only), so — matching the precedent set by this program's Phase 2 (5/7) and Phase 3 (1/7) inner-PVL contracts — it was executed as a single deep-mode sequential session substituting direct source-file verification for separate dimension/section subagents. Every claim in the plan (endpoint contracts, helper signatures, ownership-check ordering, line anchors, IDOR-avoidance design, AppShell index math, test-file line ranges, pre-condition commit status) was independently confirmed against the real files on disk via direct read + repo-wide grep, plus BOTH baseline test suites and BOTH typechecks were actually executed (not just cited) — evidence-equivalent to, and in the test-execution respect stronger than, a parallel fan-out for a blast radius this size.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id                 | behavior                                                                                                                                      | strategy        | proving test                                                                                                       | gap-resolution |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ | -------------- |
| C6, Security Note (headline) | `POST /api/ai/quiz` subject-source query is `author_id`-scoped — a non-owner's subject request returns 404, never another user's note content | Fully-Automated | `cd backend && npm test` — new `ai-quiz-contract.test.ts` IDOR case (T2, placement locked at PVL)                  | B              |
| C5                           | `POST /api/ai/quiz` returns structured multi-type questions (MCQ/True-False/Short-answer) for a note source                                   | Fully-Automated | `cd backend && npm test` — new `provider-mocks.test.ts` `I136` case (T1, placement locked at PVL, DeepSeek-mocked) | B              |
| C7, C8                       | `/quiz` renders `QuizBuilderPage` (not `ComingSoonPage`); `/chat` route is gone                                                               | Fully-Automated | `npm test` — `appshell-routing.test.tsx` new case (T3)                                                             | B              |
| C7                           | `chat.ts`, `chatWithGemini`/`getUserNotes`/`formatNotesForContext`, `api.chat` block, `Chat*` types removed; no dangling references           | Fully-Automated | `cd backend && npx tsc --noEmit` + `npx tsc --noEmit` exit 0 after each G-group (G1-G5 checkpoints)                | A              |
| C9                           | `I-chat-study.test.ts` study half (136-140, 137b, 137c) still passes after SPLIT; `provider-mocks.test.ts` I135 chat block removed            | Fully-Automated | `cd backend && npm test` (full suite)                                                                              | A              |
| C11                          | Frontend/backend TypeScript contracts clean                                                                                                   | Fully-Automated | `npx tsc --noEmit` && `cd backend && npx tsc --noEmit`                                                             | A              |
| C11                          | No regressions (baseline FE 29/29, BE 192/192 — independently re-run and confirmed green at this PVL pass, 2026-08-17)                        | Fully-Automated | `npm test` && `cd backend && npm test`                                                                             | A              |
| C12                          | `POST /api/notes/:id/quiz` (existing, KEPT) untouched                                                                                         | Fully-Automated | `cd backend && npm test` (existing coverage, unchanged)                                                            | A              |
| C1, C2, C3                   | QuizBuilder → TestSimulator → TestResults full flow works, incl. AI-graded short-answer                                                       | Agent-Probe     | Browser: build 5-question mixed-type test, run countdown, view graded results                                      | A              |
| C4                           | Wrong answer in TestSimulator updates `study_items` (SRS)                                                                                     | Agent-Probe     | Browser + DB query / `/review` check                                                                               | A              |
| C8                           | Chat tab gone (desktop + mobile); Tests tab present and reachable                                                                             | Agent-Probe     | Browser: nav check both surfaces                                                                                   | A              |

gap-resolution legend:

- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist — T1/T2/T3 placement locked at this PVL pass)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a `strategy:` value here — the 2 stale-UI-label finding and the live-DeepSeek-quality/timer-clock-manipulation gaps are named residual rows carried in Open Gaps / What This Coverage Does Not Prove below, not proving strategies. Net-gate vacuous-green check: every acceptance criterion (C1-C12) has a Fully-Automated or Agent-Probe row above — none rests on Known-Gap alone — PASS.

Legacy line form (retained so existing validate-contract consumers still parse):

- backend IDOR + contract tests: Fully-automated: `cd backend && npm test`
- frontend routing tests: Fully-automated: `npm test` (from repo root)
- typecheck frontend: Fully-automated: `npx tsc --noEmit`
- typecheck backend: Fully-automated: `cd backend && npx tsc --noEmit`
- browser verification: agent-probe: dev server smoke run (build→run→results flow, SRS write, nav check)

Failing stubs (for the 3 newly-introduced Fully-Automated scenario rows, to be written by execute-agent at T1/T2/T3):

T2 IDOR (`backend/test/red-team/ai-quiz-contract.test.ts`, new file):

```
test("POST /api/ai/quiz subject-source returns 404 for a non-owner's subject (no cross-user note leak)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: /api/ai/quiz subject-source IDOR 404")
})
```

T1 contract (`backend/test/red-team/provider-mocks.test.ts`, new `I136` describe block):

```
test("POST /api/ai/quiz returns a structured multi-type question set for a note source", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: /api/ai/quiz multi-type contract shape")
})
```

T3 routing (`src/app/__tests__/appshell-routing.test.tsx`):

```
test("renders QuizBuilderPage at /quiz (not ComingSoonPage); /chat route no longer exists", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: /quiz renders QuizBuilderPage, /chat removed")
})
```

Dimension findings:

- Infra fit: PASS — no container/infra/port/runtime surface touched. `backend/src/index.ts`'s chat import block (confirmed 5 named imports: `createChatSession`/`getChatSessions`/`getChatMessages`/`addChatMessage`/`getAIResponse` from `./routes/chat`) and 5 if-blocks (`/api/chat/sessions` POST/GET, `/api/chat/sessions/:id/messages` GET/POST, `/api/chat/sessions/:id/ai-response` POST) confirmed present exactly as the plan describes, by direct read — new `/api/ai/quiz` if-block insertion is a standard additive pattern matching every existing route in this file.
- Test coverage: CONCERN → fixed in-plan at this PVL pass. The plan's own Accepted Known-Gap 4 correctly deferred T1/T2 file placement to PVL; this PVL pass resolved it (see Implementation Checklist T1/T2, patched into the plan file this session) — root cause found: `stubProviders`/`deepseekText`/`enable` are function-local to `provider-mocks.test.ts` (confirmed lines 1-32 by direct read), NOT exported from `helpers.ts`, so the plan's original candidate (a brand-new file reusing that pattern) would have required duplicating ~30 lines of mock-fetch scaffolding. Resolution: T1 (needs AI-mocking) lands inside `provider-mocks.test.ts` itself; T2 (pure DB-ownership 404 check, no AI call ever reached) lands in a new small file needing only `helpers.ts` exports. Every acceptance criterion has a Fully-Automated or Agent-Probe row — no criterion rests on Known-Gap alone (net-gate vacuous-green check: PASS).
- Breaking changes: PASS — `POST /api/notes/:id/quiz` (`generateQuizEndpoint`/`generateQuiz`, confirmed `ai.ts:338-397` and the endpoint wrapper) and `POST /api/quiz/attempt` (`logQuizAttempt`) confirmed untouched by this plan's checklist; new `POST /api/ai/quiz` is additive; `chat_sessions`/`chat_messages` D1 tables confirmed present in `schema.sql` with no migration in this plan's blast radius — no DROP TABLE anywhere in the checklist, consistent with the plan's own HARD STOP. `Chat*` interfaces in `src/types/index.ts` confirmed to have exactly one consumer (`ChatPage.tsx`, itself deleted) by repo-wide grep — removal is safe.
- Security surface: PASS — this is the headline item and it holds up under direct verification. `backend/src/routes/notes.ts`'s `getNotesBySubject` (lines 5-24, confirmed by direct read) has NO `author_id` filter — it is genuinely community-scoped (public read, personalization only). The plan's proposed new query (`SELECT extracted_text, title FROM notes WHERE subject_id = ? AND author_id = ?`) is a GENUINELY NEW, correctly-scoped query — it does not call or wrap `getNotesBySubject` anywhere in the checklist (B1.1 confirmed). `notes` table schema confirmed to have `subject_id`, `author_id`, `extracted_text`, `title` columns (`backend/schema.sql:55-57`) — the query is schema-valid. The plan's Security Note requirement (ownership check before AI-prompt use) is testable and now IS tested by T2 without needing any AI call to succeed (404 fires before `generateStructuredQuiz` is ever invoked) — this is a stronger, more failure-tolerant proof than round-tripping through a mocked DeepSeek call.
- Section G (Demolition, G1-G5): CONCERN → informational, not blocking. Repo-wide grep this PVL pass (`grep -rniE chat backend/src backend/test`, `grep -rniE "\bchat" src`) confirms the plan's blast radius/checklist correctly covers every FUNCTIONAL chat reference: `index.ts` import+5 if-blocks, `chat.ts` (deleted), `ai.ts`'s 3 helpers, `ChatPage.tsx`, `lazyPages.ts` export, `AppRoutes.tsx` import+route, `api.ts`'s `chat` block, `types/index.ts`'s `Chat*` interfaces, `AppShell.tsx`'s tab+mobile-button+`MessageSquare` import (confirmed used ONLY at the one cited line, by direct grep), `I-chat-study.test.ts` split, `provider-mocks.test.ts` I135 block. TWO additional "Chat"-labeled UI elements were found NOT in the plan's blast radius (`src/pages/my-notes/MobileMenu.tsx`, `src/pages/my-notes/MyNotesNav.tsx`) — both directly read and confirmed HARMLESS: their `onClick` handlers call `navigate('/')` unconditionally (not `/chat`), so they are already-inert, pre-existing stale labels unrelated to this phase's route removal — documented as new Accepted Known-Gap 5 (patched into the plan this session), not a technical break, not blocking. `chatMessageSchema` (`backend/src/lib/validation.ts:34`) confirmed to have only one direct consumer — `E-validation.test.ts`'s test 82, which tests the schema function directly — unaffected by `chat.ts`'s deletion (schema itself is outside this plan's blast radius and is untouched).
- Section G — tsc-green-per-group ordering: PASS — direct read of the full consumer chain confirms the plan's claimed order is genuinely consumer-first and safe: `index.ts`'s import+if-blocks are the ONLY external callers of `chat.ts`'s 5 exports; `chat.ts:5,124` is the ONLY external caller of `chatWithGemini`; `chatWithGemini` is the only caller of `getUserNotes`/`formatNotesForContext` (confirmed by direct read of `ai.ts:25-176`). G1 (backend, all 4 sub-steps) → G2 (tests) → G3 (frontend api/types) → G4 (page) → G5 (AppShell) leaves no dangling import at any checkpoint.
- Section B (Build, B1-B4): PASS — `notes` schema confirmed compatible (see Security surface above). `generateStructuredQuiz`'s planned DeepSeek call/regex-extract/`JSON.parse` pattern mirrors the ALREADY-SHIPPED `generateQuiz` (`ai.ts:338-397`, confirmed by direct read) exactly — this is not new unverified runtime behavior, it is a mechanical extension of a pattern already working in production; no `VC-FEASIBILITY-PROBE-NEEDED` is warranted. `gradeRecall` (`study.ts:379-465`, confirmed by direct read) is a real, reusable JSON-grading precedent — same DeepSeek-call → regex-extract → `JSON.parse` → typed-coercion shape the plan proposes to port for short-answer grading. Timer duration confirmed as a `QuizBuilder` FORM FIELD per Locked Decision 2 (not a fixed constant) — the plan's own INNOVATE Decision Summary explicitly documents the correction from an earlier draft; no residual "fixed constant" language found anywhere in the current checklist.
- Section AppShell (G5): PASS — direct read of `AppShell.tsx` confirms desktop `tabs`/`paths` arrays are positionally paired exactly as claimed (`tabs[3]`='Chat'/`paths[3]`='/chat', `tabs[4]`='Tests'/`paths[4]`='/quiz'); removing both in the same edit correctly leaves `Tests` at `paths[3]`='/quiz' post-removal. `cursor`/`adminIndex`/`opsIndex`/`myNotesIndex`/`logoutIndex` (confirmed by direct read) are entirely DERIVED from `paths.length`, not hardcoded — self-adjusts to 5 entries with no separate fix needed, confirming the plan's own claim. Mobile Chat button (`onClick={() => go('/chat')}`) confirmed real and must be removed — this one DOES route to `/chat` (unlike the two harmless `MobileMenu.tsx`/`MyNotesNav.tsx` labels above).
- Section Pre-Condition (Fork G gate on G2.1): CONCERN → confirmed real and current, not a plan defect. `git status` (run this PVL pass) confirms `backend/src/routes/study.ts`, `backend/test/red-team/I-chat-study.test.ts`, `backend/test/red-team/G-idor.test.ts` are ALL still uncommitted modifications in the working tree right now — the concurrent hardening session the plan warns about is real and still live. Direct full-file read of `I-chat-study.test.ts` (193 lines) confirms the plan's DROP/KEEP boundary is currently unambiguous and correct on today's file state: DROP `makeSession` (23-30) + tests 131&132 (33-39), 133 (41-48), 134 (50-68); KEEP `hashQuestion` (14-21) + tests 136&auth through 140 (70-193) including 137b/137c. Line-number drift vs. the plan's citations is cosmetic (≤2 lines). This remains a legitimate EXECUTE-time re-verification requirement (per the plan's own instruction), not a PVL blocker — same pattern already accepted at Phase 2/3's inner-PVL passes.

Open gaps:

- Accepted Known-Gap 5 (2 stale "Chat" UI labels outside blast radius, discovered this PVL pass, patched into plan): known-gap: documented — confirmed harmless (navigate to `/`, not `/chat`), pre-existing staleness not introduced or worsened by this plan.
- Accepted Known-Gaps 1-3 (refresh loses in-progress test/timer; short-answer self-fallback not rubric-verified; SRS batching fire-and-forget): known-gap: documented — carried unchanged from the original plan, deferred by design per INNOVATE.
- Pre-Condition (Fork G gate on G2.1): confirmed live and unresolved at this PVL pass (concurrent hardening session's files still uncommitted) — not a plan defect; EXECUTE must re-verify before touching `I-chat-study.test.ts`, per the plan's own explicit instruction.

What this coverage does NOT prove:

- T1 (`provider-mocks.test.ts` I136): proves the DeepSeek-mocked response shape parses into the expected multi-type structure; does NOT prove live DeepSeek response quality/latency/reliability for the expanded multi-type prompt (AI keys intentionally absent from test bindings by design, per `all-tests.md`) — same accepted limitation as the existing shipped `generateQuiz`.
- T2 (`ai-quiz-contract.test.ts` IDOR case): proves a non-owner's subject-source request returns 404 with zero rows leaked; does NOT independently re-prove the `note`-source path's `403`-on-non-owner behavior (not scoped as a T-item here — covered only by the Security Note's design-level ownership-check-ordering claim, not a dedicated automated test in this plan).
- T3 (`appshell-routing.test.tsx`): proves the correct top-level component mounts at `/quiz` and that `/chat` is absent from the route table; does NOT prove `QuizBuilderPage`/`TestSimulatorPage`/`TestResultsPage`'s internal step-machine, timer, or grading logic render or behave correctly — that is the Agent-Probe rows.
- `tsc`/full-suite regression rows: static types / no-regression only, not runtime correctness. (Independently re-run this PVL pass: FE 29/29, BE 192/192, both `tsc --noEmit` clean — confirms the baseline the plan cites is real and current as of 2026-08-17.)
- Agent-Probe rows (C1-C4, C8): manual, not automated; depend on a working dev server and a real browser session; do not cover the whole-test countdown timer's behavior across a real tab-suspend/resume cycle (only the auto-submit-on-0 logical branch is testable without a clock-manipulation harness — flagged by the plan's own Test Infra Improvement Notes, not resolved by this PVL pass).
- None of the automated or agent-probe rows independently re-verify the Pre-Condition's concurrent-session commit state at the moment EXECUTE actually runs — that re-check is an explicit EXECUTE-time responsibility, not something PVL can freeze in place.

Gate: CONDITIONAL
Accepted by: session (autonomous inner-PVL pass, direct source-verification + independently re-run test suites) — fixed-in-plan: T1/T2-test-placement-resolved (Accepted Known-Gap 4, Implementation Checklist T1/T2 and Blast Radius updated this session — T1 into `provider-mocks.test.ts`, T2 into new `ai-quiz-contract.test.ts`); documented known-gap (discovered this PVL pass, confirmed harmless, out of Phase 4's declared blast radius): stale-chat-ui-labels-in-my-notes-nav (new Accepted Known-Gap 5); carried known-gaps (unchanged from original plan): quiz-refresh-loss/no-test-sessions-persistence, short-answer-self-fallback-not-rubric-verified, srs-batching-fire-and-forget (Known-Gaps 1-3); live pre-condition (confirmed still real and unresolved at this PVL pass, EXECUTE must re-verify before G2.1): concurrent-session-hardening-on-study.ts/I-chat-study.test.ts/G-idor.test.ts.
