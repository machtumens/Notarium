# Firebase Auth Migration — PLAN

**Date:** 24-07-26
**Slug:** firebase-auth-migration
**Type:** Phase program (5 phases) — stack shift, auth tier only
**Status:** Phase 1 in progress

---

## Program Goal Charter

**North star:** Replace Notarium's hand-rolled auth (bcrypt + HS256 JWT + `refresh_tokens` + custom Google OAuth + app-layer TOTP) with **Firebase Authentication (Identity Platform / GCIP)**. Keep Cloudflare Workers + D1 + all app data as-is.

**Definition of done:** All logins issue Firebase ID tokens; the Workers API verifies them; legacy JWT path and bcrypt/refresh-token/custom-OAuth/TOTP code are deleted; existing users migrated with passwords intact; adding a new OAuth provider is config-only.

**"Verified" means:** a real login (email + Google) round-trips through Firebase → Workers → D1 and returns the correct local user, with role/admin_role honored, on production.

**Scope tiers → phases:** see Phases below.

**Out of scope (now):** Firestore, Cloud Functions, Firebase Hosting. This migration is deliberately auth-only. The DB/functions tiers are a _future_ program, unlocked only if D1/Workers limits force it (motivation flagged: Cloudflare limits + simplify ops).

**Hard safety constraints:**

- Never break existing sessions during the transition → dual-verify window (Phase 1) before any frontend cutover.
- Email-based account linking ONLY when `email_verified === true` (prevents account hijack via unverified Firebase signup).
- Keep `password_hash` / `refresh_token_enc` columns until Phase 4 soak completes (rollback path).

---

## Locked decisions

| Decision                | Choice                                                    | Consequence                                                                              |
| ----------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Firebase scope          | **Auth only**                                             | D1 stays relational; Workers stays the API                                               |
| 2FA                     | **Identity Platform (GCIP) native TOTP MFA**              | Paid per-MAU tier; users re-enroll authenticator; delete `twofa.ts`/`totp.ts` at Phase 4 |
| Token verify on Workers | **`jose` + Google JWKS (RS256)**                          | No Firebase Admin SDK (won't run on Workers)                                             |
| Role/claims source      | **D1 `users` row** (not custom claims)                    | Firebase token → local lookup by `firebase_uid`; avoids Admin REST for the hot path      |
| Existing users          | **`firebase auth:import --hash-algo=BCRYPT --rounds=10`** | Passwords migrate; no forced reset                                                       |

---

## Architecture: the two choke points

- **Backend verify:** `backend/src/lib/auth.ts` — every route authenticates through `getUserIdFromToken` / `getUserFromToken` / `requireAdmin` / `requireRole`. Swap verification here → whole API migrates.
- **Frontend issue:** `src/app/AuthProvider.tsx` + `src/lib/api.ts` — swap login/register/OAuth to Firebase JS SDK; attach `await user.getIdToken()` as Bearer.

Token mismatch to bridge: legacy = **HS256** (symmetric `JWT_SECRET`); Firebase = **RS256** (Google keys). Dual-verify accepts both during transition.

---

## Phases

### Phase 1 — Backend dual-verify (IN PROGRESS) — keystone, zero user-facing change

- [x] `env.ts`: add `FIREBASE_PROJECT_ID`
- [x] `db.ts` + migration `0015`: add `firebase_uid TEXT` + unique index
- [x] `auth.ts`: `verifyFirebaseToken` (RS256/JWKS) + `resolveIdentity` (Firebase → legacy fallback); JIT-link by verified email, JIT-provision new
- [ ] Test: identity-resolution decision logic (verified-email link gate, uid match, legacy fallback)
- [ ] Set `FIREBASE_PROJECT_ID` via `wrangler secret`/var; deploy

### Phase 2 — Frontend swap (new logins → Firebase)

- Add `firebase/auth`; `AuthProvider` uses `signInWithEmailAndPassword` / `createUserWithEmailAndPassword` / `signInWithPopup(GoogleProvider)`.
- `api.ts` attaches Firebase ID token. Legacy sessions still valid (Phase 1 dual-verify).
- Optional `/auth/firebase-sync` endpoint to enrich profile (display_name/class) on first Firebase login.

### Phase 3 — Bulk-import existing users

- Export D1 users → `firebase auth:import users.json --hash-algo=BCRYPT --rounds=10`.
- Google users match by email. Communicate TOTP re-enrollment (GCIP MFA is a fresh enrollment).

### Phase 4 — Cutover + delete

- Remove legacy HS256 path, `bcryptjs`, `refresh_tokens` table, `services/google-oauth.ts`, `oauth.ts`, `twofa.ts`, `totp.ts`, and dead columns.
- Admin user ops (`admin.ts` suspend/warn/delete): move to Firebase Admin **REST** (mint SA access token via `jose`) — only leg that needs Admin API.

### Phase 5 — "Change up the OAuth" (payoff)

- Add providers by config + one SDK line: Apple, GitHub, Microsoft. This is the flexibility goal, now trivial.

---

## Validate Contract (Phase 1)

**generated-by:** outer-pvl
**date:** 2026-07-24

**Gate: CONDITIONAL** — code slice landed; deploy + test gates pending (require Firebase project + `FIREBASE_PROJECT_ID`).

- **V — Build:** `cd backend && npm run build` (tsc clean)
- **V — Test:** `cd backend && npx vitest run src/lib/__tests__/firebase-auth.test.ts` (to be written)
- **V — Behavior:** legacy HS256 token still authenticates (dual-verify); a valid Firebase ID token resolves to the linked D1 user; unverified-email Firebase token does NOT link to an existing account.
- **Rollback:** revert `auth.ts` change; `firebase_uid` column is additive/nullable — harmless if unused.

**Known gaps (accepted):** live Firebase token round-trip untestable until a Firebase project exists (Phase 0 console setup). Unit test covers the resolution branching with mocked verify.

---

## Watch-items

- `email_verified` gate on email-linking (security — enforced in code).
- Legacy-token path does a wasted Firebase-verify attempt first; acceptable, deleted Phase 4.
- Admin REST token minting deferred to Phase 4 (not hot path).
- GCIP is billable — confirm project on Identity Platform (Blaze) before Phase 3.
