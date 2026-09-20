# Database migrations

Tracked by `wrangler d1 migrations` since Wave 4 (W4.1). D1 records every applied file in the
`d1_migrations` table of each database, so `apply` only ever runs the files a database has not
seen. The Worker no longer creates or alters tables at runtime — `initializeDatabase()` only
seeds the default subjects and keeps their note counts right.

| File | What it does | On a fresh D1 | On production (`notarium-db`, checked 20 Sep 2026) |
|---|---|---|---|
| `0001_baseline.sql` | every table + index the Worker needs, all `IF NOT EXISTS` | creates the schema | no-op (every table already exists) |
| `0002_refresh_tokens_family.sql` | `ALTER TABLE refresh_tokens ADD COLUMN family` + index | adds the column | adds the column (absent today) |
| `0003_refresh_tokens_revoked_at.sql` | `ALTER TABLE refresh_tokens ADD COLUMN revoked_at` | adds the column | adds the column (absent today) |
| `0004_notes_status_visibility_backfill.sql` | `UPDATE notes` NULL/''/'undefined' status/visibility → defaults | no rows | rewrites only broken rows; idempotent |

## Commands

```bash
cd backend
npm run migrate:local        # local D1 used by `wrangler dev` (env development)
npm run migrate:staging      # notarium-db-staging, remote (env staging)
npm run migrate:production   # notarium-db, remote — OWNER ONLY, see MIGRATION_GUIDE.md
npm run migrate:list         # what staging has applied / still pending
```

The GitHub `deploy.yml` runs `migrate:staging` before every staging deploy, and the manual
production job runs `migrate:production` before `wrangler deploy --env production`.

## Rules

- New schema change → new file `000N_short_name.sql`, next number, never edit an applied file.
- One `ALTER TABLE ... ADD COLUMN` per file. SQLite has no `ADD COLUMN IF NOT EXISTS`, so an
  ALTER is not re-runnable; keeping each in its own file means a failure leaves an exact,
  resumable state (`wrangler d1 migrations list` shows which file stopped).
- `CREATE TABLE` / `CREATE INDEX` always `IF NOT EXISTS`.
- Data backfills are allowed when idempotent (0004 is the pattern). Never a one-time reset like
  the old `0006_reset_user_stats.sql` — that file was dropped for exactly that reason.
- A database that already has a column an ALTER file adds (a local D1 built by the pre-W4
  runtime) cannot take that file. Either recreate the local DB (it is throwaway) or mark the file
  applied by hand: `INSERT INTO d1_migrations (name) VALUES ('0002_refresh_tokens_family.sql')`.

## History

The nine pre-W4 files (`0001_allow_null_class` … `0008_add_refresh_tokens`,
`add_multi_photo_support`) were applied to production by hand with `wrangler d1 execute` and are
folded into `0001_baseline.sql`; `git show 6ad8782:backend/migrations/` still has them.
`backend/schema.sql` is a read-only snapshot of production's *actual* schema (it carries tables
from the `origin/main` lineage that this Worker never touches — see `RELEASE/C2-deployed-bundle_19-09-26.md` in the V2.0 repo).
