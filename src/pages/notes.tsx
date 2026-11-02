import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { api, noteText, type Note } from '@/lib/api';
import { noteSummary, textToBlocks, type Block } from '@/lib/blocks';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

const primary = buttonVariants({ variant: 'primary' });
const slot = buttonVariants({ variant: 'slot' });

/** One note block: heading, formula on its left rule, or paragraph — the same skins as the Create editor. */
const BlockView = ({ b }: { b: Block }) =>
  b.kind === 'h' ? (
    <h3 className="text-[clamp(20px,2.4vw,28px)] max-w-[36ch] [text-wrap:pretty]">{b.text}</h3>
  ) : b.kind === 'f' ? (
    <div className="border-l-[3px] border-ink pl-5 py-1 font-heading font-bold tracking-[-0.02em] text-[clamp(20px,2.4vw,28px)] text-ink overflow-x-auto">
      {b.text}
    </div>
  ) : (
    <p className="text-[17px] leading-[1.65] text-neutral-900 max-w-[70ch] [text-wrap:pretty] whitespace-pre-line">
      {b.text}
    </p>
  );

/** The open note: fetched on its own (GET /api/notes/:id/view), so opening one never downloads its whole subject. */
function Article({ id, mineIds }: { id: number; mineIds: Set<number> }) {
  const q = useAsync(() => api.notes.view(id), [id]);
  const [liked, setLiked] = useState<{ on: boolean; n: number } | null>(null);
  useEffect(() => setLiked(null), [id]);
  if (q.error)
    return (
      <div role="alert" className="flex flex-col items-start gap-3 border-t border-ink pt-4">
        <p className="text-[15px] font-semibold">{q.error}</p>
        <button type="button" onClick={q.retry} className={cn(slot, 'px-4 py-2 text-[13px]')}>
          Retry
        </button>
      </div>
    );
  const note: Note | null = q.data;
  if (!note)
    return (
      <div aria-busy="true" className="flex flex-col gap-4 border-t border-ink pt-4 animate-pulse">
        <span className="h-3 w-40 bg-neutral-200" />
        <span className="h-10 w-3/4 bg-neutral-200" />
        <span className="h-4 w-full bg-neutral-200" />
        <span className="h-4 w-5/6 bg-neutral-200" />
      </div>
    );

  const blocks = textToBlocks(noteText(note));
  // The worker fills `summary` with the description sent on create; one that only repeats the body is not shown twice.
  const s = note.summary?.trim();
  const summary = s && s !== blocks[0]?.text.trim() && s !== noteSummary(noteText(note)) ? s : null;
  const own = mineIds.has(note.id);
  const likeState = liked ?? {
    on: !!note.liked_by_me,
    n: (note.likes ?? 0) + (note.admin_upvotes ?? 0),
  };
  const toggleLike = async () => {
    const prev = likeState;
    // Optimistic: flip now, put it back if the worker says no.
    setLiked({ on: !prev.on, n: prev.n + (prev.on ? -1 : 1) });
    try {
      await api.notes.like(note.id);
    } catch {
      setLiked(prev);
    }
  };

  return (
    <>
      <div className="flex items-baseline gap-x-5 gap-y-1.5 flex-wrap border-t border-ink pt-3">
        <span className="meta text-ink">{note.subject_name ?? 'Note'}</span>
        <span data-num className="meta">
          {`${note.status === 'draft' ? 'Draft' : note.status === 'archived' ? 'Archived' : 'Published'} · ${note.created_at.slice(0, 10)}`}
        </span>
        {!own && note.author_name && <span className="meta">by {note.author_name}</span>}
      </div>
      <h2 className="text-[clamp(28px,4.4vw,56px)] max-w-[24ch] [text-wrap:balance]">
        {note.title}
      </h2>
      {summary && (
        <div className="border-l-[3px] border-ink pl-4 flex flex-col gap-1">
          <span className="meta">Summary</span>
          <p className="text-[17px] leading-[1.5] font-semibold text-ink max-w-[70ch]">{summary}</p>
        </div>
      )}
      {blocks.length === 0 && (
        <p className="text-[15px] text-neutral-700">
          This note has no text yet — it may be photo-only.
        </p>
      )}
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
      <div className="flex items-center gap-3 flex-wrap border-t border-neutral-300 pt-4">
        {own ? (
          <span data-num className="text-[14px] font-bold text-neutral-700">
            {likeState.n} likes
          </span>
        ) : (
          <button
            type="button"
            aria-pressed={likeState.on}
            onClick={() => void toggleLike()}
            className={cn(likeState.on ? primary : slot, 'px-5 py-2.5 text-[14px]')}
          >
            {likeState.on ? 'Liked' : 'Like'} · {likeState.n}
          </button>
        )}
        <Link to={`/app/quiz?note=${note.id}`} className={cn(slot, 'px-5 py-2.5 text-[14px]')}>
          Quiz me on this
        </Link>
      </div>
    </>
  );
}

