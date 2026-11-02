# Archive: the demo screens (Nov 2026)

Everything here was taken out of the live app on 2 Nov 2026. None of it is built, tested or
shipped: it sits outside `src/`, so Vite, `tsc`, Vitest and ESLint never see it. Git history has
it too; this folder is the easy-to-find copy.

What it was: the "Adaptive learning" design prototype. Guests saw it with sample data (the
Stoikiometri / Kimia learner, tutor Paul, mastery bars); signed-in accounts were redirected away
from most of it because nothing behind it existed on the worker.

| Path                                                                                   | What it was                                                                                           |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pages/ai.tsx`                                                                         | AI chat surface — canned replies, no backend                                                          |
| `pages/practice.tsx`                                                                   | Practice drill — fixed question set                                                                   |
| `pages/progress.tsx`                                                                   | Learning graph / mastery tree — sample data                                                           |
| `pages/tutors.tsx`, `components/tutors-booking*`                                       | Tutor board, calendar, booking dialog                                                                 |
| `pages/session.tsx`                                                                    | Live tutor session (before / during / after)                                                          |
| `pages/mobile.tsx`                                                                     | Phone mock-up of the demo                                                                             |
| `pages/customize.tsx`                                                                  | Adaptive mode, theme, background, module grid (theme/background were already dead UI)                 |
| `pages/onboard.tsx`                                                                    | Old password signup + guest door (sign-in is Google only)                                             |
| `lib/data.ts`                                                                          | All the sample data, including every Stoikiometri string                                              |
| `lib/themes.ts`, `components/backgrounds/horizon-glow*`                                | Theme palettes and the canvas glow                                                                    |
| `lib/use-ai-chat*`, `components/ui/ruixen-moon-chat.tsx`, `components/ui/textarea.tsx` | Chat plumbing                                                                                         |
| `components/ui/area-chart-card.tsx`                                                    | Progress chart                                                                                        |
| `before/`                                                                              | The account pages as they were just before the rewrite (Home, Discover, Notes, Create, Shell, store…) |
| `App.lazy.test.tsx`, `pages/buttons.test.tsx`, `e2e/`                                  | Tests that only covered the screens above                                                             |

To bring one back: move it into `src/`, restore its route in `src/App.tsx` and its imports from
`lib/data.ts`, and give it a real worker route before an account can see it.
