---
name: plan:paperloop-umbrella
description: 'Notarium Paperloop — umbrella/orchestration plan for the 5-phase study-loop-first reframe'
date: 25-07-26
metadata:
  node_type: memory
  type: plan
  feature: paperloop
  phase: umbrella
---

# Paperloop — Umbrella Plan

**Date** 25-07-26
**Status** ⏳ PLANNED
**Complexity:** COMPLEX

- Program type: PHASE PROGRAM (5 phases, sequential with gated joins; Phase 3 parallelizable with Phase 2)
- Feature folder: `process/general-plans/active/paperloop_25-07-26/` (general-plans; work is a repo-wide reframe, no feature-specific folder)
- Context loaded from: `process/context/all-context.md`, `process/context/tests/all-tests.md`

---

## Overview

Reframe Notarium from social note-sharing to personal study-loop-first ("Paperloop"): paper capture in class → digital+AI processing at home → SRS review → quiz/test — with community features as complement rather than the primary purpose. This umbrella orchestrates 5 sequential phases, each with its own plan file, validate-contract, and phase report.

The 5-phase Phased Delivery Plan:

- **Phase 1 — Shell + Today:** extract AppShell, migrate tab-state to react-router routes, build TodayPage as default landing
- **Phase 2 — My Library + Process Inbox:** /notes/:id/process frontend pipeline (OCR→summary→quiz→SRS)
- **Phase 3 — Community + Progress:** label swaps + learning_points-based leaderboard ranking
- **Phase 4 — Quiz + Test Simulator:** quiz and test simulator pages; chat code removal; /api/ai/quiz backend
- **Phase 5 — Primer:** DeepSeek-powered primer at /primer

---

## Program Goal Charter

```
Paperloop — Program Goal Charter

North star:
- Reframe Notarium from social note-sharing to personal study-loop-first ("Paperloop"): paper
  capture in class → digital+AI processing at home → SRS review — with community as complement
  rather than the primary purpose.

Definition of done (an unattended agent must be able to do all of these):
1. Navigate to / and see TodayPage (streak, due count, due-card previews, recent notes) — not SubjectsPage
2. Process a note at /notes/:id/process via the OCR→summary→quiz→SRS pipeline (Phase 2)
3. Access subjects as Community, see leaderboard ranked by learning_points (Phase 3)
4. Build and run a quiz from a QuizBuilder page; wrong answers feed SRS (Phase 4)
5. Generate a Primer from a topic at /primer (Phase 5)

What "verified" means (program level):
- Each phase: validate-contract gates pass (vitest green, npx tsc --noEmit green, no
  regressions on overlapping surfaces), manually confirmed in browser (TodayPage loads,
  routes work, no broken tabs). User confirmation required before marking any phase VERIFIED.
- validate-contract gates must be recorded alongside phase gates and regression evidence for a
  phase to reach VERIFIED. A phase without a validate-contract cannot be marked VERIFIED.

Scope tiers → phase mapping:
- Tier 1 Shell+Today → Phase 1
- Tier 2 My Library + Process inbox → Phase 2
- Tier 3 Community + Progress → Phase 3
- Tier 4 Quiz + Test Simulator → Phase 4
- Tier 5 Primer → Phase 5
- This program retires Tiers 1–5.

Explicitly out of scope (deferred tier):
- Native mobile app or PWA offline mode
- Real-time multiplayer study rooms
- Paid subscription / billing surface
- Analytics beyond existing ops dashboard
- AI provider migration (stays DeepSeek + Google Vision)

Hard safety constraints (non-negotiable, per phase):
- No destructive D1 migrations without explicit user approval per phase
- Auth/billing surfaces untouched across all phases
- SRS cards (study_items) are always personal and never publishable
- chat_sessions/chat_messages D1 tables kept in Phase 4 (code removal only, NO DROP TABLE)
- Commit each phase's execution changes before starting the next phase
- Keep process/plan/context commits separate from execution commits
```

---

## Stable Program Goal (copy-paste this to start autonomous execution)

