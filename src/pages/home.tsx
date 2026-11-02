import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { I } from '@/components/ui/icons';
import { api, type Note } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { HOME_TOP, useApp } from '@/store';

// Content under a rule, not a box: BAND is the primary rule, ROW the quiet one between items.
const BAND = 'border-t border-ink pt-4 flex flex-col gap-3 min-w-0';
const ROW = 'border-b border-neutral-300';
const LINK =
  'self-start text-[13px] font-extrabold text-ink underline underline-offset-[3px] decoration-neutral-400 hover:decoration-ink';

export const noteHref = (n: Pick<Note, 'id'>) => `/app/notes?note=${n.id}`;
const day = (n: Note) => n.created_at.slice(0, 10);
const likes = (n: Note) => (n.likes ?? 0) + (n.admin_upvotes ?? 0);

/** A list that is loading, failed, empty or full — the four states every Home list has. */
function NoteList({
  q,
  empty,
  meta,
}: {
  q: { data: Note[] | null; loading: boolean; error: string | null; retry: () => void };
  empty: React.ReactNode;
  meta: (n: Note) => string;
}) {
  if (q.error)
    return (
      <p role="alert" className="text-[14px] text-neutral-800">
        {q.error}{' '}
        <button
          type="button"
          onClick={q.retry}
          className={cn(LINK, 'border-0 bg-transparent p-0 cursor-pointer')}
        >
          Retry
        </button>
      </p>
    );
  if (!q.data)
    return (
      <div aria-busy="true" className="flex flex-col gap-3 animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-4 bg-neutral-200', i % 2 ? 'w-3/5' : 'w-4/5')} />
        ))}
      </div>
    );
  if (!q.data.length) return <p className="text-[14px] text-neutral-700">{empty}</p>;
  return (
    <ul className="flex flex-col">
      {q.data.map((n) => (
        <li key={n.id} className={ROW}>
          <Link
            to={noteHref(n)}
            className="flex items-baseline gap-3 py-3 text-ink no-underline hover:no-underline group"
          >
            <span className="flex-1 min-w-0 text-[15px] font-semibold truncate group-hover:underline underline-offset-[3px]">
              {n.title}
            </span>
            <span
              data-num
              className="flex-none text-[12px] font-semibold text-neutral-600 whitespace-nowrap"
            >
              {meta(n)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Home: search, the note you were last on, your numbers, your notes, and the most-liked community notes. */
export function Home() {
  const { session } = useApp();
  const nav = useNavigate();
  const user = session?.kind === 'user' ? session.user : null;
  const [q, setQ] = useState('');

  // The store already started these two during the session check, so they usually land with it.
  const mine = useAsync(
    () =>
      // my-notes is grouped by subject; newest first. created_at is whole seconds, so ties go to the higher id.
      api.notes
        .mine()
        .then((ns) =>
          [...ns].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id),
        ),
    [],
  );
  const top = useAsync(() => api.notes.top(HOME_TOP), []);
  const leaders = useAsync(() => api.leaderboard(), []);
  const rank =
    user && leaders.data ? leaders.data.findIndex((l) => l.display_name === user.name) + 1 : 0;
  const latest = mine.data?.[0];

  const search = (e: FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    nav(t ? `/app/discover?q=${encodeURIComponent(t)}` : '/app/discover');
  };

  return (
    <div data-screen-label="Home" className="flex flex-col gap-8">
      <form role="search" onSubmit={search} className="flex items-stretch gap-2">
        <label className="flex-1 min-w-0 flex items-center gap-2.5 border border-neutral-400 px-4 py-3 text-[15px] focus-within:border-ink">
          <I.search size={18} className="text-neutral-600 flex-none" />
          <span className="sr-only">Search notes</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search every published note…"
            className="flex-1 min-w-0 bg-transparent border-0 text-ink placeholder:text-neutral-600 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className={cn(buttonVariants({ variant: 'slot' }), 'px-5 text-[14px]')}
        >
          Search
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-8">
        {/* The screen's one inverted block: the thing to do next. */}
        <section className="lg:col-span-8 bg-ink text-accent-100 px-5 py-7 md:px-8 md:py-9 flex flex-col gap-3 min-h-[200px]">
          <span className="meta text-accent-300">
            {latest ? 'Pick up where you left off' : 'Start here'}
          </span>
          {mine.error ? (
            <p className="text-[15px] text-accent-300">Your notes did not load. {mine.error}</p>
          ) : !mine.data ? (
            <span aria-busy="true" className="h-9 w-2/3 bg-accent-600/40 animate-pulse" />
          ) : (
            <>
              <h2 className="text-[clamp(22px,3vw,36px)] text-accent-100 max-w-[30ch] [text-wrap:balance]">
                {latest ? latest.title : 'Write your first note'}
              </h2>
              <p className="text-[14.5px] text-accent-300">
                {latest
                  ? `${latest.subject_name ?? 'No subject'} · ${latest.status === 'draft' ? 'draft' : 'published'} · ${day(latest)}`
                  : 'Notes stay yours until you choose to publish them.'}
              </p>
              <div className="flex gap-3 flex-wrap mt-auto pt-3">
                <Link
                  to={latest ? noteHref(latest) : '/app/create'}
                  className={cn(
                    buttonVariants({ variant: 'dark' }),
                    'px-6 py-3 text-[15px] no-underline hover:no-underline',
                  )}
                >
                  {latest ? 'Open note' : 'Start writing'}
                </Link>
                {latest && (
                  <Link
                    to="/app/create"
                    className="inline-flex items-center px-4 py-3 text-[14px] font-bold text-accent-100 border border-accent-300 no-underline hover:no-underline hover:bg-accent-600"
                  >
                    New note
                  </Link>
                )}
              </div>
            </>
          )}
        </section>

        <section className={cn(BAND, 'lg:col-span-4')}>
          <h2 className="meta">Your numbers</h2>
          <dl className="grid grid-cols-3 gap-4">
            {[
              { n: String(user?.notes_count ?? 0), l: 'notes' },
              { n: String(user?.total_likes ?? 0), l: 'likes' },
              { n: rank ? `#${rank}` : '—', l: 'rank' },
            ].map((s) => (
              <div key={s.l}>
                <dd data-num className="text-[clamp(26px,3.2vw,38px)] font-extrabold leading-none">
                  {s.n}
                </dd>
                <dt className="meta mt-1.5">{s.l}</dt>
              </div>
            ))}
          </dl>
          <p className="text-[13.5px] leading-[1.5] text-neutral-700 [text-wrap:pretty]">
            {rank
              ? `Ranked #${rank} of ${leaders.data?.length ?? 0} on the leaderboard.`
              : 'Publishing notes and earning likes puts you on the leaderboard.'}
          </p>
        </section>

        <section className={cn(BAND, 'lg:col-span-6')}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[19px]">Your notes</h2>
            <span data-num className="meta">
              {mine.data ? `${mine.data.length} total` : ''}
            </span>
          </div>
          <NoteList
            q={{ ...mine, data: mine.data?.slice(0, 6) ?? null }}
            empty={
              <>
                Nothing yet. <Link to="/app/create">Write one</Link>.
              </>
            }
            meta={(n) => `${n.status === 'draft' ? 'draft' : 'published'} · ${day(n)}`}
          />
          <Link to="/app/notes" className={LINK}>
            All my notes
          </Link>
        </section>

        <section className={cn(BAND, 'lg:col-span-6')}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[19px]">Most liked</h2>
            <span className="meta">community</span>
          </div>
          <NoteList
            q={top}
            empty="Nothing published yet. Be the first."
            meta={(n) => `${n.subject_name ?? 'Notes'} · ${likes(n)} likes`}
          />
          <Link to="/app/discover" className={LINK}>
            Explore all notes
          </Link>
        </section>
      </div>
    </div>
  );
}
