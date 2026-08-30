---
name: report:ui-ux-discrepancies
description: 'Measured UI/UX inconsistencies across Notarium after the Frosted Canopy reskin — broken nav, stale labels, palette drift, unused design system.'
date: 27-08-26
metadata:
  node_type: memory
  type: report
  feature: design-system
---

# UI/UX Discrepancies — Notarium

**Audited 2026-08-27**, at git HEAD `e4edbca` plus the uncommitted Frosted Canopy
reskin and 3D screen integration. Every figure below is measured from the source
tree or the running app, not estimated.

## TL;DR

Six real problems. One was a **broken navigation** that silently sent users to
the wrong page — **F1 is fixed as of 27-08-26**. The remaining five are
consistency debt.

| #   | Finding                                                 | Severity           | Effort |
| --- | ------------------------------------------------------- | ------------------ | ------ |
| F1  | ~~`/my-notes` nav is broken — every tab goes to `/`~~   | **FIXED 27-08-26** | S      |
| F2  | ~~Renames from Phase 3/4 never reached the UI strings~~ | **FIXED 27-08-26** | S      |
| F3  | 88 distinct hex colours against a 9-colour palette      | MEDIUM             | M      |
| F4  | The design system exists but is half-unused             | MEDIUM             | M      |
| F5  | No type or radius scale — 21 font sizes, 13 radii       | LOW                | M      |
| F6  | Two parallel navigation implementations                 | LOW                | L      |

---

## F1 — `/my-notes` navigation is broken (HIGH) — **FIXED 27-08-26**

`src/pages/my-notes/MyNotesNav.tsx:139-153` — the desktop nav on the My Notes page
offers three tabs, and **all three call `navigate('/')`**:

```js
const pages = ['subjects', 'chat', 'leaderboard'];
if (index < pages.length) {
  navigate('/'); // every tab lands on Today
}
```

The `pages` array is dead — only its `.length` is read. Clicking "Subjects",
"Chat" or "Leaderboard" all silently dump the user on the Today dashboard.

Worse, one of those tabs is **"Chat", a feature deleted in Paperloop Phase 4**.
`backend/test/red-team/chat-removed.test.ts` asserts `/api/chat/*` returns 404 —
the backend is correctly gone, but the UI still advertises it. `MobileMenu.tsx`
carries the same three stale entries at lines 153, 180 and 207.

