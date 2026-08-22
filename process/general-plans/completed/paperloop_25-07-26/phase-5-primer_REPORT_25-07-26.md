---
phase: phase-5-primer
date: 2026-08-21
status: COMPLETE
feature: paperloop
plan: process/general-plans/active/paperloop_25-07-26/phase-5-primer_PLAN_25-07-26.md
---

# Phase 5 Report — Primer

**Program:** paperloop (5-phase reframe) — this closes the FINAL phase.

## What Was Done

Delivered a stateless, ephemeral "Primer" feature — a topic-string input that returns a
DeepSeek-generated study primer (overview, key concepts, priming questions) — plus its
discoverability entry point on `TodayPage`. 10 files touched (1 new, 9 modified), matching the
plan's Blast Radius exactly with no deviations:

**Backend:**

- `backend/src/routes/ai.ts` — added `generatePrimer(topic, env)` (DeepSeek fetch, mirrors
  `generateStudyPlan`/`explainConcept`'s fetch/error shape; parses the response with
  `generateQuiz`'s regex-JSON-extract pattern since output is structured JSON) +
  `generatePrimerEndpoint(request, env)` (mirrors `generateStudyPlanEndpoint`'s auth/validation
  shape: `getUserFromToken` → 401, manual `!topic` → 400, flat 3-field JSON response).
- `backend/src/index.ts` — added `generatePrimerEndpoint` to the `routes/ai` import block; added
  a new `/api/ai/primer` if-block immediately after `/api/concept-explain`, reusing the
  `requireUser` + `checkRateLimit(userId, 'ai', env)` wrapper (same pattern as the 2 sibling
  endpoints, not the unwrapped `/api/notes/:id/quiz` style).

**Frontend:**

- `src/types/index.ts` — added `PrimerResponse { overview, key_concepts, questions }`.
- `src/lib/api.ts` — added `api.ai.generatePrimer(topic)` inside the existing `ai: {...}` object,
  normalizing the response shape.
- `src/pages/PrimerPage.tsx` (CREATE) — topic input → calls `api.ai.generatePrimer` → renders 3
  sections (Overview / Key Concepts / Questions); loading + error states; ephemeral by design (no
  caching, no session storage).
- `src/app/lazyPages.ts` — `PrimerPage` lazy export.
- `src/app/AppRoutes.tsx` — `/primer` route nested inside the `AppShell` layout-route block (a
  content page via `<Outlet/>`, not a standalone pre-layout route).
- `src/pages/TodayPage.tsx` — "Prep for class" card added, `navigate('/primer')` on click.

**Tests:**

- `backend/test/red-team/H-ai.test.ts` — `/api/ai/primer` added to the `'125 & auth'` 401-path
  array; new 400-missing-topic test case added.
- `src/app/__tests__/appshell-routing.test.tsx` — new `/primer` routing smoke test
  (sentinel-mocked `PrimerPage`) + extended the `/` TodayPage case with a "Prep for class" card
  assertion.

## What Was Skipped/Deferred

- **`sanitizeAIInput` wiring into `generatePrimerEndpoint`** (Accepted Known-Gap 3, discovered
  during this phase's PVL pass) — not wired, matching every sibling AI endpoint
  (`generateStudyPlanEndpoint`, `explainConceptEndpoint`, `generateQuizEndpoint` all skip it too).
  Self-inflicted-risk-only, not IDOR/cross-user. A systemic fix across all 4 AI endpoints belongs
  in a future hardening plan — **backlog NOTE recommended** (program-wide, see umbrella closeout).
- **Provider-mocked happy-path test for `generatePrimer`** — not written. AI keys are
  intentionally absent from backend test bindings by design; no sibling AI-generation endpoint
  (`generateStudyPlan`/`explainConcept`/`generateQuiz`) has one either. Not a new gap class.
- **Session/local persistence** — intentionally out of scope (Locked Decision 4, forced by
  Decision 1's no-DB-reads constraint). A refresh clears the result. Matches this program's
  existing refresh-loss precedent (Phase 2 process pipeline, Phase 4 quiz/timer).
- **Agent-probe browser rows** (C3 primer generation, C6 refresh-clears, C11 kept-endpoint
  regression spot-check) — deferred; require `DEEPSEEK_API_KEY` + a live dev server/browser
  session not available this session. Accepted known-gap, matches Phase 1-4 precedent exactly.

## Test Gate Outcomes

| Gate                             | Before  | After    | Result |
| -------------------------------- | ------- | -------- | ------ |
| `npm test` (frontend)            | 31/31   | 32/32    | green  |
| `cd backend && npm test`         | 195/195 | 196/196  | green  |
| `npx tsc --noEmit` (frontend)    | clean   | clean    | green  |
| `cd backend && npx tsc --noEmit` | clean   | clean    | green  |
| `eslint`                         | —       | 0 errors | green  |

EVL independently re-ran these exact gates (not just execute-agent's self-report) and confirmed
GATES-GREEN.

## Plan Deviations

None. Implementation matched the plan's checklist order (5a backend → 5b frontend → 5c TodayPage
card → 5d tests) exactly; all 10 Blast Radius files touched as claimed, no additional files
touched, no scope creep into the SHARED files' Phase-4-owned regions.

## Test Infra Gaps Found

None new this phase. The pre-existing gap (no DeepSeek-mocked happy-path test for any
AI-generation endpoint, and `sanitizeAIInput` unwired program-wide) was already documented in the
plan's own PVL pass — see Accepted Known-Gaps above; carried to backlog at program closeout
rather than re-stated here as a fresh finding.

## SPEC Achievement

No standalone `*_SPEC_*.md` exists for this phase — SPEC was skipped for the phase-program inner
loop by design (the umbrella's Program Goal Charter governs all 5 phases; see umbrella `## Program
Goal Charter` §Definition of done item 5: "Generate a Primer from a topic at /primer").

Scoring against the phase plan's own Acceptance Criteria (C1-C11, validate-contract):

| Criterion                                               | Status                                                   | Proven by                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| C1 PrimerPage renders at /primer inside AppShell        | **met**                                                  | `appshell-routing.test.tsx` new case (FE 32/32)                                                                 |
| C2 TodayPage "Prep for class" card navigates to /primer | **met**                                                  | `appshell-routing.test.tsx` extended `/` case                                                                   |
| C3 POST /api/ai/primer returns structured DeepSeek JSON | **unmet (known-gap)**                                    | Agent-Probe deferred — needs `DEEPSEEK_API_KEY` + browser session; backlog stub below                           |
| C4 Missing/empty topic → 400                            | **met**                                                  | `H-ai.test.ts` new 400 case (BE 196/196)                                                                        |
| C5 Unauthenticated request → 401                        | **met**                                                  | `H-ai.test.ts` extended `'125 & auth'` array                                                                    |
| C6 Ephemeral — refresh clears result                    | **unmet (known-gap, by design)**                         | Agent-Probe deferred; accepted known-gap per Locked Decision 4                                                  |
| C7 npm test exits 0                                     | **met**                                                  | 32/32 green                                                                                                     |
| C8 tsc clean (frontend)                                 | **met**                                                  | clean                                                                                                           |
| C9 backend npm test exits 0                             | **met**                                                  | 196/196 green                                                                                                   |
| C10 tsc clean (backend)                                 | **met**                                                  | clean                                                                                                           |
| C11 kept endpoints untouched/functioning                | **met** (automated) / **unmet** (agent-probe spot-check) | Automated: `backend && npm test` unchanged coverage green. Agent-probe spot-check deferred — backlog stub below |

**Backlog NOTEs for unmet criteria (Agent-Probe residuals — Known-Gap is never a basis for "met"):**

- C3/C11 agent-probe spot-check: needs `DEEPSEEK_API_KEY` in dev env + live browser session — same
  residual class as every prior phase's Agent-Probe rows (Phase 1-4 precedent).
- C6 refresh-clears-result: same residual class, needs live browser session.

## Closeout Packet

1. **Selected plan path:** `process/general-plans/active/paperloop_25-07-26/phase-5-primer_PLAN_25-07-26.md`
2. **Closeout classification:** Ready for UPDATE PROCESS archival (source commit still pending as a
   separate follow-up action outside this session — see Job 2 note below; plan itself is fully
   reconciled with implemented reality)
3. **What was finished:** see "What Was Done" above — full 10-file Blast Radius delivered.
4. **Verified vs unverified:** Verified — all 4 automated test/typecheck gates green (FE 32/32, BE
   196/196, tsc x2 clean, eslint 0 errors), EVL-independently-confirmed. Unverified — 3 Agent-Probe
   browser rows (C3, C6, C11 spot-check) pending `DEEPSEEK_API_KEY` + live browser session.
   4b. **Validate-contract compliance:** VALIDATE was run (inner-PVL, `generated-by: inner-pvl:
phase-5`). Gate: CONDITIONAL, accepted, committed `783f972`. Present in the plan file — see
   plan's `## Validate Contract` section.
5. **Cleanup done vs still needed:** Done — this report written, phase plan Phase Loop Progress
   Steps 6-7 ticked, registry updated, umbrella program marked COMPLETE, memory updated. Still
   needed — Phase 5's source commit (uncommitted in the working tree as of this session; explicitly
   deferred per this session's instructions — bookkeeping only, no commit performed).
6. **Single best next valid state:** Commit Phase 5's source changes (`vc-git-manager`, execution
   commit — files: `backend/src/index.ts`, `backend/src/lib/{auth,db,env}.ts` are NOT Phase 5's —
   see note below), then commit this UPDATE PROCESS session's process artifacts separately. The
   program folder (`paperloop_25-07-26/`) is then ready to archive `active/` → `completed/` as a
   follow-up.
7. **Commit-checkpoint recommendation:** Execution commit recommended before UPDATE PROCESS's own
   process commit. **Caveat:** the working tree currently also contains uncommitted
   firebase-auth-migration-stream changes (`backend/src/lib/auth.ts`, `db.ts`, `env.ts`,
   `backend/migrations/0015_add_firebase_uid.sql`, `gaps-*.test.ts`) that are NOT part of Phase 5 —
   the execution commit for Phase 5 must stage only the 10 Phase-5 files (`backend/src/index.ts`,
   `backend/src/routes/ai.ts`, `backend/test/red-team/H-ai.test.ts`,
   `src/app/AppRoutes.tsx`, `src/app/__tests__/appshell-routing.test.tsx`, `src/app/lazyPages.ts`,
   `src/lib/api.ts`, `src/pages/TodayPage.tsx`, `src/types/index.ts`, `src/pages/PrimerPage.tsx`),
   not a blanket `git add -A`.
8. **Regression status:** `POST /api/study-plan`, `/api/concept-explain`, `/api/notes/:id/quiz`
   confirmed untouched by this phase's checklist (no line in 5a-5d modifies their handler bodies);
   backend suite's unchanged coverage for those 3 endpoints stayed green (196/196 includes them).
9. **SPEC achievement:** see "SPEC Achievement" section above.

## Forward Preview

### Test Infra Found

No new test infra patterns. `H-ai.test.ts` extended per its existing convention (see plan's Test
Infra Improvement Notes — future `/api/ai/*` endpoints should route to whichever existing test
file matches their auth/validation shape, not always default to a new file).

### Blast Radius Changes

None vs. plan — all 10 claimed files touched, no extras, no scope reduction.

### Commands to Stay Green

```
npm test
npx tsc --noEmit
cd backend && npm test
cd backend && npx tsc --noEmit
```

### Dependency Changes

None. No new package, no new env secret (`DEEPSEEK_API_KEY` already present in wrangler secrets).
