import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { api } from '@/lib/api';
import { blocksToText, noteSummary, type Block } from '@/lib/blocks';
import { drafts, type Draft } from '@/lib/draft';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

const primary = buttonVariants({ variant: 'primary' });
const slot = buttonVariants({ variant: 'slot' });
/** The worker has no school scope, so there are three audiences: a draft, the class, or everyone. */
const AUDIENCES = [
  { id: 'Just me', note: 'Saved as a draft. Only you can see it.' },
  { id: 'My class', note: 'Published to your class only.' },
  { id: 'All of Notarium', note: 'Published to everyone.' },
];
const INSERTABLES: { label: string; kind: Block['kind'] }[] = [
  { label: 'Heading', kind: 'h' },
  { label: 'Paragraph', kind: 'p' },
  { label: 'Formula', kind: 'f' },
];

const BLOCK_SKIN: Record<Block['kind'], string> = {
  h: 'font-heading text-[clamp(22px,3vw,30px)] font-extrabold tracking-[-0.03em] [text-wrap:pretty]',
  p: 'text-[16px] leading-[1.7] text-neutral-900 max-w-[70ch]',
  f: 'border-l-[3px] border-ink px-5 py-2 font-heading font-bold text-[22px] text-ink',
};
const PLACEHOLDER: Record<Block['kind'], string> = {
  h: 'Heading',
  p: 'Write… (Enter for a new paragraph, / to insert a block)',
  f: 'Formula, e.g. n = m / Mr',
};
const LABEL: Record<Block['kind'], string> = { h: 'Heading', p: 'Paragraph', f: 'Formula' };
const blank = (): Block => ({ kind: 'p', text: '' });
/** HH:MM of a draft's `savedAt`, local time. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** The editor as one string, to tell "changed since the last save" from a re-render. */
const editorOf = (title: string, blocks: Block[], subjectId: number, audience: string) =>
  JSON.stringify({ title, blocks, subjectId, audience });
const isEmpty = (title: string, blocks: Block[]) =>
  !title.trim() && !blocks.some((b) => b.text.trim());