This was previously logged as a cosmetic known-gap ("confirmed inert, navigate to
`/`"). That assessment was too generous: a nav that offers three destinations and
delivers one is a navigation bug, and the Chat entry offers a feature that no
longer exists at all.

**Fix applied 27-08-26.** Both files now derive their entries from a single
array that carries label, icon and destination together, so a label can no longer
drift away from where it goes:

- `MyNotesNav.tsx` — one `navItems` array feeds both the rendered `tabs` and the
  `onChange` handler (`navItems[index]?.action?.()`). The parallel `pages` array
  and all index arithmetic are gone.
- `MobileMenu.tsx` — four near-identical 25-line buttons collapsed to one mapped
  list (file: 336 → 270 lines).
- Chat removed from both; `MessageSquare` import dropped.
- Subjects → **Community** → `/community`; Leaderboard → **Progress** → `/progress`.
- **A second bug fixed in passing:** `pages.push('admin')` meant the Admin tab
  also fell into the `index < pages.length` branch, so admins never reached
  `/admin` either. Both files now route it correctly.
- Stale pre-reskin `/notarium-logo.jpg` (3 refs, only in these two files) swapped
  for `/wordmark-pine.png`, matching `AppShell`.

Verified in-browser on desktop and at 375px: tab 0 → `/community`, tab 1 →
`/progress`, no Chat entry, pine wordmark rendering.

F6 still stands — this page has no structural reason to own a second nav, and
consolidating it into `AppShell` remains the real fix.

## F2 — Phase 3/4 renames never reached the UI (MEDIUM) — **FIXED 27-08-26**

The product was deliberately renamed — Subjects→Community, Leaderboard→Progress —
and the routes and the main nav were updated. The strings were not:

- `"Subjects"` appears in **19 files**, `"Community"` in **5**.
- `"Leaderboard"` appears in **10 files**, `"Progress"` in **6**.

Live examples: `my-notes/MyNotesNav.tsx:131` ("Subjects"), `:133` ("Leaderboard"),
`MobileMenu.tsx:153,207`. `admin/AdminTabs.tsx:13` also says "Subjects", which may
be legitimate — admin manages the `subjects` table, and the entity really is
called a subject. **The rename applies to the student-facing browse surface, not
to the data model.** Worth deciding explicitly rather than sweeping blindly.

Phase 3's own closeout already flagged the related `ProfileStats.tsx` "Rank" label
as an accepted gap. This is the same drift, unresolved and wider.

**Fix applied 27-08-26 — and it was much smaller than the file counts implied.**
The 19-vs-5 ratio counted code identifiers (`SubjectsPage`, `getSubjects`,
`subject_id`, the `Subject` type, `/api/subjects`), which are correct and must not
change. Auditing for _user-visible_ strings instead found only two, plus two
cases that turned out not to be drift at all:

| Site                                          | Verdict                                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SubjectNotesPage.tsx:227` "Back to Subjects" | **Renamed** → "Back to Community"                                                                                                                                                                                                    |
| `ProfileStats.tsx` "Rank" badge               | **Renamed** → "Learning Rank" — closes Phase 3's own noted follow-up                                                                                                                                                                 |
| `MyNotesNav` / `MobileMenu` labels            | Already fixed under F1                                                                                                                                                                                                               |
| `admin/AdminTabs.tsx:13` "Subjects"           | **Kept.** Admin manages the `subjects` table; the entity really is a subject.                                                                                                                                                        |
| `AdminUsageReport` "Top Contributors"         | **Kept — verified correct.** `backend/src/routes/admin.ts:103` ranks it by `notes_uploaded`/`total_likes`/`total_admin_upvotes`, so it genuinely measures contribution, not learning. Renaming it would have made the label _wrong_. |
| `ShellPageRoutes.tsx` comments                | Updated to name both surfaces.                                                                                                                                                                                                       |

"Leaderboard" had **zero** user-visible occurrences — every hit was an identifier.

The lesson for the remaining findings: a raw `grep` count is a starting point, not
a work-list. Two of the six sites here would have been actively damaged by a
blind sweep.

## F3 — Palette drift: 88 colours against a 9-colour system (MEDIUM)

Frosted Canopy defines nine palette entries (Mist, Frost, Ink, Ink-soft, Pine,
Moss, Juniper, Honey, Clay). The source contains **88 distinct hex values across
511 occurrences**.

Off-system survivors, all pre-dating the reskin:

| Colour               | Uses | Where                                     | Should be   |
| -------------------- | ---- | ----------------------------------------- | ----------- |
| `#8b5cf6` violet     | 20   | OpsDashboard, UserDetailModal, MyNotesNav | Pine / Moss |
| `#fca5a5` red-300    | 24   | admin NotesTab, AdminPage                 | Clay        |
| `#86efac` green-300  | 14   | admin NotesTab, AdminPage                 | Moss        |
| `#fbbf24` amber-400  | 8    | AdminUsageReport, WarnUserModal           | Honey       |
| `#f97316` orange-500 | 6    | TodayPage, LeaderboardPage                | Honey       |
| `#60a5fa` blue-400   | 3    | admin tabs                                | Juniper     |

These are Tailwind defaults and old-theme leftovers. They cluster in the **admin
and ops surfaces**, which the reskin's sweep did not reach because they had no
hardcoded _dark_ classes to catch — they were already using mid-tone Tailwind
colours that survive on a light ground without looking obviously broken. They are
not broken, just off-brand.

Note the reskin also added drift of its own: `#1c2a22` appears **185 times** as a
literal instead of `darkTheme.colors.textPrimary`. That was a deliberate trade
during a bulk sweep — mechanical, verifiable replacements — but it is debt, and it
is the same debt this finding is about.

## F4 — The design system exists but is half-unused (MEDIUM)

`src/theme.ts` exports the full Frosted Canopy action set. Adoption is uneven:

| Export                                        | Files using it |
| --------------------------------------------- | -------------- |
| `cardStyle`                                   | 13             |
| `inputStyle`                                  | 10             |
| `buttonPrimaryStyle` / `buttonSecondaryStyle` | 7 each         |
| `modalContentStyle`                           | 6              |
| `chromeStyle`                                 | **0**          |
| `buttonQuietStyle`                            | **0**          |
| `buttonHoneyStyle`                            | **0**          |
| `chipStyle`                                   | **0**          |

Four exports have zero consumers. Meanwhile the panel-glass recipe
`blur(26px) saturate(1.3)` is **hand-written in 6 places** — including
`CampusPage.tsx` and `LibraryMapPage.tsx`, which I wrote during this integration
and which should have imported `cardStyle` instead. That is my drift, and it is
the clearest illustration of the problem: a system that is easier to retype than
to import will keep being retyped.

**Fix:** make the glass a single import, delete the four unused exports or adopt
them, and treat "did you import the token" as a review checkpoint.

## F5 — No type or radius scale (LOW)

- **21 distinct font sizes** in inline styles. The top three (14/13/12px) cover
  405 of ~640 uses, so a scale is already implicit — it is just not named.
- **13 distinct border radii**: `50%`, 12, 6, 8, 16, 9999, 4, 20, 24, 10, 26, 13px,
  and one `4px 4px 0 0`. The brief specifies **16px panels and 999px pills**;
  `12px` (33 uses) and `8px` (24 uses) are the most common values and match
  neither.
- **Button heights**: 32, 36, 38, 40, 44, 48px all in use. The brief's pill is
  38px. Only 2 elements use it.

`theme.borderRadius` already defines `sm/md/lg/xl/full`. It is bypassed in most
places.

## F6 — Two parallel navigation implementations (LOW)

`AppShell` (used by every route inside the shell layout) and `MyNotesNav` +
`MobileMenu` (used only by `/my-notes`) are separate implementations of the same
navigation. They have already diverged: the AppShell nav has Today, Campus,
Community, Progress, Tests, Review and routes correctly; MyNotesNav has Subjects,
Chat, Leaderboard and routes to `/` for all of them.

F1 and F2 are downstream symptoms of this duplication. Fixing the strings without
removing the duplication buys time, not a solution — `/my-notes` is a shell page
and has no structural reason to own a second nav.

**Note the trap:** `AppShell`'s `ExpandableTabs` routes by **array index**. The
`tabs` array and the `paths` array are positionally coupled, and editing one
without the other misroutes every tab after the insertion point. Any consolidation
should replace that with explicit `{ title, path }` objects.

---

## Recommended order

1. ~~**F1**~~ — **done 27-08-26.**
2. **F2** — decide student-facing vs data-model naming, then sweep.
3. **F4** — collapse the glass recipe to one import; it makes F3 cheaper.
4. **F3** — map the six off-palette colours onto the system, admin surfaces first.
5. **F5** — name the scale; enforce on new code rather than retrofitting.
6. **F6** — consolidate the navs, replacing index-routing with explicit paths.

## What is NOT wrong

Recorded so a future audit does not re-flag them:

- **Contrast passes.** 76 text elements across 8 authed routes measured at zero
  WCAG AA failures; Ink-on-Mist is 13.94:1 (AAA), white-on-Pine 5.03:1.
- **The `.dark` "forest night" block in `index.css` is unused on purpose.** It is
  the brief's option 2i, wired and ready; nothing sets `class="dark"` yet.
- **The constellation's layout is intentionally non-semantic.** The brief wants
  distance to mean shared concepts; there is no concept graph, and the page says
  so in visible copy rather than faking a similarity score.
- **`LoadingSpinner` is used consistently** — 31 usages, with only 4 raw
  "Loading..." strings left.
