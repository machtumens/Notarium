# Notarium Backend — Red-Team Test Suite

Integration + fuzz + concurrency tests that exercise the real Cloudflare Worker
(`SELF.fetch`) against real D1 + KV bindings (miniflare-simulated). Every test
maps to a numbered scenario from the red-team brief (A–J, 1–150) plus fuzz and
concurrency suites.

## Run

```bash
cd backend
npm test                       # whole suite (incl. these)
npx vitest run test/red-team/   # just the red-team suites
```

112 red-team tests, all green. Secrets are injected as test-only fakes via
`vitest.config.ts` (`miniflare.bindings`); no real credentials, no live AI calls.

## Files

| File                     | Scenarios | Focus                                                                   |
| ------------------------ | --------- | ----------------------------------------------------------------------- |
| `helpers.ts`             | —         | schema apply, DB reset, user/subject/note seeding, JWT mint, `call()`   |
| `A-auth.test.ts`         | 1–20      | signup + login                                                          |
| `B-jwt.test.ts`          | 21–40     | token forgery, expiry, alg=none, tamper                                 |
| `C-rbac.test.ts`         | 41–60     | student/moderator/technical/super gates                                 |
| `D-ratelimit.test.ts`    | 61–75     | sliding window, IP keying, XFF spoof                                    |
| `E-validation.test.ts`   | 76–90     | zod schemas, size cap, malformed JSON                                   |
| `F-notes.test.ts`        | 91–110    | note CRUD + ownership                                                   |
| `G-idor.test.ts`         | 111–120   | cross-user access, header-identity bypass                               |
| `H-ai.test.ts`           | 121–130   | AI auth-gating + prompt sanitisation                                    |
| `I-chat-study.test.ts`   | 131–140   | session isolation, quiz/review persistence                              |
| `J-admin.test.ts`        | 141–150   | suspend/warn/feature/log/notify + denial                                |
| `fuzz.test.ts`           | —         | SQLi/XSS/traversal/unicode corpora, protocol abuse                      |
| `concurrency.test.ts`    | —         | concurrent likes/signup/delete lost-update probes                       |
| `failure-sim.test.ts`    | —         | degraded KV, AI provider down, partial D1 failure, error-path hardening |
| `journeys.test.ts`       | 1, 3, 9   | multi-API end-to-end backend flows                                      |
| `provider-mocks.test.ts` | 4, 8      | AI/OCR paths with mocked Vision + DeepSeek (fetch-stubbed)              |

## Findings surfaced (tests document actual behaviour, not the ideal)

These are **real** and encoded as passing tests that assert the current
behaviour, each flagged with a `FINDING` comment so a fix flips the expectation.

1. **`X-Encrypted-Yw-ID` auth bypass** (`G-idor` MAJOR FINDING). `getOrCreateUser`
   falls back to an unauthenticated request header and will _create_ a user from
   it, so `POST /api/notes`, note likes, and reads work with **no JWT** and let a
   caller assume an arbitrary identity by choosing the header value.
2. **Rate limiter fails open under concurrency** (`D-ratelimit` 68/69). The KV
   counter is read-modify-write without atomicity — a fully concurrent burst is
   admitted in full, evading the 5/window cap. Fix: atomic KV or a Durable Object.
3. **Rate limiter fails open on KV error** (`D` header). Any KV exception returns
   `true` (allow). A KV outage disables throttling entirely.
4. **`admin_role` default = superuser** (`C-rbac` 48). `decoded.admin_role ?? 'super'`
   means a legacy admin token with no sub-role passes every tier gate. Intentional
   per code comment, but a broad privilege surface. (A linter note in the file
   claims this was tightened to least-privilege — the test asserts whichever the
   code actually does; re-run to confirm.)
5. **Malformed JSON → 500, not 400** (`E-validation` 88). `await request.json()`
   throws into the generic handler; an anonymous bad body yields a server error.
