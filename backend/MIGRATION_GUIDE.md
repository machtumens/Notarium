# Database migration guide

Since Wave 4 (W4.1) the schema is owned by `migrations/` and applied with Cloudflare's own
tracker, `wrangler d1 migrations`. The Worker no longer creates or alters tables on its first
request; it only seeds the 14 default subjects. File-by-file detail: `migrations/README.md`.

## Everyday commands

```bash
cd backend
npm run migrate:local          # local D1 for `npm run dev:wrangler` (env development)
npm run migrate:staging        # notarium-db-staging (remote) — deploy.yml does this on every push to master
npm run migrate:list           # per-file status on staging
npm run migrate:production     # notarium-db (remote) — owner only, from the manual production job or by hand
npm run migrate:list:production
```

`apply` runs the files a database has not recorded in its `d1_migrations` table, in numeric
order, and stops at the first failure (that file is not recorded, the earlier ones are).

## The one-time production apply — read before the first `migrate:production`

Production (`notarium-db`, id `17779d22-…`) has never run `wrangler d1 migrations`; its
`d1_migrations` table does not exist yet, so the first apply will try every file. What each one
actually does there (schema checked read-only on 20 Sep 2026):

| File | On production |
|---|---|
| `0001_baseline.sql` | **no-op** — every `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` finds its object. Production's tables are wider than the baseline (STRICT tables with extra columns from the `origin/main` lineage); `IF NOT EXISTS` never touches an existing table, so nothing is narrowed or rebuilt. |
| `0002_refresh_tokens_family.sql` | adds `refresh_tokens.family` + its index — the column is **absent** in production today, so the ALTER succeeds |
| `0003_refresh_tokens_revoked_at.sql` | adds `refresh_tokens.revoked_at` — absent today, succeeds |
| `0004_notes_status_visibility_backfill.sql` | rewrites only rows whose `status`/`visibility` is NULL, '' or 'undefined' (the same statement the old runtime ran on every cold start) |

Order of operations for a production release is always **migrate, then deploy**: the Worker
built from `master` writes `family`/`revoked_at` on every refresh-session login, so deploying it
before 0002/0003 have run would 500 those logins. `deploy.yml`'s production job enforces the order.

If a future ALTER file fails on production because the column already exists (someone added it by
hand), do not edit the file — record it as applied and re-run:

```bash
npx wrangler d1 execute notarium-db --env production --remote \
  --command "INSERT INTO d1_migrations (name) VALUES ('000N_the_file.sql')"
npm run migrate:production
```

## Adding a migration

1. `migrations/000N_short_name.sql`, next free number. `CREATE … IF NOT EXISTS`; one
   `ALTER TABLE … ADD COLUMN` per file; data backfills only when idempotent.
2. `npm test` — the harness applies the whole directory to a fresh D1 before every test file, and
   `test/migration.test.ts` checks that every file is recorded and that the baseline stays
   re-runnable.
3. `npm run migrate:local`, then `npm run dev:wrangler` to try it.
4. Push to `master` → CI tests → the staging job applies it to `notarium-db-staging` and deploys.
5. Production: the manual job, or `npm run migrate:production` followed by the deploy.

## Rolling back

D1 has no migration-level rollback. A failed ALTER is not recorded, so fixing the file and
re-running is the normal path. Data mistakes: D1 Time Travel (`wrangler d1 time-travel info
notarium-db`, then `restore --timestamp`) — a full-database point-in-time restore, so treat it as
an incident action, not a routine one. Code rollback is `wrangler rollback` (see
`RELEASE/RUNBOOK.md` in the V2.0 repo); a rolled-back Worker keeps working against a migrated
database as long as the migration was additive, which every file here is.

## Legacy

The pre-W4 files (`0001_allow_null_class.sql` … `0008_add_refresh_tokens.sql`,
`add_multi_photo_support.sql`) were applied by hand with `wrangler d1 execute`; their content is
folded into `0001_baseline.sql`. `fix-class-data.sql` and `DELETE_BROKEN_ADMIN.sql` in this
directory are one-off scripts from that era, not migrations — leave them out of `migrations/`.
The admin-login CHECK-constraint problem this guide used to describe is gone with the rebuilt
`users` table (production has no CHECK constraints since 12 Sep 2026).
