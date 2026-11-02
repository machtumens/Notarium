# Notarium features: what exists, and what to do with each (2 Nov 2026)

Comparable tools referred to below: Studocu (shared notes by course, upvotes), Knowt and Quizlet
(notes to flashcards and practice tests), Anki and RemNote (spaced repetition), Notion (block
editor). What they do is from general knowledge, not checked this session: both web-search
connectors failed with 401s.

## Live in the app (signed-in students)

| Feature                               | Now                                                                           | Suggestion                                                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google sign-in                        | One button, worker does OAuth                                                 | Keep. Next: remember the last account so a returning student skips Google's account chooser (`prompt=none` when a session cookie exists).                                                                                    |
| Profile step (class + focus subjects) | Gate after first sign-in; editable on Profile                                 | Use focus subjects to order Discover and Home ("Most liked in your subjects"). Today they are stored and unused.                                                                                                             |
| Home                                  | Search, continue latest note, your numbers, your notes, most liked            | Add "Due for review" once flashcards exist (Anki/RemNote's core loop). That turns Home into a daily habit, not just a list.                                                                                                  |
| Discover                              | Most-liked notes, subject filter, search, top contributors                    | Add sort: Newest / Most liked / My class. Show a 2-line preview of each note (Studocu shows a page thumbnail). Paginate past 48.                                                                                             |
| Note viewer                           | Read note, like it                                                            | Add "Make flashcards from this note" (Knowt's headline feature) and "Copy to my notes" (fork, the old remix idea done properly). Show author photo once photos are served as URLs, not base64.                               |
| Create                                | Block editor (heading / paragraph / formula), audience, draft kept in the tab | Edit and delete a published note (the worker has PUT and DELETE; the UI has neither). Image upload with OCR (worker supports it; untested since DeepSeek and Vision setup). Autosave drafts to the server, not just the tab. |
| Leaderboard / standing                | Rank by learning points                                                       | Make it per class and per week, or it stops moving for everyone not in the top five.                                                                                                                                         |
| Admin dashboard                       | People, content, school, system, nodes                                        | Not reviewed this round.                                                                                                                                                                                                     |

## Worker features with no screen yet

| Feature                                               | Worker                                          | Suggestion                                                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AI summary, quiz, Primer, study plan, concept explain | Routes exist; DeepSeek has no credit (STATE.md) | Fix the key first. Then one button per note: "Quiz me" (5 questions from the note). That is the single most valuable AI feature for a student. |
| Peer tutors and booking                               | `routes/tutors.ts` exists                       | Only rebuild once a real tutor list exists. The archived demo shows the intended shape.                                                        |
| 2FA, refresh tokens                                   | Live                                            | Nothing to add in the UI for students.                                                                                                         |

## Archived (removed from the app, kept in `archive/demo-2026-11/`)

Practice, Progress, Tutors, Session, AI chat, Customize, Mobile mock-up, password onboarding,
guest demo. All ran on sample data. Practice and AI chat are worth rebuilding on real data, in
this order: flashcards from a note → spaced review on Home → quiz from a note.

## Speed: what was slow, and what changed

| Was                                                                                                                         | Now                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Home asked each subject for all its notes (12 requests, full bodies + a base64 author photo on every row) to find the top 5 | One `GET /api/notes/top` with list fields only               |
| Leaderboard was 490 KB (base64 photos nobody drew)                                                                          | Photos dropped unless they are real URLs (about 10 KB)       |
| Opening a note downloaded every note in its subject                                                                         | One `GET /api/notes/:id/view`                                |
| Home's lists waited for the session check                                                                                   | Started alongside it, on load and right after Google sign-in |
| JS and CSS re-validated on every visit (`max-age=0`)                                                                        | Hashed assets cached for a year                              |
| Every API call read the maintenance flag from KV uncached                                                                   | Cached at the edge for 60 s                                  |
| Main bundle 381 KB                                                                                                          | 310 KB (the demo screens and sample data are gone)           |
