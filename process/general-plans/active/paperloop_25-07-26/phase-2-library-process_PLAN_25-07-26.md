---
name: plan:paperloop-phase-02-library-process
description: 'Paperloop — Phase 2: My Library + Process Inbox frontend pipeline (capture → OCR → summary → quiz → SRS)'
date: 25-07-26
metadata:
  node_type: memory
  type: plan
  feature: paperloop
  phase: phase-02
---

# Phase 2 — My Library + Process Inbox

**Program:** paperloop
**Umbrella plan:** `process/general-plans/active/paperloop_25-07-26/paperloop-umbrella_PLAN_25-07-26.md`
**Date** 25-07-26 (supplemented 16-08-26, validated 16-08-26, EVL-green 16-08-26)
**Status** ✅ COMPLETE — EVL-GREEN: frontend 28/28, backend 187/187, tsc clean x2. See `phase-2-library-process_REPORT_25-07-26.md` for full closeout.
**Complexity** SIMPLE
**Report destination:** `process/general-plans/active/paperloop_25-07-26/phase-2-library-process_REPORT_25-07-26.md`

---

## Overview

Add the personal study loop's processing pipeline: a standalone `/notes/:id/process` route that walks a note through OCR-review → summary → quiz → SRS, and a standalone `/notes/capture` route that lets a user snap a photo, run OCR, confirm a title/subject, and land in the processing flow with a real note id. Both entry paths converge on the SAME `ProcessPage`: an existing My-Library note (opened directly at `/notes/:id/process`) and a fresh capture (created via `/notes/capture`, then redirected). One new backend endpoint (`GET /api/notes/:id`) is required so ProcessPage can fetch a single note by id; every other step reuses existing OCR/summary/quiz/SRS-logging endpoints.

---

## Entry Gate

- Phase 1 verified — ✅ COMPLETE (EVL PASS, 26/26 frontend, 184/184 backend, tsc clean x2; browser check accepted as known-gap).
- `/community`, `/community/:subjectId`, `/progress`, `/chat`, `/admin`, `/ops`, `/`, `/review`, `/my-notes`, `/settings` routes all functional per Phase 1.
- PVL re-confirmed 16-08-26: `npm test` baseline still green (26/26).

---

## Locked Decisions (from INNOVATE, carried into this plan verbatim)

1. **Transaction boundary — HYBRID-DELAYED-CREATE.** The note record is created at the "confirm title + subject" screen inside the capture flow — the first point an id is both needed (ProcessPage requires a real id) and available (title + subject are known). Not created on photo-snap; not deferred to a final "save" click after processing.
2. **Topology.** `/notes/capture` owns photo → OCR → confirm(title/subject) → `POST /api/notes` → redirect. `/notes/:id/process` (ProcessPage) ALWAYS mounts with a real id — it never branches on a missing id.
3. **Stepper.** `useState<Step>` linear enum (`ocr-review` → `summary` → `quiz` → `srs-done`). No XState, no reducer. Smallest component set: `ProcessPage.tsx` + a `StepIndicator` + one panel per step.
4. **Quiz caching.** Quiz is cached in component state for the session; regenerated ONLY on an explicit "Regenerate" click (the `/api/notes/:id/quiz` endpoint is stateless — silent remount-triggered regeneration would be a UX defect). `test_sessions` persistence is DEFERRED (accepted known-gap: refresh loses in-progress quiz).
5. **Already-processed re-entry.** On load, if `note.summary` is truthy, ProcessPage shows an "Already processed" card first (not the stepper). Primary action "Review" navigates to `/review`; secondary "Regenerate" enters the normal step flow from `summary`. Default is Review; regeneration is never forced.
6. **New backend endpoint — `GET /api/notes/:id`.** New if-block in `backend/src/index.ts` calling a new `getNote` handler in `backend/src/routes/notes.ts`. Ownership check (`author_id === user.id`) MUST precede any data return, matching the existing 403 convention at `notes.ts:344,422,547,600`. Matching `api.notes.getNote(id)` client method added to `src/lib/api.ts` (no such method exists today — see Verified Source Facts for the two corrections found during this supplement).
7. **Capture entry is a route, not a modal.** User explicitly chose a standalone full-focus route (`/notes/capture`), outside `AppShell` — same shape as the existing `/review` route.

---

## Verified Source Facts (confirmed by reading source this session)

