# STATE — Notarium

Updated: 12 Sep 2026 (worker + frontend deployed, rebuild rehearsed) · Session: go-live 2

## Building

A note-sharing and study platform for one Indonesian school (UTC+7): students
upload notes, review them with spaced repetition and quizzes, and book peer
tutors. Cloudflare Worker + D1 behind a Vite/React frontend on Vercel.

## True right now

- The Worker is current: commit `356aa92` deployed 12 Sep from this machine
  (version `46916160`). `/api/health` returns 200. The first request ran the
  schema init against production — 5 new `users` columns, 6 new tables, 24
  timestamp triggers, all verified by query.
- The Vercel frontend is current too: deployed 12 Sep from this machine,
  aliased to notarium-site.vercel.app. A repo `.npmrc` (`legacy-peer-deps=true`)
  was needed — the lockfile was generated with peer checks off and plain
  `npm install` failed on Vercel.
- 24 commits are unpushed to GitHub.
- Tests pass: 61 frontend, 332 backend. `npm run build` is green as of today
  (tests were being compiled into the backend build; now excluded).
- Local wrangler is logged in as the right account and can read and write the
  production D1. Verified today with a read-only query.
- Production `users` table (verified 12 Sep, read from `sqlite_master`):
  - `class TEXT CHECK(class IN ('10.1','10.2','10.3'))` — so signup fails for
    every grade 11 and 12 student. 45 users exist; all are grade 10.
    `grade_classes` already lists 11.1–12.3 as active, so the form lets them try.
  - `role CHECK(role IN ('student','admin'))` — the code only writes those two
    values, so it does not bite today. The rebuild drops it anyway.
  - `created_at / updated_at DEFAULT (datetime('now'))` — space-format
    timestamps that a browser reads as local time (7 hours off here).
  - `encrypted_yw_id` is nullable in prod — cleaner than the local DB was.
  - Table is `STRICT`. `ALTER TABLE ADD COLUMN` works on it; changing a
    constraint does not. Only a rebuild removes the CHECKs.
- The Worker's `initializeDatabase()` is the real deploy path for schema.
  Production has never had `wrangler d1 migrations apply` run against it.
  `CREATE TABLE IF NOT EXISTS` is a no-op on existing tables — deploying does
  not fix the `users` constraints.
- Timestamp triggers (installed by the deploy) fix new rows only. Existing
  rows need `backend/scripts/backfill-iso-timestamps.sh --remote`, which is
  untracked and has never run against production.
- R2 is not enabled on the Cloudflare account. `deploy.yml`'s last step
  (`wrangler r2 put notarium-backups/...`) therefore fails every run, after the
  worker has already deployed.
- Firebase auth is half-migrated. `FIREBASE_PROJECT_ID` is unset, so the code
  falls through to the legacy HS256 path, which works. Ship without it.
- Google sign-in: `OAUTH_REDIRECT_URI` is now set on the worker and
  `/auth/google/start` 302s to accounts.google.com with
  `redirect_uri=https://notarium-backend.notarium-backend.workers.dev/auth/google/callback`.
  Whether that URI is registered in Google Cloud Console is unverified — only
  Richard can check. Before 12 Sep this had never worked in production (501).
  The "link Google to an existing account" path also needs `OAUTH_TOKEN_AES_KEY`
  and `VITE_FEATURE_GOOGLE_OAUTH=true` on Vercel — optional.
- Timestamp backfill: dry-run against production counts 706 space-form values
  across 13 columns. Not yet applied. The script's audit had to switch to
  `--command` — `--file` against `--remote` returns no rows.
- `backend/scripts/rebuild-users-table.sh` exists and is verified: rehearsed
  end to end on a scratch D1 (`notarium-rehearsal`) loaded from a production
  export — 45 rows identical, 11 children unchanged, no CHECK, grade-12 insert
  succeeds. Not yet run against production. The scratch DB still exists;
  delete it after the production run.
