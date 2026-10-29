# Security audit — Notarium

29 Oct 2026. Code at `main` (`02283fd`). Method: read the Worker's auth, session, routing
and every route's guard; ran `npm audit`; scanned tracked files, git history and the
built bundle for credentials; resolved DNS for the admin email domains. Regression tests
for every fixed finding: `backend/test/red-team/K-hardening-29oct.test.ts`.

Severity is judged on exploitability and impact for this app. No CVSS scores; there
isn't enough information for honest ones.

| ID     | Severity     | Title                                                               | Status                       |
| ------ | ------------ | ------------------------------------------------------------------- | ---------------------------- |
| SEC-00 | **Critical** | Provider API keys in public git history                             | **Open — owner must rotate** |
| SEC-01 | High         | Google sign-in can enter an admin account                           | Fixed                        |
| SEC-02 | High         | Shared admin password brute-forceable via email rotation            | Fixed                        |
| SEC-03 | High         | Bearer token alone can switch 2FA off                               | Fixed                        |
| SEC-04 | High         | Bearer token alone can set a new password                           | Fixed                        |
| SEC-05 | High         | Moderator / technical admin can reset any user's password           | Fixed                        |
| SEC-06 | Medium       | Suspension and deletion don't stop live tokens                      | Fixed                        |
| SEC-07 | Medium       | Password change leaves other devices signed in                      | Fixed (refresh tokens)       |
| SEC-08 | Low          | `POST /api/admin/verify` is an admin-password oracle                | Fixed (removed)              |
| SEC-09 | Medium       | Two AI routes skip the per-user AI rate limit                       | Fixed                        |
| SEC-10 | Medium       | react-router open redirect (GHSA-2w69, GHSA-2j2x)                   | Fixed (6.30.1 → 6.30.6)      |
| SEC-11 | Medium       | Admin auth is three shared passwords, no per-person identity or 2FA | Open (design)                |
| SEC-12 | Low          | Leaderboard exposes student names, classes, photos without sign-in  | Open (owner decision)        |
| SEC-13 | Low          | Access tokens (24 h) cannot be revoked                              | Open (residual)              |
| SEC-14 | Low          | `zod` 3.x memory-exhaustion advisory (GHSA-mrhx)                    | Open (needs zod 4)           |
| SEC-15 | Low          | CORS allows any `notariumm*.vercel.app` origin                      | Open (informational)         |
| SEC-16 | Info         | Rate limiter and maintenance flag fail open on KV errors            | Accepted                     |
| SEC-17 | Info         | Remaining react-router advisories need v7                           | Not reachable [believed]     |

---

### SEC-00 — Provider API keys in public git history · Critical · Open

- **Where:** commits `ccf570b`, `c49272b`, `23b6c5f`, `9943413`, `a1bf0d2`, `d6c87db`,
  `a7e9e27`, `d73a3f6`, `21bc1bf` — files `backend/dev-server.js`, `backend/src/index.ts`,
  `backend/dry-run-output/index.js`, `QUICK_START.md`, `TEST_RESULTS.md`.
- **What:** 2 distinct Google API keys (`AIza…`, 39 chars) and 2 distinct `sk-…` keys
  (35 chars, DeepSeek format). Values deliberately not reproduced here.
  `machtumens/Notarium` is **public** (`gh repo view`, 29 Oct). Current HEAD and the built
  bundle are clean.
- **Attack:** clone, `git log -p`, use the keys. Google keys can bill Vision/Gemini;
  DeepSeek keys spend the account balance.
- **Note [guess]:** STATE.md records DeepSeek answering "Insufficient Balance" right
  after a top-up. A leaked key being spent by someone else fits that as well as the
  "wrong account" theory recorded there.
- **Fix (owner):** revoke all four in the Google Cloud and DeepSeek consoles, issue new
  ones, `npx wrangler secret put` from `backend/`. Rewriting history does not undo a
  public leak; do it only for hygiene, after rotation.
- **Verify:** each old key returns an auth error from its provider.

### SEC-01 — Google sign-in can enter an admin account · High · Fixed

- **Where:** `backend/src/routes/oauth.ts` signup intent; `lib/auth.ts` Firebase path.
- **Root cause:** the callback finds the user by email and mints a token with that row's
  `role`/`admin_role`. Admin rows live on `@notarium.internal` (admin-login) and
  `@notariumadmin.com` (legacy login). `notariumadmin.com` returned NXDOMAIN on 29 Oct —
  probably unregistered [guess]. Signup also accepted both domains.
- **Attack:** buy the domain, create a Google account at an existing admin row's address,
  sign in with Google → admin token.
- **Fix:** OAuth refuses reserved admin domains and any row with `role = 'admin'`; signup
  refuses reserved domains; the dormant Firebase path neither links nor provisions them.
- **Verify:** SEC-01 tests (signup refusal; domain matcher). The OAuth branch itself has
  no integration test — it needs a mocked Google token exchange.

### SEC-02 — Admin password brute force via email rotation · High · Fixed

- **Where:** `routes/auth.ts` `loginEndpoint`, `@notariumadmin.com` branch.
- **Root cause:** rate limit key is `ip|email`; every address on the domain checks the
  same `ADMIN_PASSWORD`, so each new address got 5 more guesses.
- **Fix:** the branch also spends the IP-only `admin-login` bucket that
  `/api/auth/admin-login` uses (5 per 15 min per IP).
- **Verify:** SEC-02 test — 6th guess on a fresh address from one IP gets 429.

### SEC-03 — Bearer token can switch 2FA off · High · Fixed

- **Where:** `routes/twofa.ts` `setup2fa`, `disable2fa`.
- **Root cause:** setup wrote `totp_enabled = 0` unconditionally. Disable had no rate limit.
- **Fix:** setup returns 409 while 2FA is on; disable is limited to 5 per 15 min per account.
- **Verify:** SEC-03 tests.