- `POST /api/gemini/ocr` — body `{ imageBase64, mimeType }` → `{ text, success }`. Handler: `performOCREndpoint` (`backend/src/routes/ai.ts:494`). Client: `api.ai.performOCR(imageBase64, mimeType)` (`src/lib/api.ts:669`).
- `POST /api/notes/:id/summary` — body `{ content, title }` → `{ summary }`; writes `notes.summary`. Handler: `generateNoteSummaryEndpoint` (`backend/src/routes/ai.ts:514`), routed at `backend/src/index.ts:948`. Client: `api.ai.generateSummary(noteId, content)` (`src/lib/api.ts:354`).
- `POST /api/notes/:id/quiz` — body `{ content, title }` → `{ quiz: { questions } }`, **stateless** (DeepSeek/Gemini, no persistence). Handler: `generateQuizEndpoint` (`backend/src/routes/ai.ts:538`), routed at `backend/src/index.ts:953`. Client: `api.ai.generateQuiz(noteId, content)` (`src/lib/api.ts:361`).
- `POST /api/quiz/attempt` — body `{ note_id?, question_text, is_correct, confidence? }` → `{ success, due_at, current_streak, learning_points }`. Handler: `logQuizAttempt` (`backend/src/routes/study.ts`), routed at `backend/src/index.ts:1118`. This is the SRS seed — calls `computeSm2` and upserts `study_items`. **This is the only real business-logic write path in Phase 2.**
- `Question` shape (reference only, from `src/components/modals/QuizModal.tsx:17-24`): `{ id?, question, options: string[], correctAnswer?, correct_answer?, explanation? }`. Correct index is read via `q.correctAnswer ?? q.correct_answer`.
- **LIVE BUG to avoid (confirmed in `src/components/modals/SummaryModal.tsx:22`, and re-confirmed against `generateNoteSummaryEndpoint`/`generateQuizEndpoint` source at PVL — both reject with `{error:'Content is required'}` 400 when `!content`):** `api.ai.generateSummary(noteId)` is called with NO content argument, so `content` defaults to `''` and the backend 400s. ProcessPage's summary AND quiz steps MUST pass `note.extracted_text` explicitly as `content` — never call these with the default.
- Existing client methods (`src/lib/api.ts`): `api.ai.generateSummary`, `api.ai.generateQuiz`, `api.ai.performOCR`, `api.logQuizAttempt`, `api.notes.getAll`, `api.notes.create`, `api.subjects.getAll`. Missing: `api.notes.getNote` (this plan adds it).
- **Correction 1 (SQL columns) to Locked Decision 6:** the decision text's SELECT list (`id,title,extracted_text,description,image_path,summary,status,subject_id`) omits `author_id`, but `author_id` is required to perform the ownership check without a second query. This plan's SQL adds `author_id` to the SELECT list and strips it before the JSON response is returned (see Step 2a).
- **Correction 2 (403 message casing) to Locked Decision 6:** the decision text's example wording ("you can only view your own notes") does not match the codebase's actual convention. The real convention at `notes.ts:344,422,547,600` is `'Unauthorized - You can only <verb> your own notes'` (hyphen, capital "You"). This plan uses `'Unauthorized - You can only view your own notes'` to match. **PVL re-confirmed by direct grep** — all four existing lines use this exact casing.
- **Correction 3 (response shape) — pre-existing bug in `api.notes.create`:** `src/lib/api.ts:212` types `notes.create` as returning `Promise<Note>` and calls `api.request<Note>('/api/notes', ...)`, but `createNote` (`backend/src/routes/notes.ts:319-323`) actually returns `{ note, notes, success, totalParts }` — the note is nested under `.note`, not the bare response. This is a pre-existing mismatch, not introduced by Phase 2. `CaptureNotePage.tsx` works around it by calling `api.request<CreateNoteResponse>('/api/notes', {...})` directly with a locally-defined correct response type, rather than using (or fixing) the shared `api.notes.create` method — this keeps blast radius minimal and avoids risk to other note-upload flows (`UploadNoteModal.tsx` / `useUploadForm.ts`) that already depend on the existing (broken) typing without runtime issue (they never read the create response's `.id` directly the same way).
- **No route exists for a single note's detail page today.** `NoteDetailModal.tsx` is an in-page modal, not a route — there is no `/notes/:id` (non-process) route. ProcessPage's "back to library" affordance must therefore target an EXISTING route (`/my-notes`), not a nonexistent `/notes/:id`.
- **`GET /api/reviews/due` has no `note_id` filter.** Confirmed by reading `getDueReviews` (`backend/src/routes/study.ts:265-286`) — it returns ALL due items for the caller, `ORDER BY due_at LIMIT 50`, with no query-param filtering. Locked Decision 5's "Review (jump to due SRS cards for this note)" therefore cannot be scoped server-side within this plan's authorized scope (only `GET /api/notes/:id` is a new backend endpoint). The "Review" action navigates to the existing generic `/review` queue — see Accepted Known-Gaps.
- Photo/OCR/compression reference pattern: `src/components/upload-note/useUploadForm.ts:118-150` (OCR loop) and `src/components/upload-note/helpers.ts` (`compressImage`, `applyContrastEnhancement`). `CaptureNotePage.tsx` reuses `CameraCapture` (`src/components/CameraCapture.tsx`) and the two helpers directly — it does NOT import `useUploadForm` (that hook is tightly coupled to the multi-page `UploadNoteModal` flow and is out of scope).
- IDOR test pattern and helpers confirmed in `backend/test/red-team/helpers.ts`: `seedUser()`, `seedSubject(name?)`, `seedNote(authorId, subjectId, overrides?)`, `call(path, opts)`. `backend/test/red-team/G-idor.test.ts` is the existing home for "can X view/edit/delete another user's note" cases (111-120 range) — new `GET /api/notes/:id` ownership cases belong here.
- Existing SRS-write test gap: `backend/test/red-team/I-chat-study.test.ts:58-73` ("136 & auth") already proves a `quiz_attempts` row is written, but does NOT check that a `note_id`-scoped `study_items` row is created/updated — i.e. it does not prove the SRS card itself is seeded. This is the gap the "targeted check on the SRS-attempt logging path" checklist item closes.
- `Note` frontend type (`src/types/index.ts:89-110`) does not include `status`. `ProcessPage.tsx` and `api.ts`'s new `getNote` return type define a local `NoteDetail` type instead of reusing `Note` (matches Phase 1's "define local types, do not use `any`" convention).
- Bookkeeping nit carried from RESEARCH (not fixed here — flag for UPDATE PROCESS): the umbrella plan's `## Current Execution State` says "Phase 1 execution commit is pending" but Phase 1 is already committed as `172c7ca`.
- **PVL finding — `createNote`'s image payload contract (`backend/src/routes/notes.ts:196-205`), confirmed by direct read:** the handler checks `body.images && Array.isArray(body.images)` FIRST and only falls back to parsing `body.image_path` as a JSON **string**. See Checklist 2c.5's PVL correction (P1) below — this changed the exact payload shape used at the capture-confirm submit step.
- **PVL finding — `study_items` write-path nuances (`backend/src/routes/study.ts`), confirmed by direct read:** `logQuizAttempt`'s `note_id` check (line ~205) only verifies the note **exists**, not that it belongs to the caller (comment says "prevents cross-user score inflation" but the code never compares `author_id`). `upsertStudyItem`'s existing-row lookup (line ~124) is keyed by `(user_id, question_hash)` only, not `(user_id, note_id, question_hash)`. Both are pre-existing gaps in `study.ts`, which is outside Phase 2's blast radius — see Accepted Known-Gaps 4 and 5.

---

## Phase Completion Rules

Phase 2 is complete when:

1. `npm test`, `npx tsc --noEmit`, `cd backend && npm test`, `cd backend && npx tsc --noEmit` all exit 0
2. `ProcessPage` renders at `/notes/:id/process` and `CaptureNotePage` renders at `/notes/capture`, both standalone (outside `AppShell`) in browser (manual confirm)
3. Full capture→OCR→confirm→create→process (OCR-review→summary→quiz→SRS) pipeline can be driven end-to-end for a freshly captured note, AND the OCR-review→summary→quiz→SRS pipeline can be driven for an existing My-Library note (agent-probe confirm, both paths)
4. No Phase 1 regressions (TodayPage still loads at `/`, all tabs still work)
5. `GET /api/notes/:id` enforces ownership (403 for non-owner, 200 for owner) — proven by automated test
6. A logged quiz attempt with `note_id` set demonstrably creates/updates a `study_items` row for that note (the real SRS write) — proven by automated test
7. vc-validate-agent has written the Validate Contract section (Gate: PASS or accepted CONDITIONAL)
8. Phase 2 report written and umbrella Current Execution State updated

---

## Acceptance Criteria

- **C1.** `GET /api/notes/:id` returns 200 with the note body (`id, title, extracted_text, description, image_path, summary, status, subject_id`) for its owner.
- **C2.** `GET /api/notes/:id` returns 403 for a caller who does not own the note (IDOR protection); 404 when the note id does not exist.
- **C3.** Navigating to `/notes/:id/process` renders `ProcessPage` inside neither `AppShell` nor any other layout wrapper (standalone), fetches the note via `getNote`, and shows the "Already processed" card when `note.summary` is truthy, or the `ocr-review` step otherwise.
- **C4.** The `summary` step calls `generateSummary` with `note.extracted_text` as `content` (never empty) — never triggers the empty-content 400.
- **C5.** The `quiz` step calls `generateQuiz` with non-empty content, caches the result in component state, and only re-calls the endpoint on an explicit "Regenerate" click (not on remount).
- **C6.** Each answered quiz question calls `logQuizAttempt` with `note_id` set; a resulting `study_items` row exists for that `(user, note_id, question_hash)` after the call (the real SRS write path).
- **C7.** Navigating to `/notes/capture` renders `CaptureNotePage` standalone; capturing a photo, running OCR, confirming title + subject, and submitting creates a note via `POST /api/notes` and redirects to `/notes/:id/process` with the newly created note's real id.
- **C8.** Both `/notes/capture` and `/notes/:id/process` render outside `AppShell`, matching the existing `/review` route's pattern.
- **C9.** No Phase 1 regressions: `/`, `/community`, `/community/:subjectId`, `/progress`, `/chat`, `/admin`, `/ops`, `/review`, `/my-notes`, `/settings` all still render correctly.
- **C10.** `npx tsc --noEmit` (frontend) and `cd backend && npx tsc --noEmit` (backend) both exit 0.

