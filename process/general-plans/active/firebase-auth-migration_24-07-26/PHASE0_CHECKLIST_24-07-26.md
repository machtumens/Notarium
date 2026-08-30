# Phase 0 — Firebase Project Setup Checklist

**Goal:** stand up a Firebase project on Identity Platform (Blaze), enable the providers we use, and wire `FIREBASE_PROJECT_ID` into the Worker so Phase 1's dual-verify goes live. Console-only; no code.

**Console:** https://console.firebase.google.com

---

## 1. Create the project

- [ ] Firebase console → **Add project** → name it (e.g. `notarium-prod`). Note the **Project ID** (not the display name) — this is the `aud`/`iss` value the Worker verifies against.
- [ ] Analytics: skip (not needed for auth).

## 2. Upgrade to Blaze + Identity Platform (required for native TOTP MFA)

- [ ] Console → gear → **Usage and billing** → **Modify plan** → **Blaze** (attach a billing account).
- [ ] Enable **Identity Platform**: https://console.cloud.google.com/customer-identity → **Enable** (same GCP project). This is what unlocks native TOTP MFA — plain Firebase Auth does not have it.
  - ★ Blaze is pay-as-you-go; auth stays in the free MAU tier until you have real volume. GCIP MFA is the billed line item — confirmed before Phase 3 (bulk import), per plan Watch-items.

## 3. Enable sign-in providers

- [ ] **Authentication** → **Get started** → **Sign-in method**.
- [ ] Enable **Email/Password**.
- [ ] Enable **Google** → pick a support email. (Reuse the existing `GOOGLE_CLIENT_ID` OAuth consent screen if it's the same GCP project; otherwise Firebase auto-provisions one.)
- [ ] Later (Phase 5): Apple / GitHub / Microsoft — leave off for now.

## 4. Enable MFA (TOTP)

- [ ] **Authentication** → **Sign-in method** → scroll to **Advanced / SMS & TOTP MFA** → enable **Authenticator app (TOTP)**.
  - Existing users' TOTP secrets are NOT importable — they re-enroll on first login. This is the accepted 2FA consequence in the plan's locked-decisions table.

## 5. Register a Web app (gives the frontend config — needed Phase 2, harmless to do now)

- [ ] Console → **Project settings** → **Your apps** → **Web** (`</>`) → register. Copy the `firebaseConfig` object somewhere safe (apiKey, authDomain, projectId, …). Only needed for Phase 2's `firebase/auth` init.

## 6. Wire the backend (this is the one that flips Phase 1 on)

- [ ] Set the var for the Worker:
  ```
  cd Notariumm-main/backend
  npx wrangler secret put FIREBASE_PROJECT_ID   # paste the Project ID
  ```
  (or add `FIREBASE_PROJECT_ID = "..."` under `[vars]` in `wrangler.toml` — it's not a secret, just an id. Secret is fine too.)
- [ ] `npx wrangler deploy`
  - ★ Until `FIREBASE_PROJECT_ID` is set, `verifyFirebaseToken` returns `null` on the first line and every request falls through to the legacy HS256 path — zero behavior change. Setting it is the single switch that activates dual-verify in prod.

## 7. Smoke-test the round-trip

- [ ] In the Firebase console → Authentication → **Add user** (email/pass). Mint an ID token (quickest: the Firebase Auth REST `signInWithPassword` endpoint with the Web apiKey, or a 5-line Node script with the client SDK).
- [ ] Call any authed API route with `Authorization: Bearer <firebase-id-token>`. Expect: a new D1 `users` row JIT-provisioned (or linked by verified email), request succeeds.
- [ ] Confirm an existing **legacy** JWT still authenticates against the same deployed Worker (dual-verify intact).

---

## Done when

`FIREBASE_PROJECT_ID` is live on the deployed Worker, a Firebase ID token resolves to a D1 user, and a legacy token still works. That closes the second unchecked box in the plan's Phase 1 (`Set FIREBASE_PROJECT_ID … deploy`) and clears the CONDITIONAL gate's "live round-trip untestable" known gap.

## Not in this phase

Bulk user import (Phase 3), frontend SDK swap (Phase 2), deleting legacy code (Phase 4). Don't touch those yet.
