# notarium-plus - All Tests

Last updated: 2026-07-24 (STUDY phase scan, HEAD 640e66b)

Attach this file first when the task involves testing, verification, or test debugging.

This is the fast operator guide for the testing surface:

- which runner to use
- what command to start with
- how to quickly debug common failures
- which deeper file to read next

Do not load the whole `process/context/tests/` folder by default. Start here, then drill down.

---

## How This File Works

This is the `all-tests.md` entrypoint for the `tests/` context group. It follows the `all-*.md` routing convention:

1. Agents read `all-context.md` first and get routed here for testing tasks
2. This file gives quick decision rules and commands
3. For deeper details, agents follow the routing table below to specific docs

As the project grows, add deeper docs to this group (e.g., `e2e-tests.md`, `debugging-and-pitfalls.md`) and add routing entries below. This file stays the fast-start entrypoint.

---

## What This Covers

- test runner selection
- quick commands by package
- fast debugging procedures
- current testing gaps worth remembering

## Read This When

Use this file when you need to:

- run tests after implementation
- decide between test runners
- debug failing tests

## Quick Routing

(No deeper test docs yet. Add routing entries here as they are created.)

## Quick Decision Guide

Both the frontend and backend use **vitest** as the sole test runner. There is no Playwright, no Bun test, and no separate e2e runner currently.

### Use `npm test` (from repo root) for frontend tests

- Covers: React components, hooks, auth context, role utilities, API client
- Env: jsdom (no real DOM, browser APIs shimmed)
- Config: root `vitest.config.ts` (or inline in `package.json` — root config absent, vitest infers from `vite.config.ts`)
- Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom`)

### Use `npm test` (from `backend/`) for backend tests

- Covers: Workers fetch handler, auth utilities, TOTP, Google OAuth service, red-team security suite
- Env: `@cloudflare/vitest-pool-workers` — runs inside a real miniflare Workers runtime
- Config: `backend/vitest.config.ts` with cloudflare plugin + fake bindings injected via `TEST_BINDINGS`
- AI keys intentionally omitted from test bindings so AI endpoints fall back deterministically (no live calls)

### No Playwright / No e2e tests

There are no browser-driven e2e tests. The red-team suite in `backend/test/red-team/` covers security integration paths at the HTTP level (using the Workers test runtime), not a browser.

## Default Verification Order

Unless the task clearly needs a different path:

1. run the narrowest existing automated test
2. use unit/integration tests before browser tests
3. use end-to-end tests only when the real UI is the thing being verified

## Commands

### Frontend tests (run from repo root)

```bash
npm test               # vitest run (CI mode, single pass)
npm run test:watch     # vitest (watch mode for development)
npm run test:ui        # vitest --ui (browser UI for test results)
```

### Backend tests (run from backend/)

```bash
cd backend && npm test  # vitest run (uses @cloudflare/vitest-pool-workers)
```

### Typecheck (not a test runner, but required for verification)

```bash
# Frontend
npx tsc --noEmit

