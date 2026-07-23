# Admin Dashboards — Foundation (shared prerequisite)

> Both the Moderator and Technical dashboards depend on this. Build this first.
> Everything marked **[DECIDE]** is a choice for you to edit before we implement.

## Goal

Split today's single all-powerful `admin` role into two real, separate accounts:

| Account       | Role        | Who                  | Can do                                                         |
| ------------- | ----------- | -------------------- | -------------------------------------------------------------- |
| **Moderator** | `moderator` | non-technical admins | control content & users — "basically anything within Notarium" |
| **Technical** | `technical` | technical admins     | monitoring, "candle watching", site maintenance                |

`admin` (existing) stays as a **superuser** that can access both — nothing breaks.

## Current state (facts, not assumptions)

- `role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin'))` on a `STRICT` table (`backend/schema.sql`).
- One gate everywhere: `requireAdmin()` → `role === 'admin'` (`backend/src/lib/auth.ts:74`).
- Login is a **shared password**, not per-user: `POST /api/auth/admin-login` matches `env.ADMIN_PASSWORD` and provisions one `admin@notarium.internal` row (`backend/src/index.ts:149`).
- Frontend gate: `AdminRoute` + `user.role === 'admin'` checks (`src/App.tsx:102`, `:328`, `:966`, `:1156`).
- JWT payload carries `{ id, email, role }` (`auth.ts:createToken`).

## 1. Role model change

### DB migration — `backend/migrations/0013_admin_roles.sql`

SQLite/STRICT can't alter a `CHECK` in place → table-rebuild migration:

1. `CREATE TABLE users_new (...)` identical but `CHECK(role IN ('student','moderator','technical','admin'))`.
2. `INSERT INTO users_new SELECT * FROM users;`
3. Drop old, rename new, recreate the indexes from `schema.sql`.
4. Update `backend/schema.sql` to match (source of truth).

**[DECIDE] Keep the DB-level CHECK** (recommended — validation at the trust boundary) **or** drop the CHECK and validate roles only in app code with Zod (less migration risk, weaker guarantee). Default: keep it.

### Auth helper — `backend/src/lib/auth.ts`

Add one generic gate; keep `requireAdmin` as an alias so nothing breaks:

```ts
export async function requireRole(request, env, allowed: string[]) {
  // ...decode token as today...
  if (decoded.role === 'admin') return decoded; // superuser passes everything
  if (!allowed.includes(decoded.role)) return jsonResponse({ error: 'Forbidden' }, 403, env);
  return decoded;
}
// requireAdmin  = requireRole(req, env, ['admin'])
// requireModerator = requireRole(req, env, ['moderator','admin'])
// requireTechnical = requireRole(req, env, ['technical','admin'])
```

Then swap each admin route to the right gate (Moderator plan / Technical plan list which).

## 2. The two accounts

**[DECIDE] Auth mechanism** — two options, pick one:

- **Option A — extend the existing token login (recommended, least code).**
  Add `MODERATOR_PASSWORD` and `TECH_PASSWORD` secrets. `POST /api/auth/admin-login` takes `{ token, as?: 'moderator'|'technical'|'admin' }`, matches the corresponding secret, and auto-provisions `moderator@notarium.internal` / `tech@notarium.internal` with the right role — identical to how `admin@notarium.internal` works today. Two real account rows, reuses the whole existing flow.
- **Option B — real per-account logins.** Seed two `users` rows with `email` + bcrypt `password_hash` + role, log in through the normal `/api/auth/login`. More "account-like", but you manage real credentials and a seeding step.

Default: **A**. It matches the architecture that already exists and is a ~30-line change.

**[DECIDE] Env/secrets to add:** `MODERATOR_PASSWORD`, `TECH_PASSWORD` (via `wrangler secret put`), added to `backend/src/lib/env.ts` `Env`. Rotate independently of `ADMIN_PASSWORD`.

## 3. Frontend gating

- `src/App.tsx`: replace the three `role === 'admin'` checks with a helper `canModerate(user)` / `canOps(user)` (`admin` passes both). Route `/admin` → moderator dashboard, add `/ops` → technical dashboard.
- Login page: **[DECIDE]** one shared `/admin-login` with a role picker, or two URLs (`/admin-login`, `/ops-login`). Default: one page, role inferred from which password matches.

## 4. Security notes (non-negotiable)

- Every new endpoint gated server-side by `requireRole` — never trust the frontend role.
- Log every privileged action to `admin_activity_log` (already exists) with the acting role.
- Technical-only actions (maintenance mode, migrations, purges) are **`technical`/`admin` only** — moderators must get 403.
- Keep rate-limiting on all three login variants (already applied to admin-login).

## Effort

Small–medium. Migration + auth helper + login extension + frontend gate helper. ~1 focused session. This unblocks both dashboards.

## Open decisions to edit

1. Keep DB CHECK vs app-only role validation.
2. Auth mechanism A (token, recommended) vs B (real accounts).
3. One login page w/ role picker vs two pages.
4. Role names — `moderator` / `technical` as written, or your preferred labels.
