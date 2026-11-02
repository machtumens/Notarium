# STATE — Notarium

Updated: 2 Nov 2026 · Session: tool rewrite + speed

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
- Firebase auth is half-migrated and dormant (`FIREBASE_PROJECT_ID` unset); legacy HS256 serves all.
- Schema deploy path is `initializeDatabase()` in `backend/src/lib/db.ts`.
  Production has never had `wrangler d1 migrations apply`. `CREATE TABLE IF
NOT EXISTS` never repairs an existing table — that is why `users` needed a
  rebuild and why any future constraint change will too.
- Backups from today (full D1 exports, real student data) are in
  `backend/backups/` — gitignored, keep it that way.

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

## Worker deployed (28 Oct 2026, 15:27 UTC)

- `npx wrangler deploy` from `backend/` at `7769369`. **Version
  `4f2d22b1-ab7b-4a7a-b5d5-e991c54f2f04`; rollback to
  `81356472-b32e-4f9b-9345-b7aa847dea23`** (live before, 28 Oct 12:21 UTC).
- Shipped 14 backend commits (from ~`fce5092`): open sign-up, off-register classes stored,
  rotating refresh tokens.
- Verified after: health, ready, 401s on refresh/logout/admin/ops, CORS preflight 204.
- **NOT verified:** an admin sign-in reaching a moderator panel — pinned by the
  five C-bis tests, never watched against production. See Next #4.

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

1. Put a DeepSeek key from the topped-up account on the worker, then call
   `POST /api/ai/primer` once with a real login and confirm structured JSON.
2. Sign in with Google on notarium-site.vercel.app from a browser — the only
   part of that flow not yet exercised.
3. Walk the app as a student: upload a note (exercises Vision OCR), check a
   date reads "Today", book a tutor session.
4. Sign in on `/admin` and check a panel fills — live 28 Oct (`b15b3fd`),
   never exercised against production.

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