### SEC-04 — Bearer token can set a new password · High · Fixed

- **Where:** `routes/twofa.ts` `setPassword`.
- **Root cause:** no old password and no freshness check — a token copied from a device
  became a permanent credential.
- **Fix:** the token must be at most 10 minutes old (the Google-recovery flow it exists
  for is minutes old); success ends every refresh chain for the account. The SPA does not
  call this endpoint today.
- **Verify:** SEC-04 tests.

### SEC-05 — Any admin seat can reset any user's password · High · Fixed

- **Where:** `index.ts` — `/api/auth/admin-reset-password`, `/api/admin/emergency-password-fix`,
  `/api/admin/migrate-passwords`.
- **Root cause:** `requireAdmin` accepts any `role = 'admin'`, i.e. moderator and technical.
- **Fix:** `requireRole(…, [])` — super only. Resets are written to `admin_activity_log`,
  end the target's refresh chains, and no longer echo `error.message`.
- **Verify:** SEC-05 tests (moderator, technical, student → 403; super → 200, logged).

### SEC-06 — Suspension and deletion don't stop live tokens · Medium · Fixed

- **Where:** `lib/auth.ts` `getUserFromToken`, `getUserIdFromToken`, `getAuthedUser`.
- **Root cause:** only login checked `suspended`; tokens last 24 h.
- **Fix:** every user-scoped identity check reads `suspended`/`suspension_end_date` and
  refuses an active suspension or a missing row. Expired suspensions pass, as before.
  Admin-only routes (`requireRole`) are unchanged.
- **Verify:** SEC-06 tests; `identity-resolution.test.ts` adds the deleted-user case.

### SEC-07 — Password change leaves other devices signed in · Medium · Fixed

- **Fix:** `change-password`, `set-password` and admin resets delete the account's refresh
  tokens. Existing access tokens still live out their expiry (see SEC-13).
- **Verify:** SEC-07 test.

### SEC-08 — `/api/admin/verify` password oracle · Low · Fixed

- Answered "is this `ADMIN_PASSWORD`?" for anyone; unused by the SPA. Route, handler and
  schema removed. Test: 404.

### SEC-09 — AI routes outside the AI budget · Medium · Fixed

- `POST /api/notes/:id/summary` and `/quiz` called the paid model with no per-user limit.
  Now share the `ai` bucket (5 per 15 min per account). Test: 6th call → 429.

### SEC-10 — react-router open redirect · Medium · Fixed

- `npm audit` high: GHSA-2w69-qvjg-hvjx, GHSA-2j2x-hqr9-3h42 in `react-router-dom` 6.30.1.
  6.30.6 is inside the existing `^6.30.0` range; lockfile-only change.

### SEC-11 — Shared admin passwords · Medium · Open (design)

- Three passwords, no per-person accounts, no 2FA on admin login, no record of _who_
  used a seat. Anyone told the password keeps access until it is rotated.
- **Recommend:** per-person admin accounts (Google sign-in plus an allow-list of admin
  emails, or the existing TOTP), then retire the shared passwords. Until then: long
  random passwords, rotate when anyone leaves.

### SEC-12 — Public leaderboard · Low · Open (owner decision)

- `GET /api/leaderboard` returns up to 100 students' `display_name`, `photo_url`, `class`
  with no sign-in, cached publicly. The users are mostly minors.
- **Recommend:** require sign-in (`getOrCreateUser`) unless signed-out visitors are
  meant to see it.

### SEC-13 — Access tokens can't be revoked · Low · Residual

- `revoke-tokens` and password changes delete refresh tokens only. A stolen 24 h access
  token stays valid until it expires (15 min for clients using short sessions).
  Suspension and deletion are now enforced (SEC-06). Rotating `JWT_SECRET` is the
  emergency stop — it signs everyone out.

### SEC-14 — zod advisory · Low · Open

- GHSA-mrhx-c7xc-m3w5, fixed only in zod 4 (breaking). Request bodies are capped at
  10 MB before parsing (`capRequestBody`), which bounds the input. Upgrade with the
  next dependency pass.

### SEC-15 — CORS origin pattern · Low · Informational

- `getAllowedOrigin` reflects any `https://notariumm…vercel.app` origin, which anyone can
  register on Vercel. Impact is low because auth is bearer-only and there is no
  `Access-Control-Allow-Credentials`. Narrow it to exact preview hosts if those are
  still used.

### SEC-16 — Fail-open controls · Info · Accepted

- `checkRateLimit` and the maintenance check allow the request when KV/DO error. That is
  an availability choice; noted so nobody counts on them during an outage.

### SEC-17 — Remaining react-router advisories · Info

- GHSA-wrjc-x8rr-h8h6 (backslash redirect) and GHSA-337j-9hxr-rhxg (SSR hydration) need
  v7. The SPA has no SSR, and the only dynamic redirect target (`login.tsx` `state.from`)
  comes from router state, not the URL [believed]. Revisit on the v7 upgrade.

## Checked and found sound

- SQL: parameterised everywhere looked at; the one dynamic `UPDATE` joins fixed columns.
- Note IDOR: `getNote`, update, delete, publish, summary all check `author_id` (covered
  by existing `G-idor` suites).
- JWT: HS256 with an explicit algorithm pin (added here); refresh tokens can't be used as
  access tokens; rotation is single-use with family revoke on replay.
- Frontend: no `dangerouslySetInnerHTML`/`innerHTML`; strict CSP; HSTS; `frame-ancestors 'none'`.
- Body size cap enforced on streamed bytes, not just `Content-Length`.
- Login rate limit keyed on IP + account; 2FA verify limited per IP and per account.
