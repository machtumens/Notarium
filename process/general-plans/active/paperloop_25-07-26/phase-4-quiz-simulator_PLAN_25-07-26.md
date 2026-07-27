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
**Date** 25-07-26
**Status** ⏳ PLANNED (stub — to be fleshed out via RESEARCH/INNOVATE before PVL)
**Complexity** COMPLEX
**Report destination:** `process/general-plans/active/paperloop_25-07-26/phase-4-quiz-simulator_REPORT_25-07-26.md`

---

## Overview

Add a dedicated Quiz and Test Simulator surface. Also remove the chat feature (code only — D1 tables preserved). Two parallel concerns bundled in one phase because chat removal makes space in the nav for the Tests tab, and both touch the same files (AppShell, AppRoutes, lazyPages, backend index.ts, ai.ts).

New features: QuizBuilderPage, TestSimulatorPage, TestResultsPage + `/api/ai/quiz` backend endpoint.

Chat removal: code-only. D1 tables `chat_sessions` and `chat_messages` are KEPT.

**FORK LOCKED:** `chat_sessions` and `chat_messages` D1 tables are KEPT. No migration, no DROP TABLE.

---

## Entry Gate

- Phase 2 verified (process inbox functional — quiz source selection may depend on note context)
- Phase 3 verified (Community label in place — chat tab removal is cleaner after Phase 3 nav is settled)

---

## Phase Completion Rules

Phase 4 is complete when:

1. `npm test`, `npx tsc --noEmit`, `cd backend && npm test`, `cd backend && npx tsc --noEmit` all exit 0
2. QuizBuilder → TestSimulator → TestResults flow works in browser (manual confirm)
3. Wrong answer in TestSimulator updates SRS (study_items) (agent-probe confirm)
4. Chat tab gone from nav; Tests tab present in browser
5. chat D1 tables confirmed still present (no schema changes)
6. vc-validate-agent has written the Validate Contract section (Gate: PASS or accepted CONDITIONAL)
7. Phase 4 report written and umbrella Current Execution State updated

---

## Acceptance Criteria

1. QuizBuilderPage renders at `/quiz`
2. TestSimulatorPage renders and drives through a generated quiz
3. TestResultsPage shows results after completion
4. Wrong answers in TestSimulator call `/api/quiz/attempt` to feed SRS (existing endpoint)
5. ChatPage.tsx, backend/src/routes/chat.ts, chatWithGemini helpers are removed from codebase
6. Chat tab removed from AppShell nav; Tests tab present
7. `cd backend && npm test` exits 0 (study test cases in I-chat-study.test.ts still pass; chat cases removed)
8. D1 tables `chat_sessions` and `chat_messages` are NOT dropped
9. `npx tsc --noEmit` exits 0

---

## Blast Radius

**Frontend (CREATE):**

- `src/pages/QuizBuilderPage.tsx`
- `src/pages/TestSimulatorPage.tsx`
- `src/pages/TestResultsPage.tsx`

**Frontend (MODIFY):**

- `src/app/AppRoutes.tsx` — add /quiz, /quiz/run, /quiz/results routes; remove /chat route
- `src/app/lazyPages.ts` — add quiz page exports; remove ChatPage export
- `src/components/AppShell.tsx` — remove chat tab; activate Tests tab (was placeholder from Phase 1)

**Frontend (DELETE):**

- `src/pages/ChatPage.tsx`

**Backend (MODIFY):**

- `backend/src/routes/ai.ts` — remove chatWithGemini + helpers; add generateQuiz
- `backend/src/index.ts` — remove 5 chat route if-blocks; add /api/ai/quiz if-block

**Backend (DELETE):**

- `backend/src/routes/chat.ts`

**Backend test (SPLIT):**

- `backend/test/red-team/I-chat-study.test.ts` — split: keep study test cases; remove chat test cases

---

## Implementation Checklist

**STUB — to be expanded during Phase 4 RESEARCH/PLAN-SUPPLEMENT**