/**
 * My notes: the rail lists your notes; the article shows the one in `?note=` (yours, or one opened from Home
 * or Discover). On a phone the open note comes first and the list follows it.
 */
export function Notes() {
  const nav = useNavigate();
  const loc = useLocation();
  const [params, setParams] = useSearchParams();
  // One-shot confirmation handed over by Create (`state.flash`); the history entry is scrubbed so a reload or Back does not replay it.
  const [flash, setFlash] = useState<string | null>(
    () => (loc.state as { flash?: string } | null)?.flash ?? null,
  );
  useEffect(() => {
    if (!flash) return;
    nav(loc.pathname + loc.search, { replace: true, state: null });
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash]);

  const { isUser } = useApp();
  const mine = useAsync(
    () =>
      api.notes
        .mine()
        .then((ns) =>
          [...ns].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id),
        ),
    [],
    isUser,
  );
  const openId = Number(params.get('note')) || mine.data?.[0]?.id || 0;
  const mineIds = new Set((mine.data ?? []).map((n) => n.id));

  return (
    <div data-screen-label="Note viewer" className="flex flex-wrap gap-x-10 gap-y-7 items-start">
      {flash && (
        <p
          role="status"
          className="w-full border-t-2 border-ink pt-2.5 text-[14px] font-bold text-ink"
        >
          {flash}
        </p>
      )}
      <nav
        aria-label="Your notes"
        className="order-2 min-[900px]:order-1 flex-[1_1_200px] min-w-[min(100%,200px)] min-[900px]:max-w-[260px] border-t border-ink pt-3.5 flex flex-col gap-3"
      >
        <span className="meta">Your notes</span>
        {mine.loading && (
          <div aria-hidden className="flex flex-col gap-2 animate-pulse">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn('h-[14px] bg-neutral-200', i === 1 ? 'w-3/5' : 'w-4/5')}
              />
            ))}
          </div>
        )}
        {mine.error && (
          <div role="alert" className="flex flex-col items-start gap-2.5">
            <span className="text-[14px] font-semibold text-neutral-900">{mine.error}</span>
            <button
              type="button"
              onClick={mine.retry}
              className={cn(slot, 'px-3.5 py-1.5 text-[12.5px]')}
            >
              Retry
            </button>
          </div>
        )}
        {mine.data?.length === 0 && (
          <div className="flex flex-col items-start gap-3">
            <span className="text-[15px] font-extrabold text-ink">No notes yet</span>
            <Link
              to="/app/create"
              className={cn(primary, 'px-4 py-2 text-[13px] no-underline hover:no-underline')}
            >
              Write your first note
            </Link>
          </div>
        )}
        <div className="flex flex-col">
          {(mine.data ?? []).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setParams({ note: String(n.id) })}
              className={cn(
                'flex items-center gap-2.5 w-full text-left border-0 border-t border-neutral-300 px-2 py-2.5 text-[14px] cursor-pointer',
                n.id === openId
                  ? 'bg-ink text-accent-100 font-extrabold'
                  : 'bg-transparent text-neutral-900 font-semibold hover:bg-neutral-100',
              )}
            >
              <span className="flex-1 truncate">{n.title}</span>
              {(n.status === 'draft' || n.status === 'archived') && (
                <span className="meta flex-none">{n.status}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <article className="order-1 min-[900px]:order-2 flex-[100_1_380px] min-w-[min(100%,300px)] flex flex-col gap-6">
        {openId ? (
          <Article id={openId} mineIds={mineIds} />
        ) : (
          !mine.loading && (
            <p className="border-t border-ink pt-4 text-[15px] text-neutral-700">
              Pick a note, or <Link to="/app/discover">find one in Discover</Link>.
            </p>
          )
        )}
      </article>
    </div>
  );
}
