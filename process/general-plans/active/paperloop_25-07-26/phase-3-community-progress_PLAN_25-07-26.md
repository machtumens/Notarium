---
name: plan:paperloop-phase-03-community-progress
description: 'Paperloop — Phase 3: Community label swap + Progress leaderboard (learning_points ranking)'
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
**Date** 25-07-26
**Status** ⏳ PLANNED (stub — to be fleshed out via RESEARCH/INNOVATE before PVL)
**Complexity** SIMPLE
**Report destination:** `process/general-plans/active/paperloop_25-07-26/phase-3-community-progress_REPORT_25-07-26.md`

---

## Overview

Two small but meaningful reframing changes:

1. Rename "Subjects" → "Community" in the nav label (AppShell.tsx) and "Leaderboard" → "Progress" in the page header (LeaderboardPage.tsx).
2. Change the Progress/Leaderboard ranking from `notes_uploaded + total_likes + total_admin_upvotes` to ORDER BY `learning_points DESC` — a 1-line SQL change in `backend/src/routes/leaderboard.ts`. The `learning_points` column already exists in the `users` table.

Phase 3 is independent of Phase 2. Both depend on Phase 1.

---

## Entry Gate

- Phase 1 verified (AppShell nav labels are in AppShell.tsx after Phase 1 extraction — that is where the label change lives)

---

## Phase Completion Rules

Phase 3 is complete when:

1. `npm test`, `npx tsc --noEmit`, `cd backend && npm test`, `cd backend && npx tsc --noEmit` all exit 0
2. Nav label shows "Community" (not "Subjects") in browser
3. Progress/Leaderboard page shows learning_points-based ranking in browser (manual confirm)
4. No Phase 1 regressions
5. vc-validate-agent has written the Validate Contract section (Gate: PASS or accepted CONDITIONAL)
6. Phase 3 report written and umbrella Current Execution State updated

---

## Acceptance Criteria

1. AppShell nav tab label "Subjects" is replaced with "Community"
2. LeaderboardPage heading "Leaderboard" is replaced with "Progress"
3. Leaderboard API query uses `ORDER BY learning_points DESC` instead of the notes/likes/upvotes formula
4. Backend test asserts leaderboard returns users sorted by learning_points
5. `npm test` exits 0
6. `npx tsc --noEmit` exits 0
7. `cd backend && npm test` exits 0 (new test + no regressions)

---

## Blast Radius

- `src/components/AppShell.tsx` — MODIFY: nav label "Subjects" tab → "Community"
- `src/pages/LeaderboardPage.tsx` — MODIFY: page heading "Leaderboard" → "Progress" (UI label only; route URL `/progress` is already set in Phase 1)
- `backend/src/routes/leaderboard.ts` — MODIFY: ORDER BY clause from notes/likes/upvotes formula to `learning_points DESC`

---

## Implementation Checklist

**STUB — to be expanded during Phase 3 RESEARCH/PLAN-SUPPLEMENT**

- [ ] A1. In AppShell.tsx, change the "Subjects" ExpandableTabs label to "Community" (text change only; route URL may also change from /subjects to /community — coordinate with Phase 1 route naming)
- [ ] A2. In LeaderboardPage.tsx, change page heading from "Leaderboard" to "Progress"
- [ ] A3. In leaderboard.ts, change ORDER BY clause to `learning_points DESC`
- [ ] A4. Write a backend test asserting the leaderboard returns users sorted by learning_points
- [ ] A5. Smoke test: leaderboard route still renders

---

## Exit Gate

```bash
npm test
npx tsc --noEmit
cd backend && npm test     # regression + new leaderboard sort test
cd backend && npx tsc --noEmit
```

Manual: navigate to /progress, verify it loads and shows learning_points-based ranking.

---

## Blockers That Would Justify BLOCKED Status

- Phase 1 not verified
- `learning_points` column missing from users table (research confirms it exists — verify during Phase 3 RESEARCH)

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

- `src/components/AppShell.tsx` — MODIFY (label)
- `src/pages/LeaderboardPage.tsx` — MODIFY (label)
- `backend/src/routes/leaderboard.ts` — MODIFY (SQL ORDER BY)

---

## Public Contracts

- Leaderboard API response shape: unchanged (same fields, different sort order)
- Phase 1 routing: preserved
- `/api/leaderboard` endpoint: same path, same response shape, different rank order

---

## Verification Evidence

| Gate / Scenario                                                   | Strategy        | Proves SPEC criterion                                   |
| ----------------------------------------------------------------- | --------------- | ------------------------------------------------------- |
| `npm test` exits 0                                                | Fully-Automated | No regressions (Criterion 5)                            |
| `npx tsc --noEmit` exits 0                                        | Fully-Automated | Types preserved (Criterion 6)                           |
| Backend test: leaderboard returns users sorted by learning_points | Fully-Automated | SQL swap correct (Criteria 3–4)                         |
| Browser: /progress shows learning_points rank                     | Agent-Probe     | Progress page label + ranking functional (Criteria 1–3) |

---

## Test Infra Improvement Notes

(none identified yet — to be filled during Phase 3 PLAN-SUPPLEMENT)

---

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/paperloop_25-07-26/phase-3-community-progress_PLAN_25-07-26.md`
- Last completed step: not started
- Validate-contract status: pending
- Next step: After Phase 1 verifies, spawn vc-research-agent for Phase 3 RESEARCH (can be done in parallel with Phase 2 RESEARCH if desired).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
