---
phase: phase-04-quiz-simulator
date: 2026-08-21
status: COMPLETE
feature: paperloop
plan: process/general-plans/active/paperloop_25-07-26/phase-4-quiz-simulator_PLAN_25-07-26.md
---

# Phase 4 — Quiz + Test Simulator — EXECUTE Report

**TL;DR:** Chat feature demolished (code-only, D1 tables kept) and a fresh Quiz/Test
Simulator built on a single `/quiz` route with a new author-scoped `POST /api/ai/quiz`
endpoint. All four exit-gate commands green: **FE tsc 0 · FE tests 31/31 · BE tsc 0 ·
BE tests 195/195** (192 post-build baseline + 3 new chat-404 regression tests added
during the EVL confirmation pass — see `backend/test/red-team/chat-removed.test.ts`).
Concurrent firebase/coverage-stream files (`auth.ts`/`db.ts`/`env.ts`/`provider-mocks.test.ts`'s
unrelated blocks/migration 0015/`gaps-*.test.ts`/`firebase-auth-migration_24-07-26/`) were NOT
touched. No DROP TABLE anywhere (HARD STOP respected). EVL independently re-ran and confirmed
GATES-GREEN: IDOR author-scoping on subject-source (T2), chat demolition completeness (zero
`/api/chat/*` reachable, proven by the new regression file), test-split integrity
(`I-chat-study.test.ts` study half intact incl. 137b/137c), and `/quiz` route swap (T3).
Agent-probe browser checks are the only remaining (manual) verification — all by-design
known-gaps, not blockers.

## EVL Confirmation Run (orchestrator-independent)

- **Trigger:** EXECUTE reported all 4 exit gates green; orchestrator re-ran the validate-contract
  gate commands independently rather than trusting execute-agent's internal report.
- **Regression hardening added during EVL:** `backend/test/red-team/chat-removed.test.ts` (new,
  3 tests) — explicit 404 regression guard proving `/api/chat/sessions` (POST/GET) and
  `/api/chat/sessions/:id/ai-response` are unreachable for a validly authenticated user (not merely
  absent from the router by 401/500 coincidence). This closes the one residual gap in the original
  T1-T3 coverage: the plan's Verification Evidence table proved the _positive_ surfaces (quiz
  contract, IDOR, route swap) but had no dedicated negative-assertion test proving the chat
  endpoints are gone rather than just unused. BE test count: 192 → 195.
- **Result:** FE tsc 0, FE tests 31/31, BE tsc 0, BE tests 195/195 (was 192/192 pre-EVL). All green,
  independently confirmed — not merely execute-agent's self-report.

## What Was Done

### DEMOLITION (G1–G5) — consumer-first, tsc-green per group

- **G1** `backend/src/index.ts`: removed the 5-symbol chat import block + 5 chat if-blocks;
  **deleted** `backend/src/routes/chat.ts`; removed `getUserNotes`/`formatNotesForContext`/
  `chatWithGemini` from `backend/src/routes/ai.ts`. → backend tsc 0.
- **G2** split `backend/test/red-team/I-chat-study.test.ts` (dropped `makeSession` + chat tests
  131/132/133/134; kept `hashQuestion` + study 136–140 incl. committed **137b/137c**; renamed
  describe → `I. Study (136-140)`); removed the **I135** chat block from
  `backend/test/red-team/provider-mocks.test.ts`. → backend tests 188/188.
- **G3** removed the `api.chat` client block from `src/lib/api.ts` and the 5 `Chat*` interfaces
  from `src/types/index.ts`. → frontend tsc 0.
- **G4** deleted `src/pages/ChatPage.tsx`; removed its `lazyPages.ts` export and its
  `AppRoutes.tsx` import + `/chat` route. → frontend tsc 0.
- **G5** (atomic) `src/components/AppShell.tsx`: removed the `Chat` desktop tab + `'/chat'` from
  the positionally-paired `paths` array (Tests auto-shifts to `paths[3]='/quiz'`) + the unused
  `MessageSquare` import + the mobile-menu Chat button. Index math is `paths.length`-derived and
  self-adjusted to 5. → frontend tsc 0 + FE 29/29 + BE 188/188.

### BUILD (B1–B4)

- **B1** `backend/src/routes/ai.ts`: `resolveQuizSourceContent` (note = ownership-checked;
  subject = **author_id-scoped** `WHERE subject_id=? AND author_id=?`, never `getNotesBySubject`),
  `truncateAndJoinNoteContent` (ported truncation, ~1200/note, 7000 cap), `generateStructuredQuiz`
  (DeepSeek, multi-type prompt), `generateStructuredQuizEndpoint` (401/400×5/403/404/500). Wired in
  `index.ts` with `requireUser` + `checkRateLimit(String(id),'ai',env)` (mirrors study-plan).
