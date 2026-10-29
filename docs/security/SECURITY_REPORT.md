# Security report — Notarium hardening, 29 Oct 2026

## Summary

The Worker already had sound basics: parameterised SQL, per-note ownership checks,
refresh-token rotation, a strict CSP, body-size caps, and a large red-team test suite.
Most of what was wrong sat in the account-recovery and admin paths.

- **One critical issue is still open and needs the owner:** four provider API keys
  (2 Google, 2 DeepSeek-style) are in the git history of a **public** repo. Rotate them
  (SEC-00). No code change can fix this.
- Fixed: Google sign-in landing in an admin account; admin-password brute force;
  2FA switched off with only a token; password set with only a token; moderators able to
  reset any password; suspended users keeping API access; two AI routes outside the
  per-user limit; a react-router open redirect.
- Passing tests do not make the app secure. See "Still open" below.

Full findings: `SECURITY_AUDIT.md`. Assets, boundaries, attack paths: `THREAT_MODEL.md`.

## Architecture in one paragraph

Vite/React SPA on Vercel → bearer-JWT (HS256) calls → one Cloudflare Worker (hand-rolled
router in `backend/src/index.ts`) → D1, KV and a rate-limit Durable Object; DeepSeek and
Google Vision/Gemini called server-side. Students sign in with Google; three admin seats
use shared passwords. Tokens live in `localStorage`, so XSS would mean account takeover.
The strict CSP (`script-src 'self'`) is what stops that.

## Changes

| File                                                    | Change                                                                                                                                                                                                             | Finding            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `backend/src/lib/auth.ts`                               | `isReservedAdminEmail`, `isSuspendedNow`; user identity refuses suspended/deleted accounts; `verifyToken` pins HS256 and returns `iat`; Firebase path skips admin rows and reserved domains                        | SEC-01, 06         |
| `backend/src/routes/oauth.ts`                           | Refuse reserved domains and `role = 'admin'` rows on Google sign-in                                                                                                                                                | SEC-01             |
| `backend/src/routes/auth.ts`                            | Signup refuses reserved domains; legacy admin login spends the IP-only admin bucket                                                                                                                                | SEC-01, 02         |
| `backend/src/routes/twofa.ts`                           | Setup refuses while 2FA is on; disable rate-limited per account; set-password needs a token ≤ 10 min old and ends refresh chains                                                                                   | SEC-03, 04, 07     |
| `backend/src/index.ts`                                  | Password-reset/migrate routes super-only, logged, end refresh chains, generic errors; change-password ends refresh chains; note summary/quiz under the AI limit; `/api/admin/verify` and `/api/debug/ping` removed | SEC-05, 07, 08, 09 |
| `backend/src/routes/admin.ts`, `lib/validation.ts`      | `verifyAdmin` and its schema removed                                                                                                                                                                               | SEC-08             |
| `package-lock.json`                                     | react-router-dom 6.30.1 → 6.30.6 (in range)                                                                                                                                                                        | SEC-10             |
| `backend/test/red-team/K-hardening-29oct.test.ts`       | New: 23 regression tests, one group per finding                                                                                                                                                                    | all                |
| `backend/src/lib/__tests__/identity-resolution.test.ts` | Fake DB answers the suspension read; seeds the users the legacy cases sign for; new case: a deleted user's token is refused                                                                                        | SEC-06             |
| `backend/test/red-team/malformed-json-400.test.ts`      | Dropped the `/api/admin/verify` row (route gone)                                                                                                                                                                   | SEC-08             |

**Behaviour changes users could notice**

- A suspended or deleted user's existing token now gets 401 on user routes, not just at
  the next login.
- `POST /api/auth/set-password` answers `401 {reauth: true}` if the sign-in is over
  10 minutes old. The SPA doesn't call it today.