- Vercel production has no environment variables at all. `VITE_API_URL` falls
  back to the correct default, so that is fine.
- AI: OCR (Google Vision), summaries, quiz, primer, study plan, concept explain
  are all deployed and all three provider keys are on the worker. Every LLM
  call goes to DeepSeek — the `/api/gemini/*` path names are historical. AI
  chat was removed deliberately (Paperloop phase 4). No AI roadmap or backlog
  exists. The live DeepSeek round-trip for `/api/ai/primer` has never been
  verified — only mocked tests. Needs a logged-in account to probe.

## Decided

- Tests are excluded from the backend `tsc` build (`backend/tsconfig.json`)
  rather than loosening the module target — tests never belonged in `dist/`. (12 Sep)
- Deploy the backend from this machine with `npx wrangler deploy`, not via
  GitHub Actions. The local token works and is verified; the CI path depends on
  repo secrets and a dead R2 step. (12 Sep)
- Rebuild `users` by rename → create clean → copy → verify → drop `users_old`,
  never dropping a table a child still references. The script probes on
  throwaway tables that `PRAGMA foreign_keys=OFF` really takes effect on the
  execution path before it touches `users`: it does NOT on wrangler's
  `--local` path (the batch runs in a transaction, so the cascade fires), it
  DOES on `--remote`. Rehearsal therefore happens on a scratch remote D1, not
  locally. (12 Sep)
- Order: commit → deploy worker → confirm `/api/health` 200 → backfill →
  rebuild `users` → smoke test signup as grade 12 and via Google. (8 Sep)

## Rejected

- Loosen `"module"` to ES2022 to fix the top-level-await error — killed because
  it ships test files into `dist/`; excluding tests is the actual fix. (12 Sep)
- `PRAGMA writable_schema` to edit the CHECK text in place — killed because D1
  blocks schema pragmas and it is a hack on a live database. (12 Sep)
- Bind `NULL` to `class` on signup to slip past the CHECK — killed because
  `class` is read back and displayed all over the UI; NULLing it breaks more
  than it fixes. (12 Sep)
- Finish the Firebase migration before launch — killed because the legacy
  fallback is verified working and Phase 1 still needs a Firebase project. (8 Sep)
- Chase the 876 KB three-vendor chunk, the 442 lint warnings, or UI findings
  F3–F6 before launch — killed; none block going live. (8 Sep)

## Next

1. `cd backend && ./scripts/backfill-iso-timestamps.sh --remote` (706 values),
   then `./scripts/rebuild-users-table.sh --remote` (45 users). Both export
   first and ask for the database name.
2. Smoke test on notarium-site.vercel.app: sign up as grade 12, sign in with
   Google (needs the redirect URI in Google Cloud Console), upload a note,
   check a date reads "Today", book a tutor session, hit Primer once.
3. `npx wrangler d1 delete notarium-rehearsal -y`; `git push origin main`.

## Landmines

- `npm run lint` at the root shows 325 errors. All one cause: eslint sees a
  second tsconfig in the gitignored `.claude/worktrees/`. Not real; CI won't see it.
- `npm run migrate` only runs migrations 0001–0003 of 21. Nothing uses it.
  Delete it after launch so nobody trusts it.
- Two `wrangler.toml` files. The root one lacks KV and Durable Object bindings.
  Deploys must run from `backend/`.
- `backend/backups/` will hold full D1 exports with real student names. It is
  gitignored. Keep it that way.
- The `deploy.yml` R2 step will redden the Actions run even on a good deploy.
  Delete those two lines or enable R2; do not read the red badge as a failed deploy.
- The users rebuild drops a table with 11 foreign-key children, several
  `ON DELETE CASCADE`. Foreign keys must be OFF during the rebuild or the drop
  cascades through notes, likes, sessions, and bookings.
- Go-live runbook (tick-off page): https://claude.ai/code/artifact/22712451-8489-44eb-a156-80b65f75092c