6. **Anonymous search/list → 500** (`fuzz`). `/api/notes/search` (and `/api/subjects`)
   call `getOrCreateUser`, which throws "User ID not found" without identity →
   500 instead of 401.
7. **Schema drift: `schema.sql` vs live `initializeDatabase()`** (`helpers.ts`).
   The committed "complete" schema marks `users.encrypted_yw_id NOT NULL` (signup
   never sets it → would 500) and omits `UNIQUE(email)` (breaks signup dedup). The
   app only works because it runs a _different_, laxer schema at runtime. Applying
   `schema.sql` to a real DB would break signup and duplicate-email protection.
8. **No server-side sanitisation of `display_name`** (`A-auth` 10). XSS payloads
   are stored verbatim; defence relies entirely on the frontend renderer
   (which does use `rehype-sanitize`, so this is defence-in-depth, not an open hole).
9. **Soft-delete does not hide content from search** (`journeys` J9). `searchNotes`
   has no `AND deleted_at IS NULL`, so a note with `deleted_at` set is still
   returned by `/api/notes/search`. The user/admin delete paths hard-delete (so
   `F-106` passes), but any `deleted_at`-based moderation leaves the content
   discoverable. Fix: filter `deleted_at IS NULL` in the search/list queries.

## Harness notes / known limitations

- The worker's `SELF.fetch` view and the test thread's direct `env.DB` writes do
  not share visibility for _subjects_ created mid-test in this pool version, so the
  happy-path `POST /api/notes` create is covered indirectly via `seedNote` (which
  the worker reads back) rather than a direct create+read assertion. Note
  ownership/update/delete/like are all tested through the worker.
- AI endpoints are tested for auth-gating + input validation + `sanitizeAIInput`,
  not live model output (no API keys in test env — deterministic by design).

## Frontend (root project — `vitest` + jsdom, run with `npm test` from repo root)

RTL suites for the security-relevant frontend surface. The root vitest config is
scoped to `src/**` (and excludes `backend/**`) so the two runtimes don't collide.

| File                                               | Focus                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/app/__tests__/roles.test.ts`                  | `canModerate`/`canOps` — client RBAC truth table                                                                 |
| `src/app/routes/__tests__/ProtectedRoute.test.tsx` | loading gate, unauth→/login, suspended→/suspended, authed→children                                               |
| `src/app/routes/__tests__/AdminRoute.test.tsx`     | student/technical bounced, super/moderator admitted                                                              |
| `src/components/__tests__/Login.test.tsx`          | submit→token→redirect, error surfaced, 2FA branch, already-authed redirect (replaces the previously-broken stub) |
| `src/pages/__tests__/Signup.test.tsx`              | school-domain + password-match validation fire before any network call                                           |

Provider (`api`) is mocked with `vi.hoisted`; routes use the real
`AuthContext.Provider`. No network, no real AI calls.

## Provider mocks (how the AI/OCR paths are reached)

`provider-mocks.test.ts` temporarily sets the AI env keys (so the Worker takes the
provider branch) and stubs `globalThis.fetch` to return canned Vision/DeepSeek
responses. Keys + stub are torn down in `afterEach`, so the key-absent `H-ai`
assertions in the same worker process stay valid. Covers OCR success/failure,
auto-tags parsing + resilient fallback, journey 8 (AI failure → note intact), and
journey 4 (scan → OCR → tags → publish).

## Not yet implemented (structured extension points)

- **Frontend data-display components** (Leaderboard, NotificationBell, NoteViewer,
  Search): lower security value; add as needed following the same mock pattern.
- **Journeys 2/5/7/10** (full 2FA login round-trip, study/streak flow, OAuth token
  lifecycle): OAuth needs Google token-exchange mocks; 2FA needs a TOTP fixture.
- **Deeper failure sims** (missing `JWT_SECRET`, whole-DB outage): the pool binds
  `env` globally, so these need a second vitest project with a bindings-less config
  rather than per-test nulling.