```
SESSION GOAL: Paperloop — Notarium study-loop-first 5-phase reframe
Ref: process/general-plans/active/paperloop_25-07-26/paperloop-umbrella_PLAN_25-07-26.md

TARGET: Complete all 5 phases until:
- All phase validate-contracts pass (vitest green, tsc clean, routing smoke tests green)
- TodayPage is default landing; quiz + primer + process inbox all functional
- Test tiers: automated (iterate-until-green) / hybrid (fix-if-in-blast-radius) / agent-probe (record-judgment)

AUTONOMY: Before ANY subagent spawn, read:
1. This umbrella ## Current Execution State → loop step + validate-contract status
2. Target phase plan ## Phase Loop Progress → first unchecked box = next subagent to spawn

PER-PHASE LOOP (7-step inner loop R→I→P→PVL→E→EVL→UP, never skip, SKIPS SPEC):
  1 RESEARCH → 2 INNOVATE → 3 PLAN-SUPPLEMENT → 4 PVL → 5 EXECUTE → 6 EVL → 7 UPDATE-PROCESS
- PLAN-SUPPLEMENT: plan-agent writes research/innovate gaps into phase plan (or marks "n/a — clean")
- PVL NEVER skipped; partial contract = blocked same as placeholder
- Every subagent FIRST ACTION: run vc-context-discovery (load context group files +
  process/context/tests/all-tests.md routing chain) AND vc-plan-discovery (general-plans active)
- Every phase-END: invoke vc-agent-strategy-compare for next step strategy

HARD STOPS (pause, wait for user):
- Irreversible DB migration on live D1 without explicit per-phase approval
- auth/billing surface change detected (ABORT)
- DROP TABLE on chat_sessions or chat_messages (Phase 4 hard stop)
- Agent count > 100 or plan marks "pause required"

SAFETY:
- No destructive D1 migrations without explicit approval
- SRS cards always personal, never publishable
- chat D1 tables preserved in Phase 4 (code-only removal)
- Commit each phase before advancing; process and execution commits separate

TEST GATES (every phase exit):
  npm test                          (from repo root — vitest frontend)
  npx tsc --noEmit                  (from repo root — frontend typecheck)
  cd backend && npm test            (backend vitest — regression guard only)
  cd backend && npx tsc --noEmit    (backend typecheck)

VALIDATE CONTRACT: Per-phase contracts written by vc-validate-agent into each phase plan.

START: Phase 1, loop step PVL (plan written; RESEARCH/INNOVATE/PLAN-SUPPLEMENT done via
this PLAN session). Spawn vc-validate-agent for phase-1-shell-today_PLAN_25-07-26.md.
```

---

## Phase Ordering

| Phase                          | Plan file                                                                                     | Scope summary                                                                           | Depends on                       |
| ------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------- |
| 1 — Shell + Today              | `process/general-plans/active/paperloop_25-07-26/phase-1-shell-today_PLAN_25-07-26.md`        | Extract AppShell, migrate tab-state to routes, build TodayPage, flip default landing    | —                                |
| 2 — My Library + Process Inbox | `process/general-plans/active/paperloop_25-07-26/phase-2-library-process_PLAN_25-07-26.md`    | /notes/:id/process frontend pipeline (OCR→summary→quiz→SRS)                             | Phase 1                          |
| 3 — Community + Progress       | `process/general-plans/active/paperloop_25-07-26/phase-3-community-progress_PLAN_25-07-26.md` | Label swap + learning_points leaderboard SQL swap                                       | Phase 1 (independent of Phase 2) |
| 4 — Quiz + Test Simulator      | `process/general-plans/active/paperloop_25-07-26/phase-4-quiz-simulator_PLAN_25-07-26.md`     | QuizBuilder + TestSimulator + TestResults pages; remove chat code; /api/ai/quiz backend | Phase 2 + Phase 3                |
| 5 — Primer                     | `process/general-plans/active/paperloop_25-07-26/phase-5-primer_PLAN_25-07-26.md`             | /api/ai/primer (DeepSeek backend) + PrimerPage frontend                                 | Phase 3                          |

### Join Conditions

- Phase 1 MUST complete before Phase 2 or Phase 3 can start (routes must exist).
- Phase 2 and Phase 3 are independent of each other — can run in parallel if desired (blast radii disjoint).
- Phase 4 requires Phase 2 complete (quiz SRS wiring) AND Phase 3 complete (Community label in place before chat removal).
- Phase 5 requires Phase 3 complete (independent of Phase 4).

---

## Pre-PVL Conflict Resolution