- Moderator and technical seats lose the three password-reset routes (the SPA's admin
  dashboard doesn't use them — `src/lib/admin-api.ts` lists them as deliberately absent).
- Google sign-in for an admin email fails with `reason=admin_oauth_forbidden`; the login
  screen shows its generic "did not finish" message.

## Verification (actual results)

| Check                                                      | Result                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend `vitest run`, before changes                       | 645 / 646 pass. 1 failure: `tutor-wing` "concurrent complete calls award exactly one session" (race test, pre-existing)                                                                                                                                                         |
| New tests against the **old** code (`git stash` of `src/`) | 19 of 22 fail, as intended. The 3 that pass are controls (normal setup works, student refused, expired suspension passes)                                                                                                                                                       |
| Backend `vitest run`, after changes                        | 664 / 666 pass. 2 failures, both concurrency race tests: the pre-existing `tutor-wing` one, and `concurrency.test.ts` "N distinct users liking one note". The second passes when run alone, twice with this change and once without — load-dependent, not caused by this change |
| Backend `tsc --noEmit`                                     | clean                                                                                                                                                                                                                                                                           |
| Backend `eslint src`                                       | 0 errors, 409 warnings (pre-existing; no new categories)                                                                                                                                                                                                                        |
| Frontend `tsc --noEmit`                                    | clean                                                                                                                                                                                                                                                                           |
| Frontend `vite build`                                      | succeeds (to a temp dir; `dist/` untouched)                                                                                                                                                                                                                                     |
| Frontend `vitest run`                                      | 159 / 159 pass                                                                                                                                                                                                                                                                  |
| `npm audit --omit=dev` root                                | was 3 high; now 2 moderate (need react-router v7, see SEC-17)                                                                                                                                                                                                                   |
| `npm audit --omit=dev` backend                             | 1 high (zod, needs v4, SEC-14)                                                                                                                                                                                                                                                  |
| Secret scan, tracked files + built bundle                  | clean                                                                                                                                                                                                                                                                           |
| Secret scan, git history                                   | **4 distinct keys found** (SEC-00)                                                                                                                                                                                                                                              |

Not run: Playwright e2e (needs a long-path-safe checkout and a local wrangler; see
STATE.md landmines), anything against production.

Not covered by an automated test: the OAuth callback's admin refusal (needs a mocked
Google token exchange). The rule it calls (`isReservedAdminEmail`) is tested.

## Still open

1. **SEC-00 — rotate the leaked keys.** Highest priority, owner-only.
2. SEC-11 — shared admin passwords; move to per-person admin identities.
3. SEC-12 — decide whether the leaderboard should need sign-in.
4. SEC-13 — access tokens can't be revoked individually; `JWT_SECRET` rotation is the
   emergency stop.
5. SEC-14 — zod 4 upgrade.
6. SEC-15 — narrow the Vercel preview CORS pattern.

## Manual checks still needed

- [ ] Query production read-only: does any `users` row have an `@notariumadmin.com`
      email? (`npx wrangler d1 execute notarium-db --remote --command "SELECT id, email, role FROM users WHERE email LIKE '%@notariumadmin.com'"`)
      Not run here — it reads production data.
- [ ] Confirm `ADMIN_PASSWORD`, `MODERATOR_PASSWORD`, `TECH_PASSWORD`, `JWT_SECRET` are
      long (≥ 32 random chars). Rotating `JWT_SECRET` signs every user out.
- [ ] Decide whether to register `notariumadmin.com` yourself so nobody else can.
- [ ] MFA on the GitHub, Cloudflare, Vercel, Google Cloud and DeepSeek accounts.
- [ ] Sign in with Google once after deploy and confirm a student lands in the app.

## Deploy checklist

1. Rotate the four leaked keys first (SEC-00); `npx wrangler secret put …` in `backend/`.
2. Review and commit this change. **`main` auto-deploys the frontend on Vercel.**
3. Deploy the Worker from `backend/` (`npx wrangler deploy`), noting the rollback version
   it prints, the same way as the 28 Oct deploy in STATE.md.
4. Smoke: `/api/health` 200; Google sign-in as a student; admin sign-in on `/admin` with
   the super password; a moderator panel loads.
5. No new environment variables, no schema change, no migration.

## Rollback

`npx wrangler rollback <previous version id>` in `backend/` for the Worker; Vercel
"Promote" the previous deployment for the frontend. This change adds no data or schema,
so rolling back loses nothing.