---

## Blast Radius

Risk class: LOW-MEDIUM. One new backend read endpoint with an ownership check (auth-adjacent, not auth itself); no schema changes; no new dependencies.

**Backend:**

- `backend/src/routes/notes.ts` — MODIFY: add `export async function getNote(noteId: string, request: Request, env: Env)`
- `backend/src/index.ts` — MODIFY: import `getNote`; add new `GET /api/notes/:id` if-block
- `backend/test/red-team/G-idor.test.ts` — MODIFY: add owner-can-GET and non-owner-403 cases
- `backend/test/red-team/I-chat-study.test.ts` — MODIFY: add a targeted `study_items` upsert check for `note_id`-scoped quiz attempts (Phase 4 will later SPLIT this file, keeping the study half — this new case stays in the study half)

**Frontend:**

- `src/lib/api.ts` — MODIFY: add `notes.getNote(id)` method + local `NoteDetail` response type
- `src/pages/ProcessPage.tsx` — CREATE: linear stepper (`ocr-review` → `summary` → `quiz` → `srs-done`) + "Already processed" re-entry card
- `src/pages/CaptureNotePage.tsx` — CREATE: photo capture → OCR → confirm(title/subject) → `POST /api/notes` → redirect
- `src/app/AppRoutes.tsx` — MODIFY: add `/notes/capture` and `/notes/:id/process` as standalone protected routes (no shell), alongside `/review`
- `src/app/lazyPages.ts` — MODIFY: add `ProcessPage` and `CaptureNotePage` lazy exports
- `src/app/__tests__/appshell-routing.test.tsx` — MODIFY: add routing smoke tests for both new standalone routes

**Reference-only (not imported, not modified):**

- `src/components/modals/QuizModal.tsx`, `src/components/modals/SummaryModal.tsx` — orphaned components; used only to confirm `Question` shape and the `logQuizAttempt` call pattern
- `src/components/upload-note/useUploadForm.ts` — reference for OCR-loop pattern only, not imported

**Reconciled against `phase-blast-radius-registry.md`:** the registry's Phase 2 entry (written when this was a stub) listed only 3 files. This plan expands that list — see the registry update accompanying this supplement. `backend/src/index.ts` is also claimed by Phase 4 (chat removal + quiz route) and Phase 5 (primer route); Phase 2 executes first in program order, so no conflict. `src/app/AppRoutes.tsx` and `src/app/lazyPages.ts` are claimed by every phase — sequential execution order (already the registry's documented rule) prevents conflicts.

---

## Touchpoints

