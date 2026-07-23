# Google OAuth Setup

One-time steps to wire up Google OAuth for Notarium. Run these manually; no automated script needed.

---

## 1. Google Cloud Console

### 1a. Create or select a project

Go to https://console.cloud.google.com/ and create a new project (e.g. **Notarium**) or select an existing one.

### 1b. Enable APIs

In **APIs & Services → Library**, enable all four:

- Google People API
- Google Classroom API
- Google Drive API
- Google Docs API

### 1c. OAuth consent screen

**APIs & Services → OAuth consent screen**

| Field                | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| User type            | External (switch to Internal once you have a Workspace org) |
| App name             | Notarium                                                    |
| Support email        | your email                                                  |
| Developer contact    | your email                                                  |
| Homepage URL         | `https://notarium-site.vercel.app` (placeholder OK in dev)  |
| Privacy policy URL   | same domain `/privacy` (placeholder OK)                     |
| Terms of service URL | same domain `/terms` (placeholder OK)                       |

**Scopes** — add these exact strings:

```
openid
email
profile
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.students
https://www.googleapis.com/auth/classroom.rosters.readonly
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/documents
```

**Test users** — while in External/testing mode, add up to 100 school email addresses that should be able to log in. Users not on this list will see an error.

### 1d. Create OAuth credentials

**APIs & Services → Credentials → Create credentials → OAuth client ID**

- Application type: **Web application**
- Name: `Notarium Web`
- **Authorised redirect URIs** — add both:
  - `http://localhost:8787/auth/google/callback` (local dev)
  - `https://notarium-backend.notarium-backend.workers.dev/auth/google/callback` (prod worker)

Save and copy **Client ID** and **Client Secret**.

---

## 2. Generate `OAUTH_TOKEN_AES_KEY`

Run this locally to generate a random 32-byte base64 key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output — you'll need it in the next step.

---

## 3. Provision Wrangler secrets

```bash
cd backend
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put OAUTH_REDIRECT_URI       # https://notarium-backend.notarium-backend.workers.dev/auth/google/callback
npx wrangler secret put OAUTH_TOKEN_AES_KEY      # paste the base64 value from step 2
```

For a named production environment add `--env production` to each command.

---

## 4. Local dev (`.dev.vars`)

`wrangler dev` reads `backend/.dev.vars` automatically. Create the file:

```
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>
OAUTH_REDIRECT_URI=http://localhost:8787/auth/google/callback
OAUTH_TOKEN_AES_KEY=<base64 from step 2>
```

> **`.dev.vars` is in `.gitignore` — never commit it.**

---

## 5. Frontend env

In your Vite project root, add to `.env.local`:

```
VITE_FEATURE_GOOGLE_OAUTH=true
```

The flag is `false` by default in `.env.example` so the card is hidden until OAuth is fully verified.

---

## 6. Verification checklist

- [ ] `npx wrangler dev` starts with no missing-secret warnings.
- [ ] `http://localhost:8787/auth/google/start?intent=signup` in a browser shows Google's consent screen.
- [ ] Approving consent redirects back to `http://localhost:5173/settings?google=ok` and shows the "Connected" toast.
- [ ] `POST /auth/google/disconnect` removes the `oauth_tokens` row (check D1 local via `wrangler d1 execute notarium-db-local --local --command "SELECT * FROM oauth_tokens"`).
- [ ] Replaying a used `state` value returns an error redirect (replay-attack protection works).

---

## 7. Production checklist (after Google app verification)

- In the Google Console consent screen, click **Publish app** to move out of testing.
- Add your custom domain (if any) to **Authorised JavaScript origins** and **Authorised redirect URIs**.
- Re-run `npx wrangler secret put` for each secret against prod if values differ.
- Set `VITE_FEATURE_GOOGLE_OAUTH=true` in your prod build pipeline (Vercel environment variable or CI secret).