Phases 2 and 3 share no file paths (Phase 2 touches src/pages/ProcessPage.tsx new file + process route; Phase 3 touches src/pages/LeaderboardPage.tsx label + backend/src/routes/leaderboard.ts SQL). All phases are parallel-safe with respect to each other at the file level.

Phases 1–5 all touch src/app/lazyPages.ts for new page exports. Sequencing by phase order prevents conflicts.

No package conflicts — all phases execute sequentially except Phase 2 and Phase 3 which are parallel-safe.

---

## Per-Phase Entry / Exit Gates

| Phase | Entry gate                       | Exit gate                                                                                                                  |
| ----- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | Program start (no prerequisites) | `npm test` + `npx tsc --noEmit` green; routing smoke test passes; TodayPage renders at / in browser; user confirms working |
| 2     | Phase 1 verified                 | Process pipeline frontend smoke test; tsc + vitest green; no Phase 1 regressions; user confirms                            |
| 3     | Phase 1 verified                 | Leaderboard shows learning_points ranking; tsc + vitest green; no Phase 1 regressions; user confirms                       |
| 4     | Phase 2 + Phase 3 verified       | Quiz + TestSimulator functional; chat code removed; tsc + vitest green; user confirms                                      |
| 5     | Phase 3 verified                 | /primer loads; DeepSeek primer generated; tsc + vitest green; user confirms                                                |

---

## Per-Phase Loop

Each phase executes the canonical 7-step inner loop `R → I → P → PVL → E → EVL → UP`.
This inner loop SKIPS SPEC — SPEC runs once in the outer program loop only.

1. **RESEARCH** — spawn research-agent: load context, read prior phase reports, check plan drift
2. **INNOVATE** — spawn innovate-agent: decide approach; write Decision Summary
3. **PLAN-SUPPLEMENT** — spawn plan-agent: add gaps/pre-conditions or mark "n/a — research clean"
4. **PVL** — spawn vc-validate-agent: full V1–V7; write validate-contract
5. **EXECUTE** — spawn vc-execute-agent per approved plan and validate-contract
6. **EVL** — spawn vc-tester: run phase test gates to green; write EVL HANDOFF SUMMARY
7. **UPDATE-PROCESS** — write phase report; rewrite ## Current Execution State; commit

**PVL is NEVER skipped.** Placeholder validate-contract = BLOCKED.

---

## Autonomous Execution Rules (During /goal)

- Agent self-decides at all V5 gates — no user approval between phases
- CONDITIONAL net gate: proceed autonomously, gaps on record
- BLOCKED net gate: document in backlog, continue remaining phases
- Hard stops (must pause): D1 migration approval, auth/billing change, DROP TABLE on chat tables, plan marks "pause required"
- Phase reports are the communication channel for conflicts/learnings, not inline questions

---

## Global Constraints

- Never modify auth/billing/2FA/Google-OAuth surfaces without explicit user instruction
- Never DROP TABLE on any D1 table (including chat tables in Phase 4)
- Keep SRS cards personal — never add publishable=true or visibility field to study_items
- All new pages added as React.lazy() exports in lazyPages.ts
- Backend new routes: fn in routes/\*.ts → import in index.ts → add if-block (no framework)
- New AI endpoints: use /api/ai/_ URL prefix (not /api/gemini/_)
- Commit each phase's execution changes before starting the next phase
- Keep process/plan/context commits separate from execution commits

---

## Durable Report Destinations

| Phase                          | Report path                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1 — Shell + Today              | `process/general-plans/active/paperloop_25-07-26/phase-1-shell-today_REPORT_25-07-26.md`        |
| 2 — My Library + Process Inbox | `process/general-plans/active/paperloop_25-07-26/phase-2-library-process_REPORT_25-07-26.md`    |
| 3 — Community + Progress       | `process/general-plans/active/paperloop_25-07-26/phase-3-community-progress_REPORT_25-07-26.md` |
| 4 — Quiz + Test Simulator      | `process/general-plans/active/paperloop_25-07-26/phase-4-quiz-simulator_REPORT_25-07-26.md`     |
| 5 — Primer                     | `process/general-plans/active/paperloop_25-07-26/phase-5-primer_REPORT_25-07-26.md`             |

---

## Program Status Table

