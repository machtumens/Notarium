import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { I } from '@/components/ui/icons';
import { Pill } from '@/components/ui/pill';
import { api, topNotes, type Note } from '@/lib/api';
import { COMMONS, CONTRIBUTORS } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

// Content under a rule, not a box. `BAND` is the primary rule, `QUIET` the one a repeated cell gets
// so twenty-four of them do not shout; its hover darkens the rule rather than tinting the cell.
const BAND = 'border-t border-ink pt-4 flex flex-col';
const QUIET = 'border-t border-neutral-300 hover:border-ink';
const slot = cn(buttonVariants({ variant: 'slot' }), 'px-4 py-2 text-[13px]');
// A subject is a kicker over the headline, not a chip, and it keeps its own case — FISIKA is not a word.
const KICK = 'text-[11px] font-extrabold tracking-[0.06em] text-neutral-600';

/** One card shape for both the demo entries and real notes. */
type Card = {
  id: string | number;
  subjectId?: number;
  subject: string;
  title: string;
  author: string;
  votes: number;
  meta: string;
};
const fromNote = (n: Note): Card => ({
  id: n.id,
  subjectId: n.subject_id,
  subject: n.subject_name ?? '',
  title: n.title,
  author: `${n.author_name ?? 'Anonymous'}${n.author_class ? ` · kelas ${n.author_class}` : ''}`,
  votes: (n.likes ?? 0) + (n.admin_upvotes ?? 0),
  meta: n.created_at.slice(0, 10),
});
const DEMO: Card[] = COMMONS.map((c) => ({
  id: c.title,
  subject: c.subject,
  title: c.title,
  author: c.author,
  votes: c.votes,
  meta: c.pages,
}));

/** Card-shaped placeholder while the commons load — same grid cell, muted blocks. */
const SkeletonCard = () => (
  <div
    aria-hidden
    className="border-t border-neutral-300 pt-4 pb-1 flex flex-col gap-2.5 min-h-[168px] animate-pulse"
  >
    <span className="h-[14px] w-[76px] bg-neutral-200" />
    <span className="h-[20px] w-4/5 bg-neutral-200" />
    <span className="h-[20px] w-3/5 bg-neutral-200" />
    <span className="h-[14px] w-2/5 bg-neutral-200 mt-auto" />
    <span className="h-[14px] w-1/3 bg-neutral-200" />
  </div>
);