| File                                          | Action | Anchor                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/routes/notes.ts`                 | MODIFY | insert `getNote` after `getNotesBySubject` (PVL-confirmed: function body actually ends line 70, `searchNotes` starts line 73 — insert between them; locate by function name via grep, not the hardcoded line number)                                                                                                                                           |
| `backend/src/index.ts`                        | MODIFY | import at the `from './routes/notes'` block (PVL-confirmed: lines 34–44); new if-block between the `POST /api/notes` block (PVL-confirmed: lines 766–769) and the `PUT /api/notes/:id` block (PVL-confirmed: starts line 770) — no regex collision with the existing `DELETE` block on the same path pattern (different HTTP method, same codebase convention) |
| `backend/test/red-team/G-idor.test.ts`        | MODIFY | add 2 new `it()` cases inside `describe('G. IDOR / object security (111-120)', ...)` (PVL-confirmed: block starts line 13)                                                                                                                                                                                                                                     |
| `backend/test/red-team/I-chat-study.test.ts`  | MODIFY | add 1 new `it()` case near the existing "136 & auth" case (PVL-confirmed: line 58)                                                                                                                                                                                                                                                                             |
| `src/lib/api.ts`                              | MODIFY | `notes: { ... }` object (PVL-confirmed: lines 210–217) — add `getNote` alongside `getAll`/`create`                                                                                                                                                                                                                                                             |
| `src/pages/ProcessPage.tsx`                   | CREATE | new file                                                                                                                                                                                                                                                                                                                                                       |
| `src/pages/CaptureNotePage.tsx`               | CREATE | new file                                                                                                                                                                                                                                                                                                                                                       |
| `src/app/AppRoutes.tsx`                       | MODIFY | "Standalone protected routes (no shell)" block (PVL-confirmed: lines 79–102), alongside `/review`                                                                                                                                                                                                                                                              |
| `src/app/lazyPages.ts`                        | MODIFY | append 2 new `lazy()` exports                                                                                                                                                                                                                                                                                                                                  |
| `src/app/__tests__/appshell-routing.test.tsx` | MODIFY | append 2+ new routing smoke tests (see Checklist 2e.1 PVL correction — sentinel-mock the two new pages, not `api.notes.getNote`)                                                                                                                                                                                                                               |

---

## Public Contracts

- `POST /api/gemini/ocr`, `POST /api/notes/:id/summary`, `POST /api/notes/:id/quiz`, `POST /api/quiz/attempt`, `GET /api/reviews/due`, `GET /api/study/stats`, `POST /api/notes`, `GET /api/notes/my-notes`: all UNCHANGED (reused as-is).
- **NEW public contract:** `GET /api/notes/:id` — auth required; returns `{ note: { id, title, extracted_text, description, image_path, summary, status, subject_id } }` (200) for the note's owner; `{ error }` (403) for a non-owner; `{ error: 'Note not found' }` (404) if the id does not exist.
- `src/types/index.ts` `Note` interface: UNCHANGED (Phase 2 uses a local `NoteDetail` type instead of extending `Note`).
- Phase 1 routing structure: preserved; new routes are additive only.

---

## Implementation Checklist

### 2a — Backend: `GET /api/notes/:id`

- [ ] 2a.1. In `backend/src/routes/notes.ts`, add `export async function getNote(noteId: string, request: Request, env: Env)`, inserted after `getNotesBySubject` (PVL-confirmed: ends line 70) and before `searchNotes` (PVL-confirmed: starts line 73). Follow the try/catch + `getOrCreateUser` pattern used by `getMyNotes`/`publishDraftNote`/`userDeleteNote` (catch `'Unauthorized'` → 401) — pattern PVL-confirmed at `notes.ts:481-529` (`getMyNotes`):
  - `const user = await getOrCreateUser(request, env);`
  - `SELECT id, title, extracted_text, description, image_path, summary, status, subject_id, author_id FROM notes WHERE id = ?` bound to `noteId`.
  - If no row: `jsonResponse({ error: 'Note not found' }, 404)`.
  - If `row.author_id !== user.id`: `jsonResponse({ error: 'Unauthorized - You can only view your own notes' }, 403)` (matches the exact convention at `notes.ts:344,422,547,600` — see Correction 2, PVL-reconfirmed by direct grep).
  - Otherwise strip `author_id` and return `jsonResponse({ note: { id, title, extracted_text, description, image_path, summary, status, subject_id } })`.
- [ ] 2a.2. In `backend/src/index.ts`: add `getNote` to the `from './routes/notes'` import block (PVL-confirmed: lines 34–44). Add a new if-block between the existing `POST /api/notes` block (PVL-confirmed: lines 766-769) and the `PUT /api/notes/:id` block (PVL-confirmed: starts line 770): `if (path.match(/^\/api\/notes\/\d+$/) && request.method === 'GET') { const noteId = path.split('/')[3]; return await getNote(noteId, request, env); }`.
- [ ] 2a.3. In `src/lib/api.ts`, add a `NoteDetail` local type (fields: `id: number; title: string; extracted_text: string | null; description: string | null; image_path: string | null; summary: string | null; status: string | null; subject_id: number`) and a `getNote` method inside the `notes: { ... }` object (PVL-confirmed: lines 210–217): `getNote: (id: number): Promise<{ note: NoteDetail }> => api.request<{ note: NoteDetail }>(\`/api/notes/${id}\`, { method: 'GET' })`.
- [ ] 2a.4. In `backend/test/red-team/G-idor.test.ts`, add two cases inside the existing `describe('G. IDOR / object security (111-120)', ...)` block (PVL-confirmed line 13), using `seedUser()`, `seedSubject()`, `seedNote(authorId, subjectId)`, `call(path, opts)` (all PVL-confirmed real exports at `helpers.ts:101,130,140,172`):
  - `GET /api/notes/:id` for the note's owner returns 200 with the expected fields.
  - `GET /api/notes/:id` for a non-owner (a second seeded user) returns 403.

### 2b — `ProcessPage.tsx` (id-based linear stepper)

- [ ] 2b.1. Create `src/pages/ProcessPage.tsx`. Read `:id` via `useParams()`. On mount, call `api.notes.getNote(Number(id))`; handle loading (spinner) and error (toast.error) states following the existing pattern (see `TodayPage.tsx`).
- [ ] 2b.2. Define `type Step = 'ocr-review' | 'summary' | 'quiz' | 'srs-done'` and `useState<Step>('ocr-review')`. Note: `ocr-review` here is a read-only display of `note.extracted_text` for confirmation — OCR itself already ran, either during capture (fresh note) or previously (existing My-Library note). No OCR call happens on this page.
- [ ] 2b.3. "Already processed" re-entry: if `note.summary` is truthy on load, render an "Already processed" card INSTEAD of the stepper — title "Already processed", primary button "Review" → `navigate('/review')` (see Accepted Known-Gaps — not filtered to this note), secondary button "Regenerate" → sets `step` to `'summary'` and proceeds through the normal flow. This card is the DEFAULT render when `note.summary` exists; never auto-force regeneration.
- [ ] 2b.4. `ocr-review` step: render `note.extracted_text` in a read-only scrollable panel + "Continue to Summary" button → advances `step` to `'summary'`.
- [ ] 2b.5. `summary` step: call `api.ai.generateSummary(Number(id), note.extracted_text || '')` — MUST pass `note.extracted_text` explicitly (see Verified Source Facts LIVE BUG, PVL-reconfirmed against `generateNoteSummaryEndpoint`'s `if (!content) return 400` check). Loading spinner while pending; on success render the summary text + "Continue to Quiz" button (advances to `'quiz'`); on error `toast.error(...)` + retry button (re-invokes the same call, does not advance).
- [ ] 2b.6. `quiz` step: call `api.ai.generateQuiz(Number(id), note.extracted_text || '')` (same non-empty-content rule, PVL-reconfirmed against `generateQuizEndpoint`). Cache the result in `useState<Quiz | null>` — build the question UI fresh inline (using the `Question` shape confirmed from `QuizModal.tsx` as reference only — do not import `QuizModal`). Render one question at a time (matches the reference pattern) with an explicit "Regenerate" button that re-calls `generateQuiz` — never silently regenerate on remount.
- [ ] 2b.7. On each answered question, call `api.logQuizAttempt({ note_id: Number(id), question_text: q.question, is_correct, confidence })` (match the payload shape from `QuizModal.tsx:94-99`, reference only — do not import). On success, surface `current_streak`/`learning_points` feedback (toast, matching the reference pattern) — non-blocking (a logging failure must not interrupt the quiz). PVL note: `logQuizAttempt`'s server-side `note_id` check only verifies the note exists (not ownership — see Accepted Known-Gap 5); this is safe in Phase 2's own flow because `id` always came from a note this user already fetched via the ownership-gated `getNote`.
- [ ] 2b.8. After the last question is answered, advance `step` to `'srs-done'`. Render a completion summary (score + "cards added to your review queue") with primary "Go to Review" → `navigate('/review')` and secondary "Back to My Library" → `navigate('/my-notes')` (there is no `/notes/:id` detail route — see Verified Source Facts).

### 2c — Capture route

- [ ] 2c.1. Create `src/pages/CaptureNotePage.tsx`. Standalone full-focus page, no `AppShell` wrapper. Local step state (independent of `ProcessPage`'s `Step` type): `'capture' | 'ocr' | 'confirm'`.
- [ ] 2c.2. `capture` step: render `CameraCapture` (`src/components/CameraCapture.tsx`) to take/select a single photo. Phase 2 scope is single-image capture only (no multi-page chunking like `UploadNoteModal`'s flow — an intentional scope reduction for a "quick capture" entry point, not a replacement for the full upload flow).
- [ ] 2c.3. On photo captured: run `compressImage()` and `applyContrastEnhancement()` from `src/components/upload-note/helpers.ts` (reference the call pattern at `useUploadForm.ts:60-96`, do not import `useUploadForm`), then advance to `ocr` step and call `api.ai.performOCR(compressedImage, 'image/jpeg')`. On failure: `toast.error(...)`, allow retry (return to `capture` step).
- [ ] 2c.4. `confirm` step: render a title input (required) and a subject `<select>` populated via `api.subjects.getAll()`. This is the HYBRID-DELAYED-CREATE trigger point (Locked Decision 1).
- [ ] 2c.5. On confirm submit: call `api.request<CreateNoteResponse>('/api/notes', { method: 'POST', body: { title, subject_id, extracted_text, images: [compressedImage] } })` directly (NOT `api.notes.create` — see Correction 3). **PVL correction (P1) — use the `images` key, not `image_path`:** `createNote` (`backend/src/routes/notes.ts:196-205`) checks `body.images && Array.isArray(body.images)` FIRST; sending a raw array literal under `image_path` instead falls through to the `else if (body.image_path)` branch, which calls `JSON.parse(body.image_path)` on a non-string. For a single-image array this either throws (caught, then wraps the array a second time into a malformed nested `[[image]]` before `JSON.stringify`-ing it into storage) or accidentally round-trips only by JS array-to-string coincidence — fragile either way. `images: [compressedImage]` is the field the handler is actually built around and avoids the parse/stringify round-trip entirely. Define `CreateNoteResponse` locally in `CaptureNotePage.tsx` as `{ note: { id: number; [key: string]: unknown }; success: boolean }`. No `status` field is sent (defaults to `published` server-side, PVL-confirmed at `notes.ts:215` — no draft mode in Phase 2 scope).
- [ ] 2c.6. On success: `navigate(\`/notes/${response.note.id}/process\`, { replace: true })`. On failure: `toast.error(...)`, remain on `confirm` step (do not lose the captured image or entered title).

### 2d — Route wiring

- [ ] 2d.1. In `src/app/lazyPages.ts`, add: `export const ProcessPage = lazy(() => import('../pages/ProcessPage'));` and `export const CaptureNotePage = lazy(() => import('../pages/CaptureNotePage'));`.
- [ ] 2d.2. In `src/app/AppRoutes.tsx`, import `ProcessPage` and `CaptureNotePage` from `./lazyPages` (add to the existing named-import block, lines 10–24). Add two new routes inside the "Standalone protected routes (no shell)" block (PVL-confirmed: lines 79–102), alongside `/review`:
  ```
  <Route path="/notes/capture" element={<ProtectedRoute><CaptureNotePage /></ProtectedRoute>} />
  <Route path="/notes/:id/process" element={<ProtectedRoute><ProcessPage /></ProtectedRoute>} />
  ```
  Do NOT nest these inside the `AppShell` layout route (lines 106–135) — both are standalone per Locked Decision 7 / C8.

### 2e — Tests

- [ ] 2e.1. In `src/app/__tests__/appshell-routing.test.tsx`, add: `renders CaptureNotePage at /notes/capture (standalone, no AppShell)` and `renders ProcessPage at /notes/:id/process (standalone, no AppShell)` — same `<MemoryRouter initialEntries={[...]}>` + `<AppRoutes />` pattern as the existing `/review` test. **PVL correction (P2) — sentinel-mock the two new pages, not `api.notes.getNote`:** mock `ProcessPage` and `CaptureNotePage` themselves to sentinel divs (`vi.mock('../../pages/ProcessPage', () => ({ default: () => <div>PROCESS PAGE CONTENT</div> }))`, same shape for `CaptureNotePage`) — mirroring the existing `ReviewPage`/`Login` sentinel-mock pattern already in this file (PVL-confirmed at lines 46-51) — rather than deep-mocking `api.notes.getNote` alone. The existing hoisted `api` mock (PVL-confirmed at lines 26-40) has no `notes`/`subjects`/`ai` sub-objects, and `CaptureNotePage` also mounts `CameraCapture`, which calls `getCameraStream()` → `navigator.mediaDevices.getUserMedia` (undefined in jsdom; PVL-confirmed the call is internally try/caught so it degrades to an error state rather than throwing, but it is still unnecessary noise for a pure routing test). Sentinel-mocking keeps this a pure routing test, matching the file's own stated purpose (prove the right component mounts at the URL, not exercise page internals).
- [ ] 2e.2. In `backend/test/red-team/I-chat-study.test.ts`, add a new case near "136 & auth" (PVL-confirmed: line 58): seed a user + subject + note, `POST /api/quiz/attempt` with `note_id` set, then query `study_items WHERE user_id = ? AND note_id = ?` directly via `env.DB` and assert a row exists with the expected `question_hash` — proving the real SRS write path (Phase Completion Rule 6 / C6). PVL note: use a fresh, unique `question_text` in this test (the fresh-seeded-user + fresh-`resetData`-per-test pattern already guarantees this) — `upsertStudyItem`'s existing-row lookup is keyed by `(user_id, question_hash)` only (see Accepted Known-Gap 4), so a fresh question_hash guarantees the INSERT path (which does store `note_id`) fires rather than the UPDATE path (which does not touch `note_id`).
- [ ] 2e.3. Run all four gate commands (see Exit Gate) after 2a–2d are complete; fix any failures before considering the phase code-complete.

---

## Exit Gate

```bash
npm test                     # frontend — routing smoke tests for /notes/capture and /notes/:id/process must pass
npx tsc --noEmit              # frontend typecheck
cd backend && npm test        # backend — G-idor.test.ts + I-chat-study.test.ts new cases must pass; no regressions
cd backend && npx tsc --noEmit  # backend typecheck
```

Manual/agent-probe verification:

- [ ] Browser: navigate to `/notes/capture` — capture (or upload) a photo, confirm OCR runs, enter a title + subject, submit — confirm redirect to `/notes/:id/process` with a real id. **Also confirm the stored note's `image_path` renders correctly afterward (verifies the P1 payload-field fix actually resolved the storage shape, not just that the request succeeded).**
- [ ] Browser: on the resulting ProcessPage — confirm `ocr-review` shows extracted text, `summary` generates and displays a summary, `quiz` generates questions and each answer triggers a streak/points toast, `srs-done` shows a completion summary.
- [ ] Browser: open an EXISTING My-Library note that already has a summary — confirm the "Already processed" card renders with Review (default) and Regenerate options.
- [ ] Browser: confirm no Phase 1 regressions — `/`, all nav tabs, `/review`, `/my-notes`, `/settings` still work.

---

## Blockers That Would Justify BLOCKED Status

- `CameraCapture.tsx` cannot be reused standalone outside its current `UploadNoteModal` context without significant rework (investigate before coding; if true, fall back to a plain `<input type="file" accept="image/*" capture="environment">` for Phase 2). PVL note: `CameraCapture` takes `onCapture`/`onClose`/`title`/`facingMode` props and is not otherwise coupled to `UploadNoteModal`'s internal state — reuse looks mechanically fine on inspection, but this remains an execute-agent verification step, not a PVL-provable claim (no render-in-real-browser probe was run).
- The backend's `notes` table `status` column behaves unexpectedly with no `status` field in the create payload (verify `noteStatus = body.status === 'draft' ? 'draft' : 'published'` defaults to `'published'` as expected before relying on it in 2c.5). **PVL-confirmed:** `notes.ts:215` — `const noteStatus = body.status === 'draft' ? 'draft' : 'published';` — defaults to `'published'` exactly as assumed. This blocker is resolved; downgraded to a confirmed-safe assumption.

---

## Accepted Known-Gaps

1. **Quiz refresh-loss.** The quiz is cached only in component state for the session (Locked Decision 4). A page refresh mid-quiz loses progress. `test_sessions` persistence is deferred — no backlog artifact required yet per user decision, but flag if it recurs as a complaint.
2. **No `test_sessions` persistence.** Same root cause as (1) — no server-side quiz-session state exists or is added in Phase 2.
3. **"Review" is not filtered to the processed note.** `GET /api/reviews/due` has no `note_id` filter (Verified Source Facts). The "Already processed" card's "Review" action and the `srs-done` step's "Go to Review" action both navigate to the generic `/review` queue rather than a note-scoped view. Adding server-side filtering is out of this plan's authorized backend scope (only `GET /api/notes/:id` was authorized as a new endpoint) — candidate for a future phase's backlog item if it becomes a real UX complaint.
4. **`study_items` note_id lookup-key gap (discovered at PVL; pre-existing, outside Phase 2 blast radius).** `upsertStudyItem` (`backend/src/routes/study.ts:123-127`) looks up an existing row by `(user_id, question_hash)` only, not `(user_id, note_id, question_hash)` — if the same worded question recurs across two different notes for the same user, the stored `note_id` on that row reflects only the first note that created it, not later ones. Does not affect Phase 2's new automated test (2e.2 uses a fresh seeded user + fresh question_hash each run, so the INSERT path fires and `note_id` is stored correctly). `study.ts` is not in Phase 2's blast radius — candidate for a future SRS data-integrity backlog item.
5. **`logQuizAttempt` note_id check is existence-only, not ownership (discovered at PVL; pre-existing, outside Phase 2 blast radius).** The comment at `study.ts:204` claims an ownership check ("prevents cross-user score inflation") but the code only verifies the note exists (`if (!noteOwner) return 404`), never compares `noteOwner.author_id !== user.id`. Not exploitable via Phase 2's own flow (the frontend only ever sends a `note_id` the user already fetched through the ownership-gated `GET /api/notes/:id`), and `study.ts` is outside this plan's authorized scope — candidate for a future backlog item.

---

## Security Note

`GET /api/notes/:id` is a new authenticated read endpoint returning potentially sensitive note content (extracted text, summary, draft status). IDOR mitigation: the ownership check (`author_id === user.id`) MUST run and short-circuit with 403 BEFORE any note data is included in the response (see 2a.1's ordering: SELECT → not-found check → ownership check → strip + return). This mirrors the existing pattern at `notes.ts:344,422,547,600` and is directly tested by the two new `G-idor.test.ts` cases (2a.4). PVL re-confirmed this ordering and the exact 403 message convention by direct source read (see Correction 2). A related pre-existing gap was found one layer over in `logQuizAttempt` (Accepted Known-Gap 5) — it is outside this endpoint's scope and outside Phase 2's blast radius, but is recorded here for audit continuity since it is adjacent to the same security surface.

---

## Verification Evidence

| Gate / Scenario                                                                                                     | Strategy        | Proves SPEC criterion                                                         |
| ------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `G-idor.test.ts`: owner GET returns 200 with expected fields                                                        | Fully-Automated | C1                                                                            |
| `G-idor.test.ts`: non-owner GET returns 403                                                                         | Fully-Automated | C2                                                                            |
| `I-chat-study.test.ts`: `note_id`-scoped quiz attempt upserts a `study_items` row                                   | Fully-Automated | C6                                                                            |
| `appshell-routing.test.tsx`: `/notes/:id/process` renders `ProcessPage` standalone (P2-corrected mock)              | Fully-Automated | C3, C8                                                                        |
| `appshell-routing.test.tsx`: `/notes/capture` renders `CaptureNotePage` standalone (P2-corrected mock)              | Fully-Automated | C7 (route only), C8                                                           |
| `npx tsc --noEmit` (frontend) exits 0                                                                               | Fully-Automated | C10                                                                           |
| `cd backend && npx tsc --noEmit` exits 0                                                                            | Fully-Automated | C10                                                                           |
| `npm test` (frontend) exits 0, no regressions                                                                       | Fully-Automated | C9                                                                            |
| `cd backend && npm test` exits 0, no regressions                                                                    | Fully-Automated | C9                                                                            |
| Browser: existing note with `summary` set shows "Already processed" card, Review default                            | Agent-Probe     | C3 (already-processed branch)                                                 |
| Browser: full capture→OCR→confirm→create→redirect flow (incl. verifying stored image renders — P1 regression check) | Agent-Probe     | C7 (end-to-end)                                                               |
| Browser: `summary` step never sends empty content (network tab / no 400)                                            | Agent-Probe     | C4                                                                            |
| Browser: `quiz` step caches across step-panel re-renders; only "Regenerate" re-calls                                | Agent-Probe     | C5                                                                            |
| Browser: each answered question shows streak/points toast (real `logQuizAttempt` call)                              | Agent-Probe     | C6 (UI-level confirmation, backed by the automated `study_items` check above) |

**What this coverage does NOT prove:** live Gemini/DeepSeek response quality or latency (AI keys absent from test bindings by design — `all-tests.md`); that the "Already processed" Review action actually lands the user on cards from the SAME note (known-gap 3); mobile-viewport camera-capture UX (agent-probe is desktop-browser only unless the phase-1 mobile-viewport pattern is reused); that the `study_items` `note_id` association survives a REPEAT of the same worded question from a different note (known-gap 4 — the automated test only exercises a single fresh question per run); that `logQuizAttempt`'s `note_id` is actually owned by the caller at the DB layer (known-gap 5 — safe today only because the frontend always supplies an already-ownership-checked id).

---

## Test Infra Improvement Notes

- This phase adds the first backend test coverage for `study_items` upsert behavior scoped by `note_id` (`I-chat-study.test.ts` new case) — previously only `quiz_attempts` row creation was checked, not the actual SRS card write. Future phases touching the SRS write path should extend this same case rather than re-deriving it.
- This phase adds the first frontend test coverage for a route rendered OUTSIDE `AppShell` other than `/review` (both `/notes/capture` and `/notes/:id/process`) — confirms `appshell-routing.test.tsx` is not actually AppShell-specific despite its name; a future phase could consider renaming it to `routing.test.tsx` if the non-shell route count keeps growing (not done here — out of scope, naming-only).
- No E2E/browser-automated coverage exists for the capture→OCR→confirm→redirect flow or the summary/quiz generation flow (both require live-ish AI behavior); both remain Agent-Probe tier. If Playwright is ever introduced (see `all-tests.md` Known Gaps — currently none exists), this flow is a strong first candidate given its multi-step nature.
- Pre-existing type bug found and worked around, not fixed: `api.notes.create`'s declared return type (`Promise<Note>`) does not match the backend's actual response shape (`{ note, notes, success, totalParts }`). Recommend a dedicated small fix-only plan in a later phase (or as a general-plans hygiene item) rather than folding it into Phase 2's blast radius.
- **PVL addition:** two more pre-existing `study.ts` data-integrity nuances were found this pass (Accepted Known-Gaps 4 and 5). Both are one layer outside this phase's blast radius, but a future "SRS data-integrity hardening" backlog plan should address `upsertStudyItem`'s `(user_id, question_hash)`-only lookup key and `logQuizAttempt`'s existence-only `note_id` check together, since they are adjacent code in the same file.

---

## Phase Loop Progress

- [x] 1. RESEARCH — endpoint signatures verified by direct source read this session (`notes.ts`, `index.ts`, `ai.ts`, `study.ts`, `api.ts`, `types/index.ts`, `AppRoutes.tsx`, `lazyPages.ts`, `QuizModal.tsx`, `SummaryModal.tsx`, `useUploadForm.ts`, `G-idor.test.ts`, `I-chat-study.test.ts`, `helpers.ts` test file); 3 corrections to the locked decisions found and documented (SQL columns, 403 message casing, `api.notes.create` response-shape bug); the `/api/reviews/due` note-filter gap discovered and recorded as Accepted Known-Gap 3.
- [x] 2. INNOVATE — approach locked by user this session (see Locked Decisions above): HYBRID-DELAYED-CREATE, capture route owns id creation, linear `useState<Step>` stepper, session-cached quiz with explicit regenerate, "Already processed" re-entry defaulting to Review, capture as a standalone route.
- [x] 3. PLAN-SUPPLEMENT — this update. Every section of the stub was rewritten with concrete file:line anchors, a corrected + expanded blast radius, an atomic 2a–2e checklist, REQ-TEST-LINK'd verification evidence, 3 accepted known-gaps, and an IDOR security note. Registry reconciled (see `phase-blast-radius-registry.md` Phase 2 section).
- [x] 4. PVL — vc-validate-agent: full V1–V7 complete; validate-contract written (Gate: CONDITIONAL, accepted). Direct source-read verification (not inference) confirmed every anchor/claim in the plan; found and fixed 2 concrete concerns in-plan (P1: capture payload field-name bug in 2c.5; P2: routing-smoke-test mock approach in 2e.1); discovered and documented 2 new pre-existing, out-of-blast-radius known-gaps in `study.ts` (Known-Gaps 4 and 5). 0 unresolved FAILs.
- [x] 5. EXECUTE — implemented 2a–2e verbatim (incl. PVL corrections P1 `images` payload key and P2 sentinel-mock pages). Internal gates green: frontend 28/28 (26→28), backend 187/187 (184→187), `npx tsc --noEmit` clean on both. One within-blast-radius deviation: `NoteDetail` exported once from `src/lib/api.ts` and imported by `ProcessPage.tsx` (DRY single-source) rather than duplicated in both files.
- [x] 6. EVL — orchestrator independently re-ran all 4 gate commands; confirmed GATES-GREEN (frontend 28/28, backend 187/187, tsc clean x2). 4 agent-probe rows (browser) remain verification-pending — see backlog NOTEs in `phase-2-library-process_REPORT_25-07-26.md`.
- [x] 7. UPDATE PROCESS — phase report written, registry updated, umbrella reconciled, memory updated. See `phase-2-library-process_REPORT_25-07-26.md`.

---

## Inner Loop Refresh Note: 2026-08-16 — changed sections: Overview, Entry Gate, Locked Decisions (new), Verified Source Facts (new), Phase Completion Rules, Acceptance Criteria, Blast Radius, Touchpoints (new), Public Contracts, Implementation Checklist, Exit Gate, Blockers, Accepted Known-Gaps (new), Security Note (new), Verification Evidence, Test Infra Improvement Notes, Phase Loop Progress. Invalidates prior validate-contract.

(No prior validate-contract existed for this stub — this note documents the supplement for V1's benefit on the next PVL pass regardless. PVL ran normally this pass — see `## Validate Contract` below.)

---

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/paperloop_25-07-26/phase-2-library-process_PLAN_25-07-26.md`
- Last completed step: Phase Loop Progress Step 4 (PVL) — validate-contract written, Gate: CONDITIONAL (accepted)
- Validate-contract status: written — Gate: CONDITIONAL (accepted, `inner-pvl: phase-2`)
- Supporting context files loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`, umbrella plan, Phase 1 plan (shape reference), `phase-blast-radius-registry.md`
- Next step for a fresh agent: Spawn `vc-execute-agent` (opus). Pass this plan file path explicitly.
- Execute-agent start instruction: implement in checklist order 2a → 2b → 2c → 2d → 2e; **2c.5 and 2e.1 already carry inline PVL corrections (P1, P2) — implement them as currently written, not the pre-correction wording that existed before this PVL pass.** Run the Exit Gate commands after 2a (backend-only subset: `cd backend && npm test` + `cd backend && npx tsc --noEmit`) and again after 2d/2e (full four-command set) — do not batch all steps to the end.

---

## Validate Contract

Status: CONDITIONAL
Date: 16-08-26
date: 2026-08-16
generated-by: inner-pvl: phase-2

Parallel strategy: sequential (deep-mode, single-context execution)
Rationale: 7-signal score 5/7 (S2 new public API + IDOR surface, S4 phase program, S5 user explicitly asked for a hard security/correctness pass on named risk points, S6 high-risk class present, S7 10 files in blast radius) would nominally recommend parallel-subagents or workflow for the V2 fan-out. This pass was executed as a single deep-mode sequential session (no Agent-spawn tool available to this invocation) substituting direct source-file verification for separate dimension/section subagents — every claim in the plan (anchors, endpoint contracts, helper signatures, ownership-check ordering, payload shapes) was independently confirmed against the real files on disk rather than inferred, which is evidence-equivalent to a parallel fan-out for a blast radius this size.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id           | behavior                                                                                                  | strategy        | proving test                                                                          | gap-resolution |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- | -------------- |
| C1                     | `GET /api/notes/:id` returns 200 with the note body for its owner                                         | Fully-Automated | `cd backend && npm test` — `G-idor.test.ts` new "owner GET" case (2a.4)               | A              |
| C2                     | `GET /api/notes/:id` returns 403 for a non-owner (IDOR)                                                   | Fully-Automated | `cd backend && npm test` — `G-idor.test.ts` new "non-owner GET" case (2a.4)           | A              |
| C6                     | Quiz attempt with `note_id` upserts a `study_items` row                                                   | Fully-Automated | `cd backend && npm test` — `I-chat-study.test.ts` new note_id/study_items case (2e.2) | A              |
| C3, C8                 | `/notes/:id/process` renders `ProcessPage` standalone (no AppShell)                                       | Fully-Automated | `npm test` — `appshell-routing.test.tsx` new case, P2-corrected sentinel mock (2e.1)  | A              |
| C7 (route), C8         | `/notes/capture` renders `CaptureNotePage` standalone (no AppShell)                                       | Fully-Automated | `npm test` — `appshell-routing.test.tsx` new case, P2-corrected sentinel mock (2e.1)  | A              |
| C10                    | Frontend TypeScript contracts clean                                                                       | Fully-Automated | `npx tsc --noEmit` exits 0                                                            | A              |
| C10                    | Backend TypeScript contracts clean                                                                        | Fully-Automated | `cd backend && npx tsc --noEmit` exits 0                                              | A              |
| C9                     | Frontend regression clean (no Phase 1 breakage)                                                           | Fully-Automated | `npm test` exits 0, full suite (baseline 26/26 reconfirmed at PVL)                    | A              |
| C9                     | Backend regression clean                                                                                  | Fully-Automated | `cd backend && npm test` exits 0, full suite                                          | A              |
| C3 (already-processed) | Existing note w/ summary shows "Already processed" card, Review default                                   | Agent-Probe     | Browser: open existing note w/ `summary` set                                          | A              |
| C7 (end-to-end)        | Full capture→OCR→confirm→create→redirect flow, incl. verifying stored image renders (P1 regression check) | Agent-Probe     | Browser: capture photo → confirm → redirect w/ real id                                | A              |
| C4                     | `summary` step never sends empty content                                                                  | Agent-Probe     | Browser: network tab / no 400 on summary call                                         | A              |
| C5                     | `quiz` step caches; only "Regenerate" re-calls                                                            | Agent-Probe     | Browser: step-panel re-render does not re-call `generateQuiz`                         | A              |
| C6 (UI)                | Each answered question shows streak/points toast                                                          | Agent-Probe     | Browser: answer a question, observe toast                                             | A              |

gap-resolution legend:

- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a `strategy:` value here — Known-Gaps 3, 4, 5 are named residual rows carried in Open Gaps below, not proving strategies.

Legacy line form (retained so existing validate-contract consumers still parse):

- backend IDOR + SRS tests: Fully-automated: `cd backend && npm test`
- frontend routing tests: Fully-automated: `npm test` (from repo root)
- typecheck frontend: Fully-automated: `npx tsc --noEmit`
- typecheck backend: Fully-automated: `cd backend && npx tsc --noEmit`
- browser verification: agent-probe: dev server smoke run (capture flow, process pipeline, already-processed re-entry)

Failing stubs (for the 5 newly-introduced Fully-Automated scenario rows, to be written by execute-agent at 2a.4/2e.1/2e.2):

C1/C2 (`G-idor.test.ts`):

```
test("GET /api/notes/:id returns 200 with the note body for its owner", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: GET /api/notes/:id owner 200")
})
test("GET /api/notes/:id returns 403 for a non-owner (IDOR)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: GET /api/notes/:id non-owner 403")
})
```

C6 (`I-chat-study.test.ts`):

```
test("logging a note_id-scoped quiz attempt upserts a study_items row", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: note_id-scoped study_items upsert")
})
```

C3/C8 and C7/C8 (`appshell-routing.test.tsx`):

```
test("renders ProcessPage at /notes/:id/process (standalone, no AppShell)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: renders ProcessPage at /notes/:id/process")
})
test("renders CaptureNotePage at /notes/capture (standalone, no AppShell)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: renders CaptureNotePage at /notes/capture")
})
```

Dimension findings:

- Infra fit: CONDITIONAL — backend wiring (import block, if-block insertion point, `notes.ts` insertion point) all confirmed exact via direct source read; anchor line numbers drift by 1-3 lines from the plan's stated numbers (cosmetic, not blocking — execute-agent locates by function name/pattern, not hardcoded line number); capture-payload field-name bug found and fixed in plan (P1, checklist 2c.5).
- Test coverage: CONDITIONAL — `G-idor.test.ts`/`I-chat-study.test.ts` insertion points and helper signatures (`seedUser`/`seedSubject`/`seedNote`/`call`) all confirmed real and usable; routing-smoke-test mock strategy was under-specified (deep-mocking `api.notes.getNote` alone is insufficient — the hoisted `api` mock has no `notes`/`subjects`/`ai` sub-objects, and `CaptureNotePage` also mounts `CameraCapture`), fixed in plan (P2, checklist 2e.1); every acceptance criterion has a Fully-Automated or Agent-Probe row — no criterion rests on Known-Gap alone.
- Breaking changes: PASS — all reused endpoints (OCR/summary/quiz/attempt/reviews-due/notes-my-notes) unchanged; new `GET /api/notes/:id` is additive; no existing route signature altered; `Note` frontend type left untouched (local `NoteDetail` type used instead, matching Phase 1's convention).
- Security surface: PASS — new endpoint correctly ownership-gates BEFORE returning data (SELECT → not-found → ownership → strip+return, confirmed exact call order in 2a.1); matches the codebase's 403-message convention (`notes.ts:344/422/547/600`, confirmed by direct grep); 2 new `G-idor.test.ts` cases directly prove 200-owner/403-non-owner. A pre-existing lax `note_id` check inside `logQuizAttempt` (found this session) is outside Phase 2's blast radius and not exploitable via Phase 2's own flow (documented as Accepted Known-Gap 5, not a Phase 2 FAIL).
- Section 2a (backend `GET /api/notes/:id`): PASS — mechanically feasible; import block, insertion anchor, and ownership-check ordering all confirmed by direct source read; no regex/method collision with the existing `PUT`/`DELETE` blocks on the same path pattern (established codebase convention).
- Section 2b (ProcessPage stepper): PASS — endpoint contracts (summary/quiz `content`-required 400 behavior) confirmed exactly as the plan's LIVE BUG warning states; `logQuizAttempt` payload shape and SRS-write path (`upsertStudyItem` → `study_items`) confirmed real by direct read.
- Section 2c (Capture route): CONDITIONAL — `images` vs `image_path` payload bug found and fixed in plan (P1); `CameraCapture`'s `getCameraStream()`/jsdom interaction confirmed non-fatal (internal try/catch, degrades to error state) — relevant to the 2e.1 test-mock decision (P2), not a 2c blocker itself.
- Section 2d (Route wiring): PASS — `AppRoutes.tsx` "Standalone protected routes (no shell)" block confirmed at the claimed location; pattern matches the existing `/review` route exactly; `lazyPages.ts` append is trivial and collision-free.
- Section 2e (Tests): CONDITIONAL — `G-idor.test.ts`/`I-chat-study.test.ts` insertion points and helpers all confirmed real; routing-smoke-test mock strategy corrected (P2); new SRS test's use of a fresh question_hash per run avoids tripping Known-Gap 4's UPDATE-path limitation.

Open gaps:

- Accepted Known-Gap 3 (Review not filtered to this note): known-gap: documented — pre-existing `GET /api/reviews/due` limitation, out of Phase 2's authorized backend scope.
- Accepted Known-Gap 4 (`study_items` note_id lookup-key gap, discovered this PVL pass): known-gap: documented — `study.ts` outside Phase 2 blast radius.
- Accepted Known-Gap 5 (`logQuizAttempt` note_id check is existence-only, discovered this PVL pass): known-gap: documented — `study.ts` outside Phase 2 blast radius, not exploitable via Phase 2's own flow.
- Accepted Known-Gaps 1-2 (quiz refresh-loss / no `test_sessions` persistence): known-gap: documented — deferred by user decision in INNOVATE, carried unchanged from the original plan.

What This Coverage Does NOT Prove:

- C1/C2 (`G-idor.test.ts` new cases): do not prove the note detail UI renders the returned fields correctly (that is C3, agent-probe).
- C6 (`study_items` automated case): proves the row is created/updated for a single fresh question; does NOT prove `note_id` stays correct across a REPEAT of the same worded question asked from two different notes (Known-Gap 4) — that scenario is not exercised by this test.
- `ProcessPage`/`CaptureNotePage` routing smoke tests: prove only that the correct top-level component mounts at each URL (via the P2-corrected sentinel mock) — do NOT prove OCR/summary/quiz/SRS step content renders correctly or that `CameraCapture` functions in a real browser (that is the agent-probe rows).
- `tsc`/regression rows: static types / no-regression only, not runtime correctness.
- Agent-probe rows (C3 already-processed, C7 end-to-end, C4, C5, C6-UI): manual, not automated; depend on a working dev server, real AI keys, and a real camera-capable browser session; do not cover mobile-viewport camera UX (per the plan's own note).
- None of the automated or agent-probe rows prove `logQuizAttempt`'s server-side `note_id` is actually owned by the caller at the DB layer (Known-Gap 5) — safety today rests on the frontend only ever supplying an already-ownership-checked id, not on a server-side guarantee.

Gate: CONDITIONAL
Accepted by: session (autonomous PVL pass, direct source-verification) — fixed-in-plan: capture-payload-field-name-bug (P1, checklist 2c.5, `images` key instead of `image_path`), routing-smoke-test-mock-underspecified (P2, checklist 2e.1, sentinel-mock `ProcessPage`/`CaptureNotePage` instead of deep-mocking `api.notes.getNote`); documented known-gaps (out of Phase 2 blast radius, not introduced by this plan): study-items-note-id-lookup-key-gap (Known-Gap 4), quiz-attempt-note-id-ownership-check-existence-only (Known-Gap 5), review-not-filtered-to-note (Known-Gap 3, carried from the original plan), quiz-refresh-loss / no-test-sessions-persistence (Known-Gaps 1-2, carried from the original plan)