| Phase                           | Status                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 01 — Shell + Today              | ✅ COMPLETE — EVL PASS (browser C8/C9 waived, accepted known-gap)                                                                       |
| 02 — My Library + Process Inbox | ✅ COMPLETE — EVL PASS (4 agent-probe browser rows verification-pending, accepted as backlog NOTEs)                                     |
| 03 — Community + Progress       | ✅ COMPLETE — EVL PASS (independently confirmed), committed `85cb8e0`; C4 browser waived (accepted known-gap)                           |
| 04 — Quiz + Test Simulator      | 🧪 PLAN + PVL COMPLETE — Gate: CONDITIONAL (user-accepted 17-08-26); EXECUTE HELD pending two concurrent uncommitted streams committing |
| 05 — Primer                     | ⏳ PLANNED (stub)                                                                                                                       |

Status values: ⏳ PLANNED | 🔨 PLAN WRITTEN | 🧪 TESTING | ✅ VERIFIED (user confirmed working) | 🚧 BLOCKED | ✅ COMPLETE

---

## Touchpoints (All Phases Combined)

**Phase 1 (full detail in phase-1 plan):**

- `src/app/HomePage.tsx` — gutted to minimal content stub (shell extracted out)
- `src/app/AppRoutes.tsx` — layout route structure added; Outlet wired
- `src/components/AppShell.tsx` — new: nav/hamburger/notifications/profile/banners/footer
- `src/app/lazyPages.ts` — TodayPage lazy export added
- `src/pages/TodayPage.tsx` — new: streak + due count + due-card preview + recent notes
- `src/app/__tests__/appshell-routing.test.tsx` — new: routing smoke tests

**Phase 2 (stub):**

- `src/pages/ProcessPage.tsx` — new: /notes/:id/process pipeline UI
- `src/app/AppRoutes.tsx` — add /notes/:id/process route
- `src/app/lazyPages.ts` — ProcessPage lazy export

**Phase 3 (DONE — actual, corrected 17-08-26; original stub listed AppShell.tsx, dropped during PLAN-SUPPLEMENT):**

- `src/pages/LeaderboardPage.tsx` — heading "Leaderboard" → "Progress", Contributors/Learners toggle deleted, personal-stats header added
- `backend/src/routes/leaderboard.ts` — ORDER BY swapped to `learning_points DESC, current_streak DESC` (additive `current_streak` SELECT column)
- `backend/test/red-team/leaderboard-ranking.test.ts` — CREATE
- `src/app/__tests__/appshell-routing.test.tsx` — MODIFY (`/progress` routing test)
- NOT touched: `src/components/AppShell.tsx` — the "Subjects"→"Community"/"Leaderboard"→"Progress" nav-label swap already landed in Phase 1 (verified during Phase 3 PLAN-SUPPLEMENT, 16-08-26); Phase 3 does not touch this file. `src/app/lazyPages.ts` also not touched — `/progress` already routes via Phase 1's `ShellPageRoutes.tsx` wrapper.

**Phase 4 (stub):**

- `src/pages/QuizBuilderPage.tsx` — new
- `src/pages/TestSimulatorPage.tsx` — new
- `src/pages/TestResultsPage.tsx` — new
- `src/pages/ChatPage.tsx` — DELETE
- `src/app/AppRoutes.tsx` — add quiz routes; remove chat route
- `src/app/lazyPages.ts` — quiz page exports; remove ChatPage export
- `src/components/AppShell.tsx` — remove chat tab; add Tests tab (stub from Phase 1 placeholder)
- `backend/src/routes/chat.ts` — DELETE (entire file)
- `backend/src/routes/ai.ts` — remove chatWithGemini + helpers (~lines 25–176)
- `backend/src/index.ts` — remove 5 chat route if-blocks; add /api/ai/quiz route
- `backend/test/red-team/I-chat-study.test.ts` — SPLIT: keep study half, remove chat half

**Phase 5 (stub):**

- `src/pages/PrimerPage.tsx` — new
- `src/app/AppRoutes.tsx` — add /primer route
- `src/app/lazyPages.ts` — PrimerPage lazy export
- `backend/src/routes/ai.ts` — add generatePrimer (DeepSeek)
- `backend/src/index.ts` — add /api/ai/primer route if-block

---

## Public Contracts

