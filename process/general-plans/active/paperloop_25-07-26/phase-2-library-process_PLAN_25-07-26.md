---
name: plan:paperloop-phase-02-library-process
description: 'Paperloop — Phase 2: My Library + Process Inbox frontend pipeline (OCR→summary→quiz→SRS)'
date: 25-07-26
metadata:
  node_type: memory
  type: plan
  feature: paperloop
  phase: phase-02
---

# Phase 2 — My Library + Process Inbox

**Program:** paperloop
**Umbrella plan:** `process/general-plans/active/paperloop_25-07-26/paperloop-umbrella_PLAN_25-07-26.md`
**Date** 25-07-26
**Status** ⏳ PLANNED (stub — to be fleshed out via RESEARCH/INNOVATE before PVL)
**Complexity** SIMPLE
**Report destination:** `process/general-plans/active/paperloop_25-07-26/phase-2-library-process_REPORT_25-07-26.md`

---

## Overview

Add `/notes/:id/process` frontend route: a step-by-step UI orchestrating the OCR→summary→quiz→SRS pipeline for a captured note. All steps use EXISTING backend endpoints (no new backend). This is the core personal study loop — convert a raw note photo into an SRS deck in one guided flow.

---

## Entry Gate

- Phase 1 verified (AppShell + TodayPage + routing migration complete, all Phase 1 tests green)
- `/notes/:id` note detail modal already functional (NoteDetailModal.tsx exists)

---

## Phase Completion Rules

Phase 2 is complete when:

1. `npm test`, `npx tsc --noEmit`, `cd backend && npm test`, `cd backend && npx tsc --noEmit` all exit 0
2. ProcessPage renders at `/notes/:id/process` in browser (manual confirm)
3. Full OCR→summary→quiz→SRS pipeline can be driven end-to-end (agent-probe confirm)
4. No Phase 1 regressions (TodayPage still loads at /, all tabs still work)
5. vc-validate-agent has written the Validate Contract section (Gate: PASS or accepted CONDITIONAL)
6. Phase 2 report written and umbrella Current Execution State updated

---

## Acceptance Criteria

1. Navigating to `/notes/:id/process` renders ProcessPage inside AppShell
2. ProcessPage guides the user through OCR → summary → quiz card generation → SRS queue add
3. All steps call EXISTING backend endpoints only (no new backend endpoints required)
4. `npm test` exits 0 (existing tests pass + new ProcessPage smoke test)
5. `npx tsc --noEmit` exits 0
6. `cd backend && npm test` exits 0 (no regressions)

---

## Blast Radius

- `src/pages/ProcessPage.tsx` — CREATE: process pipeline UI
- `src/app/AppRoutes.tsx` — MODIFY: add `/notes/:id/process` route inside AppShell layout
- `src/app/lazyPages.ts` — MODIFY: add ProcessPage lazy export

---

## Implementation Checklist

**STUB — to be expanded during Phase 2 RESEARCH/PLAN-SUPPLEMENT**

- [ ] A1. Research exact endpoint signatures for OCR, summary, quiz, and SRS from `backend/src/routes/ai.ts` and `backend/src/routes/study.ts`
- [ ] A2. Design step-by-step ProcessPage UI: OCR result → summary → quiz generation → SRS card creation
- [ ] A3. Create `src/pages/ProcessPage.tsx`
- [ ] A4. Add route + lazy export
- [ ] A5. Add test coverage (at minimum: renders ProcessPage at /notes/:id/process)

---

## Exit Gate

```bash
npm test        # all tests pass including new ProcessPage smoke test
npx tsc --noEmit
cd backend && npm test     # regression: no backend regressions
cd backend && npx tsc --noEmit
```

Manual: navigate to /notes/:id/process and complete the pipeline end-to-end.

---

## Blockers That Would Justify BLOCKED Status

- Phase 1 not verified (hard dependency)
- OCR or summary endpoints require new backend work (Phase 2 is frontend-only; if discovered, add backend stub to Phase 2 checklist)

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

- `src/pages/ProcessPage.tsx` — CREATE
- `src/app/AppRoutes.tsx` — MODIFY
- `src/app/lazyPages.ts` — MODIFY

---

## Public Contracts

- All existing `/api/notes/*`, `/api/ai/*`, `/api/study/*` endpoints: unchanged
- Phase 1 routing structure: preserved

---

## Verification Evidence

| Gate / Scenario                                       | Strategy        | Proves SPEC criterion                   |
| ----------------------------------------------------- | --------------- | --------------------------------------- |
| `npm test` exits 0                                    | Fully-Automated | No regressions (Criterion 6)            |
| `npx tsc --noEmit` exits 0                            | Fully-Automated | Types preserved (Criterion 5)           |
| Smoke test: ProcessPage renders at /notes/:id/process | Fully-Automated | Route added correctly (Criterion 1)     |
| Browser: complete OCR→summary→quiz→SRS pipeline       | Agent-Probe     | Full pipeline functional (Criteria 2–3) |

---

## Test Infra Improvement Notes

(none identified yet — to be filled during Phase 2 PLAN-SUPPLEMENT)

---

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/paperloop_25-07-26/phase-2-library-process_PLAN_25-07-26.md`
- Last completed step: not started
- Validate-contract status: pending
- Next step: After Phase 1 verifies, spawn vc-research-agent for Phase 2 RESEARCH.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
