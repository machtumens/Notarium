# STATE — Notarium

Updated: 12 Sep 2026 (live) · Session: go-live 2

## Building

A note-sharing and study platform for one Indonesian school (UTC+7): students
upload notes, review them with spaced repetition and quizzes, and book peer
tutors. Cloudflare Worker + D1 behind a Vite/React frontend on Vercel.

## True right now

- Live. Worker and frontend both run `main` (`fd5b4ed`, pushed 12 Sep).
  Deployed from this machine — `npx wrangler deploy` in `backend/`,
  `npx vercel --prod` at the root. `/api/health` returns 200.
- Production `users` was rebuilt 12 Sep: no CHECK constraints, ISO timestamp
  defaults, 45 rows verified identical before the old table was dropped.
  A grade 12 and a grade 11 signup were then made against production and
  returned 201 (test rows deleted afterwards). Before this, every grade 11/12
  signup had 500'd since launch — production had 45 users, all grade 10.
- 706 space-form timestamps across 13 columns were rewritten to ISO-8601 UTC.
  The audit now reads 0. New rows are covered by 24 AFTER INSERT triggers.
- Google sign-in: `OAUTH_REDIRECT_URI` set; the callback URI is registered in
  Google Cloud Console (verified 12 Sep — Google serves its sign-in page, no
  `redirect_uri_mismatch`). The full round-trip into a session has not been
  done from a browser yet. Before 12 Sep this returned 501.
- AI is broken in production for a non-code reason: DeepSeek answers
  "Insufficient Balance" — still, after Richard topped up on 12 Sep. That error
  means the key is valid and its account has no credit, so the top-up most
  likely landed on a different DeepSeek account than the one that issued
  `DEEPSEEK_API_KEY`. Fix: new key from the topped-up account,
  `npx wrangler secret put DEEPSEEK_API_KEY` in `backend/`. Every LLM feature
  (summaries, quiz, Primer, study plan, concept explain) 500s until then. OCR
  goes to Google Vision and was not tested. AI chat was removed on purpose.
- Vercel production has no environment variables. `VITE_API_URL` falls back
  to the right default. `VITE_FEATURE_GOOGLE_OAUTH` unset → the "link Google"
  settings card is hidden (that path also needs `OAUTH_TOKEN_AES_KEY`).
- Firebase auth is half-migrated and dormant: `FIREBASE_PROJECT_ID` unset, so
  the legacy HS256 path serves every request. Fine as is.
- Schema deploy path is `initializeDatabase()` in `backend/src/lib/db.ts`.
  Production has never had `wrangler d1 migrations apply`. `CREATE TABLE IF
NOT EXISTS` never repairs an existing table — that is why `users` needed a
  rebuild and why any future constraint change will too.
- Backups from today (full D1 exports, real student data) are in
  `backend/backups/` — gitignored, keep it that way.

## Decided

- Deploy from this machine, not GitHub Actions. `deploy.yml` ends red every
  run because its last step writes to R2 and R2 is not enabled. (12 Sep)
- Tests are excluded from the backend `tsc` build (`backend/tsconfig.json`);
  they never belonged in `dist/`. (12 Sep)
- Repo `.npmrc` with `legacy-peer-deps=true`. The lockfile was generated with
  peer checks off; without this, `npm install`/`npm ci` fail everywhere. (12 Sep)
- Table rebuilds on D1 go rename → create clean → copy → verify → drop old,
  never dropping a table a child references, and always probe first that
  `PRAGMA foreign_keys=OFF` takes effect on the path in use. It does on
  wrangler `--remote`; it does NOT on `--local`, where the batch runs in a
  transaction and the cascade fires. Rehearse on a scratch remote D1 loaded
  from an export (`scripts/rebuild-users-table.sh` is the template). (12 Sep)
- Reads against remote D1 go through `--command`; `--file` returns only a
  summary there. (12 Sep)

## Rejected

- Loosen `"module"` to ES2022 to fix the top-level-await build error — ships
  tests into `dist/`; excluding tests is the fix. (12 Sep)
- `PRAGMA writable_schema` to edit a CHECK in place — D1 blocks schema
  pragmas, and it is a hack on a live database. (12 Sep)
- Bind `NULL` to `class` on signup to slip past the CHECK — `class` is read
  and displayed everywhere. (12 Sep)
- `PRAGMA defer_foreign_keys` instead of `foreign_keys=OFF` for the rebuild —
  deferral only delays the _check_; `DROP TABLE` still fires ON DELETE
  CASCADE actions. (12 Sep)
- Rehearse the rebuild on the local D1 — different execution path; the probe
  aborts there, so it proves nothing about production. (12 Sep)
- Finish the Firebase migration before launch — legacy fallback verified. (8 Sep)
- Chase the 876 KB three-vendor chunk, 442 lint warnings, UI findings F3–F6 —
  none block anything. (8 Sep)

## Next

1. Put a DeepSeek key from the topped-up account on the worker, then call
   `POST /api/ai/primer` once with a real login and confirm structured JSON.
2. Sign in with Google on notarium-site.vercel.app from a browser — the only
   part of that flow not yet exercised.
3. Walk the app as a student: upload a note (exercises Vision OCR), check a
   date reads "Today", book a tutor session.

## Landmines

- `npm run lint` at the root shows 325 errors. All one cause: eslint sees a
  second tsconfig in the gitignored `.claude/worktrees/`. Not real; the
  pre-commit hook (per-file eslint) is unaffected.
- `npm run migrate` only runs migrations 0001–0003 of 21. Nothing uses it.
  Delete it so nobody trusts it.
- Two `wrangler.toml` files. The root one lacks KV and Durable Object
  bindings. Always deploy from `backend/`.
- `deploy.yml` goes red on every push (R2 step). Do not read the badge as a
  failed deploy; delete those two lines or enable R2.
- Signup is domain-locked to `@sekolahkristencalvin.org` (backend check).
- D1 rejects statements over ~100 KB. `wrangler d1 export` output does not
  round-trip through `d1 execute --file` — notes carry base64 images inline.
  To restore from a backup, split it row-per-INSERT and clip or skip the
  oversized rows (see the resplit approach used for the rehearsal).
- Go-live runbook: https://claude.ai/code/artifact/22712451-8489-44eb-a156-80b65f75092c
