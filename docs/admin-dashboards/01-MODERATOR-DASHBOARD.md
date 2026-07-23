# Moderator Dashboard (non-technical admin)

> Role: `moderator` (and `admin` superuser). Gate: `requireModerator`.
> Depends on **00-FOUNDATION**.
> Goal: "control basically anything within Notarium" — content and people, no ops/infra.

## What already exists (reuse, don't rebuild)

`src/pages/AdminPage.tsx` (2162 lines) already has tabs: **Users · Classes · Notifications · Usage**, backed by `backend/src/routes/admin.ts`:

- Users: `getAllUsers`, `suspendUser`, `unsuspendUser`, `warnUser`, `removeUser`
- Notes: `getAllNotes`, `deleteNote`, `updateNote`, `adminUpvoteNote`, `adminLikeNote` (+ `AdminNoteEditModal.tsx`)
- Grade classes: CRUD + reassign
- Notifications: broadcast create/list/delete
- Usage: `getUsageStatistics` + `AdminUsageReport.tsx`
- Activity log: `getAdminActivityLog`

**Plan = rename this to the Moderator Dashboard, re-gate to `requireModerator`, and fill the gaps below.** Do NOT duplicate it for the technical dashboard.

## Re-gating (00-FOUNDATION step)

Swap `requireAdmin` → `requireModerator` in `admin.ts` for all of: users, notes, grade-classes, notifications, activity-log, usage-stats read. (Technical dashboard's ops endpoints are separate — see 02.)

## Gaps to add for "control basically anything"

### Content

- **Notes moderation queue** — a dedicated view filtered to recently uploaded / flagged / most-reported notes, with inline approve / delete / edit / feature. Backend: extend `getAllNotes` with `?sort=&status=&subject=&q=` filters (mostly SQL).
- **Restore soft-deleted notes** — `notes.deleted_at` exists; add `POST /api/admin/notes/:id/restore` (sets `deleted_at = NULL`). **[DECIDE]** include a "purge permanently" action here, or leave hard-delete to the Technical danger-zone. Default: restore here, hard-purge in Technical.
- **Subjects CRUD** — `subjects` table has no admin UI yet. Add create/rename/change-icon/delete + `note_count` recompute. New endpoints `/api/admin/subjects` (GET/POST/PUT/DELETE).
- **Feature / pin a note** — **[DECIDE]** needs a `notes.featured` column (new migration) if you want it. Default: include (small migration, high moderator value).

### People

- **Edit user** — beyond suspend/warn: change `display_name`, `class`, `role` (moderator can promote student→? **[DECIDE]** — recommend moderators canNOT grant `technical`/`admin`; only `admin` can), adjust `diamonds` / points, reset avatar. One `PUT /api/admin/user/:id`.
- **Bulk actions** — multi-select users/notes for suspend / delete. Frontend-only over existing endpoints (loop) or a batch endpoint. Default: client loop first (lazy), batch endpoint later if slow.
- **User detail drawer** — one user's notes, activity, warnings, suspension history in a side panel. Pure reads.

### Communication

- **Broadcast / announcements** — exists (notifications). Add targeting **[DECIDE]** (all / by class / single user). Default: keep all-users for v1, add targeting later.
- **Warning templates** — canned warning messages so moderators don't retype. Small KV or a `warning_templates` table. **[DECIDE]** nice-to-have; default defer.

### Visibility (read-only, so moderators self-serve)

- **Moderation summary cards** at top: pending queue size, active suspensions, active warnings, notes/day, new users/day. All from existing tables — reuses Technical's Tier-A queries but scoped to moderation.

## Backend surface (new/changed)

```
PUT    /api/admin/user/:id               edit profile/class/role/points   (requireModerator)
POST   /api/admin/notes/:id/restore      un-delete                        (requireModerator)
GET    /api/admin/notes?filters          moderation queue                 (requireModerator)
GET/POST/PUT/DELETE /api/admin/subjects  subjects CRUD                    (requireModerator)
(optional) notes.featured migration + POST /api/admin/notes/:id/feature
```

## Frontend

- Rename/relabel `AdminPage.tsx` → Moderator Dashboard; keep at `/admin`.
- Add tabs: **Moderation Queue**, **Subjects**. Extend **Users** tab with edit + bulk + detail drawer.
- Top summary cards.
- Hide anything ops/infra (no maintenance, no monitors) — that lives in `/ops`.

## Security

- `role` edits: moderators limited to non-privileged roles; privilege escalation blocked server-side.
- All mutations logged to `admin_activity_log`.
- Reuse existing Zod validation (`backend/src/lib/validation.ts`).

## Effort

Medium. Most backend exists; work is ~3 new endpoints + subjects CRUD + optional `featured` migration + frontend tab additions.

## Open decisions to edit

1. Purge-permanently here vs Technical-only. (default: Technical-only)
2. Add `notes.featured` (default: yes) — needs a migration.
3. Can moderators change roles / grant privilege? (default: no privilege grants)
4. Announcement targeting now vs later. (default: later)
5. Bulk actions: client loop vs batch endpoint. (default: client loop first)