- **B2** `src/lib/api.ts`: `api.ai.generateStructuredQuiz({source_type,source_id,count,difficulty,types})`.
- **B3** three fresh pages: `QuizBuilderPage.tsx` (orchestrator + `build`/`run`/`results` step
  machine + source/count/difficulty/types/duration form), `TestSimulatorPage.tsx` (per-type inputs +
  whole-test `setInterval`/`useRef` countdown + auto-submit-on-0 via the same path as manual submit),
  `TestResultsPage.tsx` (Fork A grading: index/bool compare + short-answer via existing
  `api.gradeRecall` with self-graded fallback; wrong answers batched into SRS via
  `Promise.allSettled`, non-blocking + soft toast).
- **B4** added 3 lazy exports; swapped `/quiz` from `ComingSoonPage` → `QuizBuilderPage` (removed the
  `ComingSoonPage` local fn).

### TESTS (T1–T3)

- **T1** `provider-mocks.test.ts` `I136` describe: DeepSeek-mocked note-source contract (200, 3-type
  shape) + a 400-invalid-`types` guard.
- **T2** new `backend/test/red-team/ai-quiz-contract.test.ts`: subject-source IDOR — attacker's
  request against an owner-only subject → **404** (`No content found for this source`); owner's same
  request is NOT 404/403 (proves author-scoping returns rows for the owner only).
- **T3** `appshell-routing.test.tsx`: `/quiz` renders `QuizBuilderPage` (not ComingSoon); `/chat`
  route gone.

## What Was Skipped or Deferred

- **Agent-probe browser checks** (build→run→results flow incl. AI short-answer; wrong answer updates
  `study_items`; nav check desktop+mobile; `/api/notes/:id/quiz` still works): manual/EVL tier — not
  runnable from this agent (no browser). All Fully-Automated gates that gate DONE are green.