- Auth flows, JWT token storage pattern, and all `/api/auth/*` endpoints: unchanged
- `/api/notes/*`, `/api/study/*`, `/api/reviews/*` endpoints: unchanged
- `/api/subjects/*`, `/api/admin/*`, `/api/ops/*` endpoints: unchanged
- `review` URL route (`/review`): stays as ReviewPageRoute, standalone, untouched
- `my-notes` URL route (`/my-notes`): stays in AppRoutes.tsx, untouched
- `settings` URL route (`/settings`): stays in AppRoutes.tsx, untouched
- D1 schema: no migrations until user explicitly approves

---

## Blast Radius

Risk class: MEDIUM — frontend-heavy refactor across phases; backend changes limited to leaderboard SQL swap (Ph3), new AI routes (Ph4/5), and chat code removal (Ph4).

All 5 phases combined (no two phases modify the same file except AppRoutes.tsx and lazyPages.ts, which are touched sequentially):

- 6 frontend files modified (Phase 1)
- 2 frontend files new (Phase 1): AppShell.tsx, TodayPage.tsx
- 1 test file new (Phase 1): appshell-routing.test.tsx
- Additional files per phases 2–5 per stub detail above
- Backend: 1 file modified (Phase 3), 3 files modified + 1 deleted + 1 split (Phase 4), 2 files modified (Phase 5)

---

## Verification Evidence

| Gate / Scenario                                  | Strategy        | Proves SPEC criterion                                    |
| ------------------------------------------------ | --------------- | -------------------------------------------------------- |
| `npm test` exits 0, 0 failing tests              | Fully-Automated | All phases: no regressions on existing frontend behavior |
| `npx tsc --noEmit` exits 0                       | Fully-Automated | All phases: TypeScript contracts respected               |
| `cd backend && npm test` exits 0                 | Fully-Automated | All phases: backend behavior unchanged                   |
| Routing smoke test: `/` renders TodayPage        | Fully-Automated | Phase 1: default landing is TodayPage                    |
| Routing smoke test: `/review` renders ReviewPage | Fully-Automated | Phase 1: ReviewPageRoute still reachable                 |
| Browser manual: all nav tabs reachable           | Agent-Probe     | Phase 1: no tab lost in shell extraction                 |
| Browser manual: mobile menu opens + closes       | Agent-Probe     | Phase 1: mobile hamburger preserved                      |
| Leaderboard shows learning_points rank           | Agent-Probe     | Phase 3: ranking column swapped                          |
| Quiz wrong answer triggers SRS update            | Agent-Probe     | Phase 4: wrong answers feed study_items                  |

---

## Test Infra Improvement Notes

Phase 1 adds the first routing smoke tests for AppShell and AppRoutes. This is the first test coverage for the routing layer (`src/app/__tests__/appshell-routing.test.tsx`). Before Phase 1 there are no frontend tests exercising route rendering — this is a net-new coverage area and should be the baseline for all subsequent phases. Future phases should add at minimum a rendering smoke test per new page added.

---

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/paperloop_25-07-26/paperloop-umbrella_PLAN_25-07-26.md`
- Last completed phase: Phase 3 (Community + Progress) — EVL-green, committed `85cb8e0`
- Validate-contract status: Phase 1-4 written (Gate: CONDITIONAL, all accepted); Phase 5 pending
- Supporting context files loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`
- Next step for a fresh agent: Read this umbrella plan + `phase-4-quiz-simulator_PLAN_25-07-26.md`. Phase 4 is HELD at loop step EXECUTE on the blocking pre-condition documented in `## Current Execution State` above — verify both concurrent work-streams have committed, re-read the two colliding test files fresh, then ENTER EXECUTE MODE.
- Execute-agent start instruction: do NOT spawn vc-execute-agent for Phase 4 until the pre-condition is confirmed resolved. Phase 4's own plan `## Validate Contract` is already written (Gate: CONDITIONAL, accepted) — the block is the concurrent-session file collision, not a missing contract.

---

## Current Execution State

