# Secrets — names only

No value is written anywhere in this repository. Worker secrets are set with
`wrangler secret put NAME [--env staging|production]` from a logged-in machine; GitHub secrets
with `gh secret set NAME` (value piped from stdin or typed at the prompt, never in a command
line that ends up in shell history). `wrangler secret list --env <env>` shows names, never values.

## Worker secrets (Cloudflare)

Secrets belong to a Worker script, so each environment has its own set.

| Name | Live worker `notarium-backend` (top-level = `--env production`) | `notarium-backend-staging` (`--env staging`) |
|---|---|---|
| `JWT_SECRET` | required — HS256 key for access tokens; rotating it signs everyone out once | required — generated fresh for staging (`openssl rand -base64 48`), never the production value |
| `ADMIN_PASSWORD` | required — shared secret for `POST /api/auth/admin-login` | required — random staging-only value |
| `GEMINI_API_KEY` | present — OCR / summaries | not set: AI routes fail on staging by design |
| `DEEPSEEK_API_KEY` | present — chat / tags | not set |
| `GOOGLE_CLOUD_VISION_API_KEY` | present — OCR | not set |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI` | present on the live worker; used by the `origin/main` bundle's Google sign-in, **not read by `master`** (see `RELEASE/C2-deployed-bundle_19-09-26.md`) | not set |

Vars that are *not* secrets live in `wrangler.toml` per environment: `ENVIRONMENT`,
`FRONTEND_URL`, `EXTRA_ORIGINS`; `GIT_SHA` is passed by `deploy.yml` as `--var GIT_SHA:$GITHUB_SHA`.

## GitHub Actions secrets (repository `machtumens/Notarium`)

| Name | Set by | Used by |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | already set (`gh secret set CLOUDFLARE_ACCOUNT_ID`, value `eff3ad4cbe50b8add07430c5020da6c4` — an account id, not sensitive) | `deploy.yml` staging + production jobs |
| `CLOUDFLARE_API_TOKEN` | **owner** — create it at dash.cloudflare.com → My Profile → API Tokens → Create Token → "Create Custom Token" with the permissions below, then `gh secret set CLOUDFLARE_API_TOKEN` (paste at the prompt) | same |

The same two secrets are needed on `machtumens/notarium-v2` for the Pages deploy workflow
(one token can serve both repositories; add it to each repo's secrets).

### `CLOUDFLARE_API_TOKEN` permissions (custom token, scoped to this account)

| Scope | Permission | Why |
|---|---|---|
| Account → Workers Scripts | Edit | `wrangler deploy --env staging|production`, `wrangler rollback` |
| Account → D1 | Edit | `wrangler d1 migrations apply … --remote` |
| Account → Workers KV Storage | Edit | wrangler validates the KV binding at deploy |
| Account → Cloudflare Pages | Edit | `wrangler pages deploy` (V2.0 repo) |
| Account → Account Settings | Read | wrangler resolves the account / workers.dev subdomain |
| Account → Workers Tail | Read (optional) | `wrangler tail` from a workflow, if ever added |

Account resources: include only this account (`eff3ad4c…`). No zone permissions are needed
(both Workers and Pages are on `*.workers.dev` / `*.pages.dev`). TTL: set an expiry and rotate.

## Removed / never to be added

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — the Vercel step is gone from
  `deploy.yml`; the legacy site deploys by hand (`RELEASE/RUNBOOK.md`).
- Any AI provider key on staging.
- `.dev.vars` is **not** gitignored in this repository; do not create one. `wrangler dev
  --var NAME:value` (what the V2.0 Playwright config does with a throwaway `JWT_SECRET`) keeps
  local secrets out of files.

## Rotation notes

- `JWT_SECRET`: every access token becomes invalid immediately; refresh tokens are hashed rows,
  they survive but the next refresh mints a token with the new key.
- `ADMIN_PASSWORD`: takes effect on the next admin login.
- Production provider keys (H1 in the master plan) are the owner's call; agents never rotate them.