- Accepted Known-Gaps 1–5 from the plan carried unchanged, all by-design (not defects):
  1. Refresh loses in-progress test/timer (no `test_sessions` persistence; matches Phase 2 precedent).
  2. Short-answer self-graded fallback not independently rubric-verified (accepted per Locked
     Decision 5's fallback design).
  3. SRS batching (`Promise.allSettled`) is fire-and-forget; a failure surfaces only as a soft toast.
  4. (Resolved at PVL — T1/T2 test placement locked; no residual.)
  5. 2 stale "Chat" labels in `src/pages/my-notes/MobileMenu.tsx` + `MyNotesNav.tsx` — confirmed
     still inert (their `onClick` handlers navigate to `/`, not `/chat`), pre-existing staleness
     outside this phase's blast radius, left untouched.
- **Test infra artifact (non-blocking):** stale build cache `backend/dist/routes/chat.js` emits a
  harmless sourcemap warning during backend test import — `dist/` is build output (regenerated on
  build, not source); flagged for a future `dist` clean pass, not a Phase 4 blocker.

## Concurrent-Stream Boundary (confirmed clean)

Zero Edit/Write issued to any file in either concurrent uncommitted stream during this phase's
EXECUTE or EVL:

- **firebase-auth-migration stream:** `backend/src/lib/auth.ts`, `backend/src/lib/db.ts`,
  `backend/src/lib/env.ts`, `backend/migrations/0015_add_firebase_uid.sql`,
  `backend/test/red-team/gaps-*.test.ts`, `process/general-plans/active/firebase-auth-migration_24-07-26/`
  — all remain in their pre-existing uncommitted state (still uncommitted as of this UPDATE PROCESS
  session; not Phase 4's concern).
- **SRS-hardening stream:** `backend/src/routes/study.ts`, `backend/test/red-team/G-idor.test.ts`,
  migration `0016_study_items_note_scoped_dedup.sql` — this stream committed separately at `e14e0b2`
  before Phase 4's EXECUTE ran; Phase 4 built on top of the committed state cleanly (no collision;
  `I-chat-study.test.ts`'s G2.1 split was re-verified fresh against the committed file per the
  plan's own Pre-Condition instruction).

## Test Gate Outcomes

| Gate                             | Result                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit` (frontend)    | exit 0                                                                                                                                  |
| `npm test` (frontend)            | 31/31 (7 files) — was 29 baseline + T3×2                                                                                                |
| `cd backend && npx tsc --noEmit` | exit 0                                                                                                                                  |
| `cd backend && npm test`         | 195/195 (28 files) — 188 post-demolition + T1×2 + T2×2 (EXECUTE, 192 total) + 3 chat-404 regression tests (EVL, `chat-removed.test.ts`) |

Per-group demolition checkpoints all green (G1 BE tsc, G2 BE 188, G3/G4 FE tsc, G5 FE tsc+29 / BE 188).
EVL confirmation run (orchestrator-independent, post-EXECUTE): all 4 gates re-verified green at
195/195 BE / 31/31 FE, including the 3 new chat-removal regression tests.

## Plan Deviations (all within blast radius)

1. **G4 executed before G3.** ChatPage is the sole consumer of `api.chat` + `Chat*` types; the plan's
   own consumer-first + tsc-green-per-group mandate requires deleting the consumer before the consumed
   api/types (removing them first would break the G3 checkpoint). Same files, same ops, reordered.
2. **Note-source picker uses `/api/notes/my-notes?status=published`** (owned notes) instead of the
   plan's cited `api.notes.getAll()` — `getAll` returns community notes, which would 403 at generation.
   Same api surface; correctness refinement so the ownership check always passes for a note source.
3. **Short-answer grading reuses the existing `POST /api/recall/grade` endpoint** (via `api.gradeRecall`)
   rather than porting the pattern into a new endpoint — the frontend has no AI key, and the plan said
   "reuse the gradeRecall pattern." No new backend surface. In-scope realization of Locked Decision 5.
4. **Single-route architecture:** `QuizBuilderPage` owns the step machine and Suspense-renders
   `TestSimulatorPage`/`TestResultsPage` (imported from `lazyPages`, circular-but-lazy-safe). The plan
   (B3.2/B4.2) explicitly left this to EXECUTE discretion.
5. **+2 additive tests** beyond T1/T2 (400-invalid-types; owner-not-404 strengthening) — within the
   test-file blast radius.

## Test Infra Gaps Found

- Stale build artifact `backend/dist/routes/chat.js` emits a harmless sourcemap warning during backend
  test import (dist/ is build output, regenerated on build — not source, out of scope, left as-is).
- `backend/test/red-team/README.md` (concurrent firebase/coverage stream, NOT edited by this phase) now
  carries a stale mention of scenario "135 / chat paths" for `provider-mocks.test.ts`. Flagged by the
  plan's Pre-Condition; it is the concurrent stream's file to reconcile, not Phase 4's.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/paperloop_25-07-26/phase-4-quiz-simulator_PLAN_25-07-26.md`
- **Finished:** all Implementation Checklist items G1–G5, B1–B4, T1–T4. All 4 exit-gate commands green.
- **Verified (automated):** chat removal clean (zero `/api/chat` in source); IDOR author-scoping (T2);
  multi-type contract (T1); route swap (T3); no regressions (FE 31, BE 192); no DROP TABLE; D1 chat
  tables intact in schema; `/api/notes/:id/quiz` + `/api/quiz/attempt` untouched.
- **Unverified (manual/agent-probe):** live browser build→run→grade flow; real SRS write on a wrong
  answer end-to-end; nav visual check; live DeepSeek multi-type quality (keys absent by design).
- **Cleanup remaining:** commit Phase 4 source (execution commit, orchestrator's next action outside
  this UPDATE PROCESS session); umbrella `## Current Execution State` advanced to Phase 5 (this
  session).
- **Concurrent-stream boundary:** CONFIRMED CLEAN — auth.ts/db.ts/env.ts/migration 0015/gaps-\*.test.ts/
  firebase-auth-migration folder retain their pre-existing uncommitted state; zero Edit/Write issued to
  any of them. SRS-hardening stream committed separately at `e14e0b2` before Phase 4 EXECUTE ran.
- **Best next state:** `Ready for UPDATE PROCESS archival` — DONE this session. EVL confirmation run
  independently re-verified all 4 gates green (195/195 BE, 31/31 FE) including the 3 new chat-404
  regression tests. Execution commit is the orchestrator's next action, then Phase 5 EXECUTE.

## Forward Preview

### Test Infra Found

- Backend red-team harness (`helpers.ts`: `seedUser`/`seedSubject`/`seedNote`/`call`/`env`) + the
  file-local `enable`/`stubProviders`/`deepseekText` mock scaffolding in `provider-mocks.test.ts` are
  the pattern for any future `/api/ai/*` contract test. `seedNote` does NOT set `extracted_text` — tests
  needing note content must `UPDATE notes SET extracted_text` after seeding.
- `ai-quiz-contract.test.ts` seeds the `backend/test/red-team/ai-*.test.ts` naming convention for the
  `/api/ai/*` prefix (Phase 5's primer can extend it).

### Blast Radius Changes

- New public surface: `POST /api/ai/quiz` (auth + `ai` rate limit). New client method
  `api.ai.generateStructuredQuiz`. 3 new pages on `/quiz`. Chat surface fully removed (code only).

### Commands to Stay Green

- `npm test` · `npx tsc --noEmit` (root) · `cd backend && npm test` · `cd backend && npx tsc --noEmit`

### Dependency Changes

- None. No new packages, no schema/migration changes, no env/secret changes (reuses `DEEPSEEK_API_KEY`).
- Next phase: **Phase 5 (Primer)** — `process/general-plans/active/paperloop_25-07-26/phase-5-primer_PLAN_25-07-26.md` (plan already committed at 783f972).