Last updated: 2026-08-17
Current phase: Phase 4 of 5 — Quiz + Test Simulator
Phase 1 name: Shell + Today
Phase 1 status: ✅ COMPLETE
Phase 1 EVL: ALL GATES PASS — frontend 26/26, backend 184/184, tsc clean x2; browser C8/C9 waived by user (accepted known-gap)
Phase 1 report: process/general-plans/active/paperloop_25-07-26/phase-1-shell-today_REPORT_25-07-26.md
Phase 2 name: My Library + Process Inbox
Phase 2 status: ✅ COMPLETE
Phase 2 EVL: ALL GATES PASS — frontend 28/28 (was 26/26), backend 187/187 (was 184/184), tsc clean x2; 4 agent-probe browser rows verification-pending (accepted, backlog NOTEs — see report)
Phase 2 report: process/general-plans/active/paperloop_25-07-26/phase-2-library-process_REPORT_25-07-26.md
Phase 3 name: Community + Progress
Phase 3 status: ✅ COMPLETE — EVL PASS (independently confirmed), committed `85cb8e0`
Phase 3 EVL: ALL GATES PASS — frontend 29/29 (was 28/28), backend 192/192 (was 187/187), tsc clean x2; C4 browser agent-probe waived (accepted known-gap, matches Phase 1/2 precedent)
Phase 3 report: process/general-plans/active/paperloop_25-07-26/phase-3-community-progress_REPORT_25-07-26.md
Phase 4 name: Quiz + Test Simulator
Phase 4 status: 🧪 PLAN + PVL COMPLETE — Gate: CONDITIONAL, user-accepted 2026-08-17. EXECUTE HELD (see below).
Phase 4 EVL: not yet run — EXECUTE has not started
Phase 4 report: process/general-plans/active/paperloop_25-07-26/phase-4-quiz-simulator_REPORT_25-07-26.md (not yet written)
Next phase: Phase 4 — Quiz + Test Simulator — Step 5 EXECUTE, HELD on the blocking pre-condition below
Validate-contract status: Phase 1 = CONDITIONAL (accepted, inner-pvl: phase-1); Phase 2 = CONDITIONAL (accepted, inner-pvl: phase-2); Phase 3 = CONDITIONAL (accepted, inner-pvl: phase-3); Phase 4 = CONDITIONAL (accepted 2026-08-17, inner-pvl: phase-4); Phase 5 = pending

Loop step values: RESEARCH | INNOVATE | PLAN-SUPPLEMENT | PVL | EXECUTE | EVL | UPDATE-PROCESS

**Phase 4 EXECUTE HELD — blocking pre-condition (recorded 2026-08-17):**
Phase 4's own plan carries a Fork G pre-condition: two concurrent, uncommitted work-streams touch files inside Phase 4's declared blast radius and collide on two shared test files. EXECUTE must NOT start until both streams are committed:

- (a) **SRS-hardening session** — uncommitted changes to `backend/src/routes/study.ts`, `backend/test/red-team/I-chat-study.test.ts`, `backend/test/red-team/G-idor.test.ts`, and new migration `backend/migrations/0016_study_items_note_scoped_dedup.sql`.
- (b) **firebase-auth session** (`process/general-plans/active/firebase-auth-migration_24-07-26/`) — uncommitted changes to `backend/test/red-team/provider-mocks.test.ts`, `backend/src/lib/auth.ts`, `backend/src/lib/db.ts`, `backend/src/lib/env.ts`, `backend/schema.sql`.
- **Collision:** `backend/test/red-team/I-chat-study.test.ts` (stream a) and `backend/test/red-team/provider-mocks.test.ts` (stream b) are BOTH claimed by Phase 4's G2.1/G2.2 demolition steps (see Phase 4 plan's Pre-Condition section + `## Implementation Checklist`).
- **Next action on resume:** verify both streams (a) and (b) have committed; re-read `I-chat-study.test.ts` and `provider-mocks.test.ts` fresh against the committed state (per Phase 4 plan's own instruction — do not trust prior line citations verbatim); then ENTER EXECUTE MODE for `phase-4-quiz-simulator_PLAN_25-07-26.md`.

Orchestrator rule: Phases 1-3 are DONE and committed (172c7ca / 964f729 / 85cb8e0). Phase 4 PLAN+PVL are done (validate-contract written, Gate: CONDITIONAL, user-accepted this session) — do NOT spawn vc-execute-agent for Phase 4 until the pre-condition above is resolved.

---

## Validate Contract

(placeholder — this umbrella plan does not have its own validate-contract; validate-contracts are per-phase, written by vc-validate-agent into each phase plan before EXECUTE)
