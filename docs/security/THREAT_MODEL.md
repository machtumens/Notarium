# Threat model — Notarium

Written 29 Oct 2026 from the code at `main` (`02283fd`) plus the uncommitted hardening in
this change. Scope: this repo only. Nothing was tested against production.

## What the system is

| Part                             | Runs on                                                             | Notes                                                                                |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| React 19 + Vite SPA (`src/`)     | Vercel, `notarium-site.vercel.app`                                  | Static. Strict CSP in `vercel.json` (`script-src 'self'`, `frame-ancestors 'none'`). |
| Worker API (`backend/src/`)      | Cloudflare Workers, `notarium-backend.notarium-backend.workers.dev` | One `fetch` handler, hand-rolled path router in `index.ts`.                          |
| D1 (SQLite)                      | Cloudflare                                                          | All user data. Schema applied by `initializeDatabase()`.                             |
| KV `RATE_LIMIT`                  | Cloudflare                                                          | Rate-limit fallback, maintenance flag, OAuth one-time codes.                         |
| Durable Object `RateLimiter`     | Cloudflare                                                          | Atomic rate limiting.                                                                |
| Google OAuth                     | Google                                                              | The only sign-in the UI offers.                                                      |
| DeepSeek, Google Vision / Gemini | Third parties                                                       | Paid; called server-side with keys held as Worker secrets.                           |

Users: students at one Indonesian school, mostly minors. Three admin seats (super,
moderator, technical) authenticated by **shared passwords** held as Worker secrets.

## Assets

1. Student accounts and PII — names, emails, class, photos, notes, study history.
2. Admin seats — moderator can suspend/remove users and edit notes; super can do everything.
3. Provider API keys (DeepSeek, Google) — direct cost if leaked.
4. `JWT_SECRET` — whoever holds it can mint any identity, including super admin.
5. The shared admin passwords (`ADMIN_PASSWORD`, `MODERATOR_PASSWORD`, `TECH_PASSWORD`).

## Trust boundaries

1. **Browser → Worker.** Everything in a request is attacker-controlled. Identity is a
   bearer JWT (HS256) in `Authorization`; no cookies. CORS is not a security boundary
   here (bearer-only, no credentialed CORS).
2. **Worker → D1.** Parameterised `prepare().bind()` throughout. Dynamic SQL only joins
   fixed column names (`index.ts` profile update).
3. **Worker → AI providers.** User text and note text go into prompts. Model output comes
   back as data; the SPA renders it as text (no `dangerouslySetInnerHTML` anywhere in `src/`).
4. **Google → Worker (OAuth callback).** Google proves control of a mailbox, nothing more.
5. **Git history → the world.** The GitHub repo is **public**; anything ever committed is
   readable by anyone, permanently.

## Entry points (inventory)

About 90 routes in `backend/src/index.ts`. Grouped by guard:

| Guard                                   | Routes                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none (public)                           | `/api/health`, `/api/ready`, `/api/subjects`, `/api/grade-classes`, `/api/leaderboard`, `/api/auth/{signup,login,refresh,admin-login,forgot-password,2fa/verify}`, OAuth start/callback/exchange, `/test` |
| any signed-in user                      | notes, study, reviews, progress, tutors, notifications, profile, 2FA setup/enable/disable, set-password, change-password, AI                                                                              |
| `requireModerator` (moderator or super) | `/api/admin/*` moderation, subjects, grade classes, notifications                                                                                                                                         |
| `requireTechnical` (technical or super) | `/api/ops/*`                                                                                                                                                                                              |
| super only                              | `admin-reset-password`, `emergency-password-fix`, `migrate-passwords` (as of this change), `ops/danger/*`                                                                                                 |

## Likely attack paths (STRIDE)

| #   | Threat                                                      | STRIDE                      | Path                                                                                                      | State after this change                                                                     |
| --- | ----------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| T1  | Use a leaked provider key from public git history           | Info disclosure, DoS (cost) | Clone repo, `git log -p`                                                                                  | **Open — needs key rotation by owner** (SEC-00)                                             |
| T2  | Become admin through Google sign-in on an admin row's email | Elevation                   | Register `notariumadmin.com` (did not resolve 29 Oct), create Google account, OAuth sign-in               | Closed (SEC-01)                                                                             |
| T3  | Brute-force the shared super-admin password                 | Spoofing                    | Legacy `@notariumadmin.com` login, rotating addresses                                                     | Closed (SEC-02); password strength unverified                                               |
| T4  | Stolen access token → permanent takeover                    | Spoofing, Elevation         | XSS / shared computer / malware gets the token from `localStorage`, then turns 2FA off or sets a password | Closed (SEC-03, SEC-04)                                                                     |
| T5  | Moderator takes over a student account                      | Elevation                   | `emergency-password-fix` on any email                                                                     | Closed (SEC-05)                                                                             |
| T6  | Suspended or deleted user keeps using the API               | Elevation                   | Keep the 24 h token                                                                                       | Closed (SEC-06)                                                                             |
| T7  | Drain the AI budget                                         | DoS (wallet)                | Loop note quiz/summary routes                                                                             | Closed (SEC-09); limits are per account, so many accounts still multiply cost               |
| T8  | Read another student's private data (IDOR)                  | Info disclosure             | Change ids                                                                                                | Existing guards + `G-idor`, `gaps-ratelimit-notes-idor` suites; not re-audited line by line |
| T9  | Prompt injection via note text                              | Tampering                   | Upload a note with instructions                                                                           | Low impact: model has no tools, output is rendered as text                                  |
| T10 | Scrape student names/classes                                | Info disclosure             | `GET /api/leaderboard` is unauthenticated                                                                 | Open, owner decision (SEC-12)                                                               |

## Assumptions

- Worker secrets in Cloudflare are not readable by anyone outside the owner.
- `JWT_SECRET` is long and random. Not verified (it's a secret).
- The admin passwords are long and random. Not verified.
- Vercel and Cloudflare dashboards are protected with the owner's MFA. Not verified.
- The school's single NAT IP means IP-keyed limits are shared by every student — the
  code already keys most limits on account, not IP, for this reason.
