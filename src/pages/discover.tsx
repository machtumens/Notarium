import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { I } from '@/components/ui/icons';
import { Pill } from '@/components/ui/pill';
import { api, type Note } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';
import { noteHref } from '@/pages/home';

const BAND = 'border-t border-ink pt-4 flex flex-col';
const slot = cn(buttonVariants({ variant: 'slot' }), 'px-4 py-2 text-[13px]');
// A subject is a kicker over the headline, not a chip, and it keeps its own case.
const KICK = 'text-[11px] font-extrabold tracking-[0.06em] text-neutral-600';
const LIST_SIZE = 48;

const SkeletonCard = () => (
  <div
    aria-hidden
    className="border-t border-neutral-300 pt-4 pb-1 flex flex-col gap-2.5 min-h-[150px] animate-pulse"
  >
    <span className="h-[14px] w-[76px] bg-neutral-200" />
    <span className="h-[20px] w-4/5 bg-neutral-200" />
    <span className="h-[14px] w-2/5 bg-neutral-200 mt-auto" />
  </div>
);

/**
 * Discover: every note the reader may see, most-liked first. The subject and the search live in the URL
 * (`?subject=`, `?q=`), so Home's search box and the sidebar's subject rows link straight in, and Back works.
 */
export function Discover() {
  const { session } = useApp();
  const [params, setParams] = useSearchParams();
  const subjectId = Number(params.get('subject')) || 0;
  const urlQ = params.get('q') ?? '';
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);

  // Search waits for a 250 ms pause in typing, then lands in the URL.
  useEffect(() => {
    if (q === urlQ) return;
    const id = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (q.trim()) next.set('q', q.trim());
      else next.delete('q');
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(id);
  }, [q, urlQ, params, setParams]);
  const pick = (id: number) => {
    const next = new URLSearchParams(params);
    if (id) next.set('subject', String(id));
    else next.delete('subject');
    setParams(next);
  };

  const searching = urlQ.trim().length > 1;
  const subjects = useAsync(() => api.subjects(), []);
  const list = useAsync(
    () => (searching ? api.notes.search(urlQ.trim()) : api.notes.top(LIST_SIZE, subjectId)),
    [searching, urlQ, subjectId],
  );
  const leaders = useAsync(() => api.leaderboard(), []);

  // Search results come back across subjects; a picked subject still narrows them.
  const notes: Note[] = (list.data ?? []).filter(
    (n) => !searching || !subjectId || n.subject_id === subjectId,
  );
  const subjectName = (n: Note) =>
    n.subject_name ?? subjects.data?.find((s) => s.id === n.subject_id)?.name ?? '';
  const totalNotes = (subjects.data ?? []).reduce((n, s) => n + s.note_count, 0);
  const me = session?.kind === 'user' ? session.user.name : '';
  const rank = leaders.data ? leaders.data.findIndex((l) => l.display_name === me) + 1 : 0;

  return (
    <div data-screen-label="Discover" className="flex flex-wrap gap-x-10 gap-y-8 items-start">
      <div className="flex-[100_1_400px] min-w-[min(100%,300px)] flex flex-col gap-5">
        <div className="flex items-center gap-2.5 border border-neutral-400 px-4 py-3 text-[15px] focus-within:border-ink">
          <I.search size={18} className="text-neutral-600 flex-none" />
          <label htmlFor="discover-search" className="sr-only">
            Search notes
          </label>
          <input
            id="discover-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              totalNotes ? `Search ${totalNotes} notes — title, topic, author…` : 'Search notes…'
            }
            className="flex-1 min-w-0 bg-transparent border-0 text-ink placeholder:text-neutral-600 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ('')}
              className="w-7 h-7 flex items-center justify-center text-neutral-600 cursor-pointer border-0 bg-transparent hover:bg-ink hover:text-accent-100"
            >
              <I.x size={15} />
            </button>
          )}
        </div>

        {/* One row that scrolls sideways on a phone instead of wrapping into four. */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
          <Pill on={!subjectId} onClick={() => pick(0)}>
            All subjects
          </Pill>
          {(subjects.data ?? [])
            .filter((s) => s.note_count > 0)
            .map((s) => (
              <Pill key={s.id} on={subjectId === s.id} onClick={() => pick(s.id)}>
                {s.name}
              </Pill>
            ))}
        </div>

        {list.error && (
          <div
            role="alert"
            className="border-t-2 border-ink pt-4 flex items-center gap-4 flex-wrap"
          >
            <p className="flex-1 min-w-[220px] text-[14px] font-semibold text-ink">{list.error}</p>
            <button type="button" onClick={list.retry} className={slot}>
              Retry
            </button>
          </div>
        )}
        {list.data && notes.length === 0 && (
          <p role="status" className="text-[14px] text-neutral-700">
            {searching
              ? `Nothing matched '${urlQ.trim()}' — try a topic or a subject.`
              : 'Nothing published here yet.'}
          </p>
        )}

        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-8 gap-y-6"
          aria-busy={list.loading || undefined}
        >
          {list.loading &&
            !list.data &&
            Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
          {notes.map((n) => (
            <Link
              key={n.id}
              to={noteHref(n)}
              className="text-left pt-4 pb-1 flex flex-col gap-2 min-h-[150px] border-t border-neutral-300 hover:border-ink text-ink no-underline hover:no-underline"
            >
              <span className={KICK}>{subjectName(n)}</span>
              <span className="text-[17px] font-extrabold leading-[1.2] tracking-[-0.025em] [text-wrap:pretty]">
                {n.title}
              </span>
              <span className="text-[13px] text-neutral-700 mt-auto">
                {n.author_name ?? 'Anonymous'}
                {n.author_class ? ` · kelas ${n.author_class}` : ''}
              </span>
              <span className="flex items-baseline gap-3 text-[13px]">
                <span data-num className="font-extrabold">
                  {(n.likes ?? 0) + (n.admin_upvotes ?? 0)} likes
                </span>
                <span data-num className="font-semibold text-neutral-600">
                  {n.created_at.slice(0, 10)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <aside className="flex-[1_1_260px] min-w-[min(100%,250px)] max-w-[340px] flex flex-col gap-7">
        <div className={cn(BAND, 'gap-3')}>
          <h2 className="text-[18px]">Top contributors</h2>
          {!leaders.data && !leaders.error && (
            <span className="h-24 bg-neutral-100 animate-pulse" aria-hidden />
          )}
          {leaders.error && (
            <p className="text-[13px] text-neutral-700">Leaderboard unavailable.</p>
          )}
          {(leaders.data ?? []).slice(0, 5).map((l, i) => (
            <div key={`${l.display_name}-${i}`} className="flex items-center gap-3">
              <span data-num className="w-5 text-[13px] font-extrabold text-neutral-600">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0 leading-[1.3]">
                <div className="text-[14px] font-bold text-ink truncate">
                  {l.display_name.trim()}
                </div>
                <div className="text-[12px] text-neutral-600">
                  {l.class ? `Kelas ${l.class}` : 'Notarium'}
                </div>
              </div>
              <span data-num className="text-[13px] font-extrabold text-ink">
                {l.points} pts
              </span>
            </div>
          ))}
        </div>

        {leaders.data && (
          <div className={cn(BAND, 'gap-2')}>
            <span className="meta">Your standing</span>
            <span data-num className="text-[clamp(32px,4vw,52px)] font-extrabold leading-none">
              {rank ? `#${rank}` : '—'}
            </span>
            <p className="text-[14px] leading-[1.5] text-neutral-700 [text-wrap:pretty]">
              {rank
                ? `with ${leaders.data[rank - 1].points} learning points.`
                : 'Publish a note to get on the board.'}
            </p>
            <Link
              to="/app/create"
              className={cn('mt-2 self-start no-underline hover:no-underline', slot)}
            >
              Publish a note
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