# Backend
cd backend && npx tsc --noEmit
```

### Lint

```bash
npm run lint        # eslint .
npm run lint:fix    # eslint . --fix
npm run format      # prettier --write .
```

### Summary table

| Surface                          | Runner       | Command                  | Env                                         |
| -------------------------------- | ------------ | ------------------------ | ------------------------------------------- |
| Frontend (src/)                  | vitest 4.1.5 | `npm test` (from root)   | jsdom                                       |
| Backend (backend/src/)           | vitest 4.1.5 | `cd backend && npm test` | @cloudflare/vitest-pool-workers (miniflare) |
| Backend red-team (backend/test/) | vitest 4.1.5 | `cd backend && npm test` | same as above                               |

## Debugging Quick Reference

- **jsdom quirks:** Frontend tests run in jsdom — Canvas, WebGL (Three.js), and Rive animations are unavailable. Components using these will need mocks if tested directly.
- **Backend secrets:** Backend tests use fake bindings injected by `backend/vitest.config.ts` (`TEST_BINDINGS`). No `.env.test` file needed. Real AI keys are intentionally absent — AI routes return "not configured" responses in tests.
- **D1 database in tests:** miniflare provides an in-memory D1 instance. No external database or wrangler setup needed to run tests.
- **Red-team tests:** `backend/test/red-team/` tests make real HTTP requests against the miniflare worker. They test auth, RBAC, rate limiting, IDOR, validation, and concurrency. These are integration-level — expect them to be slower than unit tests.
- **Workers runtime cold start:** `@cloudflare/vitest-pool-workers` spins up a real Workers runtime for each test file. First run is slower. Subsequent runs in watch mode are faster.
- **Token in frontend tests:** `src/lib/api.ts` reads from `sessionStorage`. In jsdom tests, `sessionStorage` is available but empty by default — tests that need auth must set `sessionStorage.setItem('notarium_token', 'fake-jwt')` or mock the `api` module.

## Current Test Inventory

### Frontend tests (6 files, minimal coverage)

| File                                               | What it covers                           |
| -------------------------------------------------- | ---------------------------------------- |
| `src/app/__tests__/roles.test.ts`                  | `canModerate()`, `canOps()` role helpers |
| `src/app/routes/__tests__/AdminRoute.test.tsx`     | `<AdminRoute>` redirect behavior         |
| `src/app/routes/__tests__/ProtectedRoute.test.tsx` | `<ProtectedRoute>` redirect behavior     |
| `src/components/__tests__/Login.test.tsx`          | Login component rendering                |
| `src/lib/__tests__/api.test.ts`                    | API client base behavior                 |
| `src/pages/__tests__/Signup.test.tsx`              | Signup page rendering                    |

### Backend tests (22 files, substantial security coverage)

**Unit tests:**
| File | What it covers |
|---|---|
| `backend/src/__tests__/health.test.ts` | Worker exports a fetch handler |
| `backend/src/lib/__tests__/totp.test.ts` | TOTP utilities |
| `backend/src/services/__tests__/google-oauth.test.ts` | Google OAuth service |

**Red-team / integration tests (`backend/test/red-team/`):**
| File | What it covers |
|---|---|
| `A-auth.test.ts` | Authentication flows |
| `B-jwt.test.ts` | JWT token security |
| `C-rbac.test.ts` | Role-based access control |
| `D-ratelimit.test.ts` | Rate limiting |
| `E-validation.test.ts` | Input validation |
| `F-notes.test.ts` | Notes CRUD security |
| `G-idor.test.ts` | Insecure direct object reference prevention |
| `H-ai.test.ts` | AI endpoint security |
| `I-chat-study.test.ts` | Chat and study endpoints |
| `J-admin.test.ts` | Admin endpoint security |
| `concurrency.test.ts` | Concurrent request handling |
| `failure-sim.test.ts` | Failure simulation |
| `fuzz.test.ts` | Input fuzzing |
| `journeys.test.ts` | End-to-end user journey flows |
| `provider-mocks.test.ts` | External provider mock tests |
| `gaps-auth-rbac.test.ts` | Auth/RBAC gap coverage |
| `gaps-ratelimit-notes-idor.test.ts` | Rate limit + notes + IDOR gaps |
| `gaps-study-admin.test.ts` | Study and admin endpoint gaps |

## Known Gaps

- **Frontend coverage is minimal**: only 6 test files covering route guards, role utils, and basic renders. No tests for study flow, upload, AI features, note detail, leaderboard, or chat.
- **No e2e tests**: no Playwright or browser-driven tests exist. The full user journey (sign up → upload note → OCR → study → review) is untested at the UI layer.
- **No tests for SM-2 logic directly**: `backend/src/routes/study.ts` contains `computeSm2()` and `updateStreak()` but these functions are covered only indirectly via the red-team suite (if at all), not by dedicated unit tests.
- **No tests for AI routes in meaningful way**: `H-ai.test.ts` covers security, but Gemini and Vision responses are not tested (keys absent from test bindings by design).
- **80% coverage threshold is NOT currently met**: coverage across both packages is well below the project standard. This is the largest quality debt item.
