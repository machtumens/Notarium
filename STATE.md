# STATE — Notarium

Updated: 2 Nov 2026 (late) · Session: three pillars — notes, AI quiz, schedule

## Building

A note-sharing and study platform for one Indonesian school (UTC+7): students
upload notes, review them with spaced repetition and quizzes, and book peer
tutors. Cloudflare Worker + D1 behind a Vite/React frontend on Vercel.

## True right now

- Live. Worker and frontend both run `main` (`fd5b4ed`, pushed 12 Sep).
  Worker: `npx wrangler deploy` in `backend/`. Frontend: push to main. `/api/health` returns 200.
- 12 Sep: production `users` rebuilt without CHECK constraints (grade 11/12 signups had 500'd);
  706 space-form timestamps rewritten to ISO-8601 UTC, kept so by 24 AFTER INSERT triggers.
- Google sign-in: `OAUTH_REDIRECT_URI` set; the callback URI is registered in
  Google Cloud Console (verified 12 Sep — Google serves its sign-in page, no
  `redirect_uri_mismatch`). The full round-trip into a session has not been
  done from a browser yet. Before 12 Sep this returned 501.
- AI in production: DeepSeek key has no credit (12 Sep). Gemini keys now replace it (see below).
- Vercel production has no environment variables. `VITE_API_URL` falls back
  to the right default. `VITE_FEATURE_GOOGLE_OAUTH` unset → the "link Google"
  settings card is hidden (that path also needs `OAUTH_TOKEN_AES_KEY`).
- Firebase auth is half-migrated and dormant (`FIREBASE_PROJECT_ID` unset); legacy HS256 serves all.
- Schema deploy path is `initializeDatabase()` in `backend/src/lib/db.ts`.
  Production has never had `wrangler d1 migrations apply`. `CREATE TABLE IF
NOT EXISTS` never repairs an existing table — that is why `users` needed a
  rebuild and why any future constraint change will too.
- Backups from today (full D1 exports, real student data) are in
  `backend/backups/` — gitignored, keep it that way.

## Notes restored (3 Nov 2026, evening)

- The 3 Nov account purge (`backend/scripts/purge-accounts-2026-11.sql`) was run, then reversed for
  users + notes only: 43 purged users and all 141 notes re-inserted from
  `backups/pre-account-purge-2026-11-03.sql`, ids unchanged, each note back to its pre-archive status
  (139 published, 2 draft). Built by a node:sqlite script that splits values over 60 KB into
  `UPDATE … || chunk` appends; output `backups/restore-notes-2026-11-03.sql` (908 statements).
- NOT restored: likes, quiz attempts, study items, chat, tutor rows, refresh tokens of purged users.
- Backup taken just before: `backups/pre-note-restore-2026-11-03.sql`. Undo = re-run the purge script.
- Verified on production: 49 users, 141 notes, 0 orphans, largest image (1.65 MB) intact. Not verified:
  Discover signed in.

## Three pillars (2 Nov 2026, late) — LIVE (`b890414`)

- AI: `backend/src/lib/llm.ts` tries GEMINI_API_KEY → \_2 → \_3 → DEEPSEEK_API_KEY on any non-2xx.
  Model `GEMINI_MODEL` or `gemini-3.8-flash` (from Google's OpenAI-compat docs, 2 Nov). No Gemini
  key is set yet — Richard creates them in AI Studio, one per Google Cloud project.
- Quiz (`/app/quiz`, "Quiz me on this" on every note): draws on any note the reader may open, not
  only their own. Own bucket: 15 quizzes / 15 min / student. MCQ + true/false only.
- Schedule (`/app/schedule`): 7-day board of group sessions + `study_requests` (new table,
  migration 0023, also in initializeDatabase). Tutor apply has no points gate now; moderators
  approve on admin People ("Tutor applications", `GET /api/admin/tutors`).
- Archive: `backend/scripts/archive-notes-2026-11.sql` RUN 2 Nov — 141 notes (139 published, 2 draft)
  now `archived`, old status in `notes_archive_2026_11`; undo line is in the file. Backup before:
  `backend/backups/pre-archive-2026-11-02.sql` (40 MB).
- Worker version `9f521398-f031-4091-b4a2-64a7ffb68498`; **rollback to
  `c777f343-d504-4135-94ed-1a28345170e4`**. `study_requests` created by running migration 0023
  directly — initializeDatabase did not run on the first requests.
- Verified locally: 672 backend + 128 frontend vitest, both tsc, build, new Playwright spec
  `e2e/schedule-quiz.spec.ts` (2/2). Not verified: a real Gemini answer (no key).

## Admin cockpit (3 Nov 2026) — LIVE (`0b37c08`)

- `/admin/cockpit`: dark mission-control page, GO/NO-GO poll over health/ready/flags/metrics/series/edge.
  Code in `src/pages/admin/cockpit/` (`stations.ts` holds the rules, with a test). No new routes.
- Feed is budgeted: 20 s / 60 s / 5 min tiers, paused while the tab is hidden, standby after 30 min.
  It deletes its own keys from `api.ts`'s 30 s GET cache each tick, or polls would return stale answers.
- Worker `/api/health` now counts Gemini keys (`ai_configured`, new `ai_keys` counts). Worker version
  `8ccfccdf-7945-477a-9a2d-60d4f12af1c7`; **rollback to `9f521398-f031-4091-b4a2-64a7ffb68498`**.
  Deployed from HEAD; the uncommitted one-line CORS fix in `ai.ts` was NOT in that deploy.
- Verified on production: `/api/health` 200, new bundle holds the cockpit chunk. Not verified: the
  page itself signed in as admin (needs a real Google sign-in).
- `useAction` (kit.tsx) set its live flag only in cleanup, so dev StrictMode left `busy` stuck on. Fixed.

## Tool rewrite + speed (2 Nov 2026) — LIVE (`c841225` worker, `f198a7b` app)

- Demo screens (Practice, Progress, Tutors, Session, AI, Customize, Mobile, onboarding, guest mode,
  all Stoikiometri sample data) moved to `archive/demo-2026-11/` (outside `src/`, never built).
  App is now Home / Discover / My notes / New note / Profile. Feature notes: `docs/FEATURES-2026-11.md`.
- Worker: `GET /api/notes/top?limit=&subject=` (list rows, replaces a 12-request fan-out),
  `GET /api/notes/:id/view` (own or visible note), leaderboard drops base64 photos (490 KB → ~10 KB),
  maintenance KV read cached 60 s. Vercel: `/assets` and `/fonts` cached immutable for a year.
- Verified: 128 vitest, selfcheck, lint 0 errors, 12/12 Playwright against local wrangler + D1.
- Worker version `497df613-74e7-49b9-a245-a2379c5b3f17`; **rollback to
  `6cbb70f7-ce19-44c1-b49a-00148d05a85c`**. Leaderboard live at 8.3 KB; new routes 401 unsigned.
- **Frontend deploys on `git push origin main`** (Vercel's GitHub hook on machtumens/Notarium).
  This machine's Vercel CLI (animamonology / AlephOne) cannot see `notarium-site`. Worker first.
- NOT verified on production: any signed-in screen (needs a real Google sign-in).

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

- A guest/demo mode with sample data — archived 2 Nov; every screen must have the worker behind it.

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
- Chase the 442 lint warnings or UI findings F3–F6 — none block anything.
  (8 Sep; the 876 KB three-vendor chunk it also listed is gone, three.js left
  with the old frontend in `025d9cd`.)

Carried from the retired `notarium-v2` repo (28 Oct), still binding on `src/`:

- A shadcn HSL variable layer — token names map straight onto the ramp in
  `tailwind.config.js` instead. (15 Sep)
- The prototype's view switcher / theme strip for signed-in accounts —
  design-tool chrome, not product. (owner, 15 Sep)
- Showing design-only data (tutors, mastery, practice, AI chat) to accounts
  behind a "preview" label — hidden via `DemoOnly` instead. (owner, 15 + 20 Sep)
- Reading a note body `content`-first — the body is `extracted_text` (what the
  upload form writes and what search scores); `content` defaults to the
  description. See `noteText()`. (20 Sep)

## Next

1. Gemini keys: `wrangler secret list` (3 Nov) shows GEMINI_API_KEY and \_2 ARE set, yet quizzes were
   reported dead. Not yet known why — llm.ts used to return DeepSeek's "no credit" error and hide the
   Gemini one. Fixed in the working tree (uncommitted, not deployed): first failure now wins, and the
   quiz page has "Quiz me in Gemini" (`prompt_only` on POST /api/ai/quiz, no key needed).
2. Run one quiz from a real login; check the questions come back in Bahasa Indonesia.
3. Approve the first tutors on `/admin` → People → Tutor applications.

## Landmines

- `npm run lint` at the root is 0 errors / ~455 warnings (checked 28 Oct, clean
  checkout). The old "325 errors" note was the gitignored `.claude/worktrees/`
  tsconfig being picked up — it does not reproduce in a fresh clone.
- `npm run migrate` only runs migrations 0001–0003 of 21. Nothing uses it.
  Delete it so nobody trusts it.
- Two `wrangler.toml` files. The root one lacks KV and Durable Object
  bindings. Always deploy from `backend/`.
- `deploy.yml` goes red on every push (R2 step). Do not read the badge as a
  failed deploy; delete those two lines or enable R2.
- Signup is NO LONGER domain-locked — any Google account may hold one
  (`211f75c`, `a6c169a`). The domain string survives only in
  `backend/src/routes/__tests__/oauth-identity.test.ts` fixtures. Corrected
  28 Oct; the old claim had gone stale.
- `react-hooks/set-state-in-effect` is set to `warn` in `eslint.config.js`,
  over 4 load-on-mount fetch sites the client predates. Deliberate, not a
  statement that the rule is wrong.
- Playwright (`npm run e2e`, 16 specs) starts its own `wrangler dev` off
  `backend/`. On Windows, a long checkout path blows MAX_PATH, every D1 query
  throws, and the only symptom is `/api/health` 503ing until the 120 s
  webServer timeout. Keep the checkout path short, or set
  `git config core.longpaths true`.
- D1 rejects statements over ~100 KB. `wrangler d1 export` output does not
  round-trip through `d1 execute --file` — notes carry base64 images inline.
  To restore from a backup, split it row-per-INSERT and clip or skip the
  oversized rows (see the resplit approach used for the rehearsal).
- Go-live runbook: https://claude.ai/code/artifact/22712451-8489-44eb-a156-80b65f75092c