/** Knowledge commons: real subjects / notes / leaderboard for signed-in accounts, the design's demo data for guests. */
export function Discover() {
  const nav = useNavigate();
  const { isUser, session } = useApp();
  const [filter, setFilter] = useState(isUser ? 'All subjects' : 'Kelas 10');
  const [q, setQ] = useState('');

  const subjects = useAsync(() => api.subjects(), [], isUser);
  const notes = useAsync(
    () => topNotes(subjects.data ?? [], 24),
    [subjects.data],
    isUser && !!subjects.data,
  );
  const search = useAsync(() => api.notes.search(q), [q], isUser && q.trim().length > 1);
  const leaders = useAsync(() => api.leaderboard(), [], isUser);

  const filters = useMemo(
    () => [
      'All subjects',
      ...(subjects.data ?? []).filter((s) => s.note_count > 0).map((s) => s.name),
      'Most upvoted',
    ],
    [subjects.data],
  );
  const searching = q.trim().length > 1;
  const live = isUser && !!notes.data;
  // Account-only view state: the first failure wins and carries its own retry; loading = nothing to show yet.
  const failure = !isUser
    ? null
    : subjects.error
      ? { message: subjects.error, retry: subjects.retry }
      : notes.error
        ? { message: notes.error, retry: notes.retry }
        : searching && search.error
          ? { message: search.error, retry: search.retry }
          : null;
  const loading =
    isUser && !failure && (!notes.data || (searching && !search.data && search.loading));
  const cards: Card[] = useMemo(() => {
    if (!live) return DEMO;
    let list = (q.trim().length > 1 && search.data ? search.data : (notes.data ?? [])).map(
      fromNote,
    );
    if (filter !== 'All subjects' && filter !== 'Most upvoted')
      list = list.filter((c) => c.subject === filter);
    if (filter === 'Most upvoted') list = [...list].sort((a, b) => b.votes - a.votes);
    return list;
  }, [live, notes.data, search.data, q, filter]);

  const totalNotes = (subjects.data ?? []).reduce((n, s) => n + s.note_count, 0);
  const rank =
    leaders.data && session?.kind === 'user'
      ? leaders.data.findIndex((l) => l.display_name === session.user.name) + 1
      : 0;
  const openNote = (c: Card) =>
    nav(typeof c.id === 'number' ? `/app/notes?note=${c.id}&subject=${c.subjectId}` : '/app/notes');

  return (
    <div data-screen-label="Discover" className="flex flex-wrap gap-x-10 gap-y-9 items-start">
      <div className="flex-[100_1_400px] min-w-[min(100%,320px)] flex flex-col gap-7">
        {/* The masthead: the count is the headline, so it is set as a figure rather than wrapped in a panel. */}
        <div className={cn(BAND, 'gap-2.5 items-start')}>
          <span className="meta">Ink garden</span>
          <h3 data-num className="text-[clamp(24px,3.2vw,40px)] max-w-[38ch] [text-wrap:balance]">
            {live
              ? `${totalNotes.toLocaleString('id-ID')} notes published across ${(subjects.data ?? []).length} subjects`
              : '1,284 notes published by kelas 10 this week'}
          </h3>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex-1 min-w-[240px] flex items-center gap-2.5 border border-neutral-400 px-4 py-2.5 text-[15px] focus-within:border-ink">
            <I.search size={18} className="text-neutral-600" />
            <label htmlFor="discover-search" className="sr-only">
              Search notes, topics and schools
            </label>
            <input
              id="discover-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search notes, topics, schools…"
              disabled={!isUser}
              className="flex-1 min-w-0 bg-transparent border-0 text-ink placeholder:text-neutral-600 focus:outline-none disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:hidden"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQ('')}
                className="w-6 h-6 flex items-center justify-center text-neutral-600 cursor-pointer hover:bg-ink hover:text-accent-100"
              >
                <I.x size={15} />
              </button>
            )}
          </div>
          {(live ? filters : ['Kelas 10', 'Kimia', 'Fisika', 'Most upvoted']).map((f) => (
            <Pill key={f} on={filter === f} onClick={() => setFilter(f)}>
              {f}
            </Pill>
          ))}
        </div>

        {failure && (
          <div
            role="alert"
            className="border-t-2 border-ink pt-4 flex items-center gap-4 flex-wrap"
          >
            <p className="flex-1 min-w-[220px] text-[14px] font-semibold text-ink [text-wrap:pretty]">
              {failure.message}
            </p>
            <button type="button" onClick={failure.retry} className={slot}>
              Retry
            </button>
          </div>
        )}
        {live && !loading && cards.length === 0 && (
          <p role="status" className="text-[14px] text-neutral-700">
            {searching
              ? `Nothing matched '${q.trim()}' — try a topic or a subject`
              : 'Nothing here yet — pick another filter.'}
          </p>
        )}

        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-8 gap-y-7"
          aria-busy={loading || undefined}
        >
          {loading && Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
          {(loading || failure ? [] : live ? cards : DEMO).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openNote(c)}
              className={cn(
                'text-left bg-transparent pt-4 pb-1 cursor-pointer flex flex-col gap-2.5 min-h-[168px]',
                QUIET,
              )}
            >
              <span className={KICK}>{c.subject}</span>
              <span className="text-[18px] font-extrabold leading-[1.2] tracking-[-0.025em] text-ink [text-wrap:pretty]">
                {c.title}
              </span>
              <span className="text-[13px] text-neutral-700 mt-auto">{c.author}</span>
              <span className="flex items-baseline gap-3 text-[13px]">
                <span data-num className="font-extrabold text-ink">
                  {c.votes} {live ? 'likes' : 'saves'}
                </span>
                <span data-num className="font-semibold text-neutral-600">
                  {c.meta}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-[1_1_280px] min-w-[min(100%,265px)] max-w-[360px] flex flex-col gap-7">
        <div className={cn(BAND, 'gap-3')}>
          <h4 className="text-[18px]">Top contributors</h4>
          {(leaders.data
            ? leaders.data
                .slice(0, 4)
                .map((l) => ({
                  initials: l.display_name.trim().slice(0, 2).toUpperCase(),
                  name: l.display_name.trim(),
                  school: l.class ? `Kelas ${l.class}` : 'Notarium',
                  xp: `${l.points} pts`,
                }))
            : CONTRIBUTORS
          ).map((p) => (
            <div key={p.name} className="flex items-center gap-3">
              <span className="w-[30px] h-[30px] rounded-full bg-ink text-accent-100 flex items-center justify-center text-[12px] font-extrabold flex-[0_0_30px]">
                {p.initials}
              </span>
              <div className="flex-1 min-w-0 leading-[1.3]">
                <div className="text-[14px] font-bold text-ink truncate">{p.name}</div>
                <div className="text-[12px] text-neutral-600">{p.school}</div>
              </div>
              <span data-num className="text-[13px] font-extrabold text-ink">
                {p.xp}
              </span>
            </div>
          ))}
        </div>

        <div className={cn(BAND, 'gap-2')}>
          <span className="meta">Your standing</span>
          <span data-num className="text-[clamp(32px,5vw,64px)] font-extrabold leading-none">
            {rank ? `#${rank}` : '#7'}
          </span>
          <p className="text-[14px] leading-[1.5] text-neutral-700 [text-wrap:pretty]">
            {rank && leaders.data
              ? `on the Notarium leaderboard with ${leaders.data[rank - 1].points} learning points.`
              : 'in kelas 10 at SMAN 4. Two notes away from the top five.'}
          </p>
          <button
            type="button"
            onClick={() => nav('/app/notes')}
            className={cn('mt-2 self-start', slot)}
          >
            Publish a note
          </button>
        </div>
      </div>
    </div>
  );
}