/** Create: write the note and publish it from the same screen. The editor is kept in this tab while you type. */
export function Create() {
  const { session } = useApp();
  const nav = useNavigate();
  const userId = session?.kind === 'user' ? session.user.id : null;
  const [audience, setAudience] = useState('My class');

  const subjects = useAsync(() => api.subjects(), []);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([blank()]);
  const insertRef = useRef<HTMLButtonElement>(null);
  const [subjectId, setSubjectId] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const filled = blocks.filter((b) => b.text.trim()).length;
  const missing = [!title.trim() && 'a title', subjectId <= 0 && 'a subject'].filter(
    (m): m is string => !!m,
  );
  const blocker = missing.length ? `Add ${missing.join(' and ')} first.` : null;

  // ponytail: window listener in a useEffect — warns before a reload/close while unsaved blocks exist; in-app navigation is not guarded.
  useEffect(() => {
    if (filled === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [filled]);

  // The editor is kept in this tab's storage (`create:{userId}`, lib/draft.ts) half a second after the last change,
  // plus whatever a debounce did not get to when the page unmounts. A draft found on mount is offered back first —
  // nothing is written until Restore / Discard has been answered. Publishing and Discard forget it.
  const [offer, setOffer] = useState<Draft | null>(() =>
    userId === null ? null : drafts.load(userId),
  );
  const editor = editorOf(title, blocks, subjectId, audience);
  const stored = useRef(editor); // what storage holds (or the untouched editor): a save is due once the editor differs
  const latest = useRef({ userId, offer, title, blocks, subjectId, audience });
  useEffect(() => {
    latest.current = { userId, offer, title, blocks, subjectId, audience };
  });
  const flush = useCallback(() => {
    const { userId, offer, title, blocks, subjectId, audience } = latest.current;
    if (userId === null || offer) return;
    const now = editorOf(title, blocks, subjectId, audience);
    if (now === stored.current) return;
    stored.current = now;
    if (isEmpty(title, blocks)) drafts.clear(userId);
    else drafts.save(userId, { title, blocks, subjectId, audience, savedAt: Date.now() });
  }, []);
  useEffect(() => {
    if (userId === null || offer || editor === stored.current) return;
    const t = setTimeout(flush, 500);
    return () => clearTimeout(t);
  }, [userId, offer, editor, flush]);
  useEffect(() => flush, [flush]); // unmount: save what the debounce did not get to
  const restore = () => {
    if (!offer) return;
    const restored = offer.blocks.length ? offer.blocks : [blank()];
    const restoredAudience = AUDIENCES.some((a) => a.id === offer.audience)
      ? offer.audience
      : audience;
    setTitle(offer.title);
    setBlocks(restored);
    setSubjectId(offer.subjectId);
    setAudience(restoredAudience);
    stored.current = editorOf(offer.title, restored, offer.subjectId, restoredAudience);
    setOffer(null);
  };
  const discard = () => {
    if (userId !== null) drafts.clear(userId);
    stored.current = editor;
    setOffer(null);
  };

  // ponytail: blocks are keyed by index, so focus goes through a DOM id once React has committed; the caret lands at the end.
  const focusBlock = (i: number) =>
    setTimeout(() => {
      const el = document.getElementById(`blk-${i}`) as HTMLTextAreaElement | null;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  const setText = (i: number, text: string) =>
    setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, text } : b)));
  const addBlock = (block: Block, at = blocks.length) => {
    setBlocks((bs) => [...bs.slice(0, at), block, ...bs.slice(at)]);
    focusBlock(at);
  };
  const removeBlock = (i: number) => {
    setBlocks((bs) => bs.filter((_, j) => j !== i));
    focusBlock(Math.max(i - 1, 0));
  };
  /** Enter splits into a new paragraph (formulas keep their newlines), Backspace on an empty block removes it, / on an empty block jumps to the insert row. */
  const onKey = (i: number, b: Block) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && b.kind !== 'f') {
      e.preventDefault();
      addBlock(blank(), i + 1);
    } else if (e.key === 'Backspace' && !b.text && blocks.length > 1) {
      e.preventDefault();
      removeBlock(i);
    } else if (e.key === '/' && !b.text) {
      e.preventDefault();
      insertRef.current?.focus();
    }
  };
  // Auto-grow: index keys reuse textarea nodes on insert/remove, so every block re-measures after each change.
  useLayoutEffect(() => {
    document.querySelectorAll<HTMLTextAreaElement>('[id^="blk-"]').forEach((el) => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [blocks]);

  /**
   * POST /api/notes in main's shape (see `api.notes.create`): the block text goes in `extracted_text` and `content`
   * (always strings, even for an empty body), its plain-text summary is the `description`. 'Just me' saves a draft;
   * 'My class' limits visibility to the class; 'All of Notarium' is public.
   */
  const publish = async () => {
    if (blocker || publishing) {
      setPublishError(blocker);
      return;
    }
    setPublishing(true);
    setPublishError(null);
    const text = blocksToText(blocks);
    try {
      const { note } = await api.notes.create({
        title: title.trim(),
        subject_id: subjectId,
        extracted_text: text,
        content: text,
        description: noteSummary(text),
        tags: [],
        status: audience === 'Just me' ? 'draft' : 'published',
        visibility: audience === 'My class' ? 'class' : 'everyone',
      });
      // The stored draft is spent — unless it is an older one still waiting for Restore / Discard. Marking the
      // published editor as stored stops the unmount flush from writing it straight back.
      if (userId !== null && !offer) drafts.clear(userId);
      stored.current = editor;
      setTitle('');
      setBlocks([blank()]);
      nav(`/app/notes?note=${note.id}`, {
        state: {
          flash:
            audience === 'Just me'
              ? 'Saved as draft'
              : `Published to ${audience.charAt(0).toLowerCase()}${audience.slice(1)}`,
        },
      });
    } catch (e) {
      setPublishError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div data-screen-label="Create a note" className="flex flex-col gap-5">
      {offer && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-3 border-t-2 border-ink pt-3 text-[14px] font-bold"
        >
          <span className="flex-1 min-w-[200px]">
            Restore your unsaved draft from {clock(offer.savedAt)}?
          </span>
          <button
            type="button"
            onClick={restore}
            className={cn(primary, 'px-4 py-1.5 text-[13px]')}
          >
            Restore
          </button>
          <button type="button" onClick={discard} className={cn(slot, 'px-4 py-1.5 text-[13px]')}>
            Discard
          </button>
        </p>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-6 items-start">
        <div className="flex-[100_1_420px] min-w-[min(100%,300px)] border border-neutral-300 px-5 py-5 md:px-8 md:py-7 flex flex-col gap-4 min-h-[420px]">
          <div className="flex items-center gap-3 flex-wrap">
            <label htmlFor="create-subject" className="sr-only">
              Subject
            </label>
            <select
              id="create-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(Number(e.target.value))}
              className="border border-ink bg-transparent text-ink px-3 py-2 text-[13px] font-bold cursor-pointer"
            >
              <option value={0}>{subjects.loading ? 'Loading subjects…' : 'Pick a subject'}</option>
              {(subjects.data ?? []).map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
            <span data-num className="meta">
              {filled} {filled === 1 ? 'block' : 'blocks'} · kept in this tab
            </span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Title"
            placeholder="Title"
            className="w-full bg-transparent border-0 border-b border-neutral-300 font-heading text-[clamp(26px,3.6vw,36px)] font-extrabold tracking-[-0.03em] text-ink placeholder:text-neutral-400 py-1 focus:outline-none focus:border-ink"
          />
          {blocks.map((b, i) => (
            <textarea
              key={i}
              id={`blk-${i}`}
              rows={1}
              value={b.text}
              aria-label={LABEL[b.kind]}
              placeholder={PLACEHOLDER[b.kind]}
              onChange={(e) => setText(i, e.target.value)}
              onKeyDown={onKey(i, b)}
              className={cn(
                'w-full resize-none bg-transparent border-0 rounded-none placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-100',
                BLOCK_SKIN[b.kind],
              )}
            />
          ))}
          <div className="flex gap-2 flex-wrap mt-auto pt-3 border-t border-neutral-200">
            {INSERTABLES.map((ins, k) => (
              <button
                key={ins.label}
                ref={k === 0 ? insertRef : undefined}
                type="button"
                onClick={() => addBlock({ kind: ins.kind, text: '' })}
                className="border border-neutral-400 bg-transparent text-neutral-800 px-3.5 py-2 text-[13px] font-bold cursor-pointer hover:border-ink hover:text-ink"
              >
                + {ins.label}
              </button>
            ))}
          </div>
        </div>

        <aside className="flex-[1_1_280px] min-w-[min(100%,260px)] max-w-[360px] flex flex-col gap-4 border-t border-ink pt-4 min-[900px]:sticky min-[900px]:top-4">
          <h2 className="text-[19px]">Who sees it</h2>
          <div className="flex flex-col gap-2">
            {AUDIENCES.map((a) => (
              <Pill
                key={a.id}
                on={audience === a.id}
                onClick={() => setAudience(a.id)}
                className="justify-start px-4 py-2.5 text-[14px] font-bold"
              >
                {a.id}
              </Pill>
            ))}
          </div>
          <p className="text-[13.5px] text-neutral-700">
            {AUDIENCES.find((a) => a.id === audience)?.note}
          </p>
          <button
            type="button"
            disabled={publishing}
            onClick={() => void publish()}
            className={cn(
              primary,
              'px-6 py-3 text-[15px] disabled:opacity-60 disabled:cursor-not-allowed',
            )}
          >
            {publishing ? 'Saving…' : audience === 'Just me' ? 'Save as draft' : 'Publish'}
          </button>
          {(publishError ?? blocker) && (
            <p
              role={publishError ? 'alert' : undefined}
              className="text-[13px] font-semibold text-neutral-800"
            >
              {publishError ?? blocker}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
