# STATE — Notarium

Updated: 12 Sep 2026 · Session: go-live 2

## Building

A note-sharing and study platform for one Indonesian school (UTC+7): students
upload notes, review them with spaced repetition and quizzes, and book peer
tutors. Cloudflare Worker + D1 behind a Vite/React frontend on Vercel.

## True right now

- Production runs code from 24 Nov 2025. Everything since — study loop,
  Frosted Canopy redesign, tutor wing, timezone fixes — is on this laptop only:
  21 commits unpushed, ~49 files uncommitted.
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
- Live worker still 404s `/api/health`; that route exists in local code. When
  it returns 200, the new worker is serving.

## Decided

- Tests are excluded from the backend `tsc` build (`backend/tsconfig.json`)
  rather than loosening the module target — tests never belonged in `dist/`. (12 Sep)
- Deploy the backend from this machine with `npx wrangler deploy`, not via
  GitHub Actions. The local token works and is verified; the CI path depends on
  repo secrets and a dead R2 step. (12 Sep)
- Rebuild the production `users` table with the same guarded procedure used on
  the local DB on 28 Aug (backup → assert column coverage → assert row count →
  `PRAGMA foreign_key_check` → rollback on any throw → recount 11 child tables).
  It must be scripted and rehearsed against the local DB first; the local
  rebuild was done by hand and left no script. (12 Sep)
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

1. Commit the working tree (49 files incl. the untracked backfill script,
   migration 0021, and four new test files), then `cd backend && npx wrangler deploy`.

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