- [ ] A1. Research exact chat.ts function list and ai.ts line ranges for chatWithGemini removal
- [ ] A2. Research /api/quiz/attempt endpoint signature (existing) for SRS wiring in TestSimulator
- [ ] A3. Design QuizBuilder → TestSimulator → TestResults page flow
- [ ] A4. Add generateQuiz to backend/src/routes/ai.ts (params: source_type, source_id, count, types, difficulty)
- [ ] A5. Add /api/ai/quiz route to backend/src/index.ts
- [ ] A6. Create QuizBuilderPage.tsx, TestSimulatorPage.tsx, TestResultsPage.tsx
- [ ] A7. Add routes and lazy exports
- [ ] A8. Remove chat code (ChatPage.tsx, chat.ts, chatWithGemini, chat routes, AppShell tab, lazyPages export)
- [ ] A9. Split I-chat-study.test.ts (keep study half)
- [ ] A10. Add Tests tab to AppShell (activate the placeholder from Phase 1)
- [ ] A11. Write smoke tests: QuizBuilderPage renders; TestSimulatorPage renders

---

## Exit Gate

```bash
npm test
npx tsc --noEmit
cd backend && npm test    # I-chat-study.test.ts (study half) must still pass; chat tests removed
cd backend && npx tsc --noEmit
```

Manual: QuizBuilder → TestSimulator → wrong answer → check study_items updated.
Manual: Chat tab gone from nav; Tests tab present.

---

## Blockers That Would Justify BLOCKED Status

- Phase 2 or Phase 3 not verified
- `/api/quiz/attempt` endpoint does not accept the expected parameters for SRS seeding (research resolves)
- I-chat-study.test.ts split causes test suite failure (research must map which cases to keep vs remove before EXECUTE)

**HARD STOP:** If any path in this phase attempts to DROP TABLE on chat_sessions or chat_messages — STOP immediately and surface to user. This is a program-level hard stop.

---

## Phase Loop Progress

- [ ] 1. RESEARCH
- [ ] 2. INNOVATE
- [ ] 3. PLAN-SUPPLEMENT
- [ ] 4. PVL
- [ ] 5. EXECUTE
- [ ] 6. EVL
- [ ] 7. UPDATE PROCESS

---

## Touchpoints

(see Blast Radius above)

---

## Public Contracts

- `/api/quiz/attempt` endpoint: unchanged (TestSimulator calls it to feed SRS)
- `/api/study/*` and `/api/reviews/due` endpoints: unchanged
- D1 tables chat_sessions / chat_messages: PRESERVED (no schema changes)
- `/api/notes/:id/quiz` endpoint: KEPT (existing; separate from new /api/ai/quiz)

---

## Verification Evidence

| Gate / Scenario                                                         | Strategy        | Proves SPEC criterion                              |
| ----------------------------------------------------------------------- | --------------- | -------------------------------------------------- |
| `npm test` exits 0                                                      | Fully-Automated | No regressions (Criterion 9)                       |
| `npx tsc --noEmit` exits 0                                              | Fully-Automated | Types preserved (Criterion 9)                      |
| `cd backend && npm test` exits 0 (study tests green, chat tests absent) | Fully-Automated | Chat removal clean; study unbroken (Criteria 5, 7) |
| QuizBuilderPage renders at /quiz                                        | Fully-Automated | Route added (Criterion 1)                          |
| Browser: wrong answer in TestSimulator updates SRS (study_items)        | Agent-Probe     | SRS wiring functional (Criterion 4)                |
| Browser: chat tab gone, Tests tab present                               | Agent-Probe     | Nav updated correctly (Criterion 6)                |

---

## Test Infra Improvement Notes

(none identified yet — to be filled during Phase 4 PLAN-SUPPLEMENT)

---

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/paperloop_25-07-26/phase-4-quiz-simulator_PLAN_25-07-26.md`
- Last completed step: not started
- Validate-contract status: pending
- Next step: After Phases 2 AND 3 verify, spawn vc-research-agent for Phase 4.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
