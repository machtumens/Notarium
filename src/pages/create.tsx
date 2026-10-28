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
import { Kicker } from '@/components/ui/kicker';
import { Pill } from '@/components/ui/pill';
import { api } from '@/lib/api';
import { blocksToText, noteSummary, type Block } from '@/lib/blocks';
import { drafts, type Draft } from '@/lib/draft';
import { AUDIENCES, BLOCKS, GAP_CHECKS, INSERTABLES } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

const primary = buttonVariants({ variant: 'primary' });
const CHIPS: { id: 'write' | 'publish'; label: string }[] = [
  { id: 'write', label: 'Write' },
  { id: 'publish', label: 'Publish' },
];
/** Accounts pick from three: the worker has no school scope, so 'My school' would silently post as everyone. */
const ACCOUNT_AUDIENCES = AUDIENCES.filter((a) => a !== 'My school');

/** Gap finder row skin: an open gap is accent with '!', a passed check is sage with '✓'. */
const GAP_SKIN = {
  gap: {
    box: 'bg-accent-200 border-accent-300 text-accent-700',
    mark: '!',
    markBg: 'bg-accent-700',
  },
  ok: { box: 'bg-sage-100 border-sage-300 text-sage-800', mark: '✓', markBg: 'bg-sage-700' },
};

/** Signed-in editor: one auto-growing textarea per block, skinned like the guest sample so it reads like the note. */
const BLOCK_SKIN: Record<Block['kind'], string> = {
  h: 'font-heading text-[32px] [text-wrap:pretty]',
  p: 'text-[16px] leading-[1.7] text-neutral-900 max-w-[64ch]',
  f: 'bg-surface border-l-[3px] border-accent rounded-none px-[22px] py-4 font-heading text-[24px] text-accent-900',
};
const PLACEHOLDER: Record<Block['kind'], string> = {
  h: 'Heading',
  p: 'Write…',
  f: 'Formula, e.g. n = m / Mr',
};
const LABEL: Record<Block['kind'], string> = { h: 'Heading', p: 'Paragraph', f: 'Formula' };
const HINT =
  'border border-dashed border-neutral-400 rounded-none px-5 py-4 text-[15px] text-neutral-700';
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

/**
 * Create: write the note (blocks + gap finder), then a separate publish decision
 * (audience, remix, the open gap, preview). The write/publish switch is global (`createPhase`).
 */
export function Create() {
  const { createPhase, learner, remixOn, set, isUser, session } = useApp();
  const nav = useNavigate();
  const userId = session?.kind === 'user' ? session.user.id : null;
  const audiences = isUser ? ACCOUNT_AUDIENCES : AUDIENCES;
  const [audience, setAudience] = useState(isUser ? 'My class' : 'My school');

  // The editor: title + blocks + subject. Guests see the design's sample blocks; accounts write and publish for real.
  const subjects = useAsync(() => api.subjects(), [], isUser);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([blank()]);
  const insertRef = useRef<HTMLButtonElement>(null);
  const [subjectId, setSubjectId] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const subjectName = subjects.data?.find((s) => s.id === subjectId)?.name ?? 'Kimia';
  const canPublish = isUser && title.trim().length > 0 && subjectId > 0 && !publishing;
  const filled = blocks.filter((b) => b.text.trim()).length;
  // Why publishing is off, in the user's words (accounts only; guests never publish for real).
  const missing = [!title.trim() && 'a title', subjectId <= 0 && 'a subject'].filter(
    (m): m is string => !!m,
  );
  const blocker =
    isUser && missing.length ? `Add ${missing.join(' and ')} before publishing.` : null;

  // ponytail: window listener in a useEffect — warns before a reload/close while unsaved blocks exist; in-app navigation is not guarded.
  useEffect(() => {
    if (!isUser || filled === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isUser, filled]);

  // Feature A: an account's editor is kept in this tab's storage (`create:{userId}`, lib/draft.ts) half a second after
  // the last change, plus whatever a debounce did not get to when the page unmounts. A draft found on mount is offered
  // back first — nothing is written until Restore / Discard has been answered, so the offer cannot be overwritten by
  // the empty editor. Publishing and Discard forget it. Guests never write (no account, no key).
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
    const restoredAudience = audiences.includes(offer.audience) ? offer.audience : audience;
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
  /** A successful publish: the stored draft is spent — unless it is an older one still waiting for Restore / Discard, which stays. */
  const published = () => {
    if (userId !== null && !offer) drafts.clear(userId);
    stored.current = editor;
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
  // Auto-grow: index keys reuse textarea nodes on insert/remove, so every block re-measures after each change (and on return from Publish).
  useLayoutEffect(() => {
    document.querySelectorAll<HTMLTextAreaElement>('[id^="blk-"]').forEach((el) => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [blocks, createPhase]);

  const goWrite = () => set({ createPhase: 'write' });
  const goPublish = () => set({ createPhase: 'publish' });
  const goDiscover = () => nav('/app/discover');

  /**
   * POST /api/notes in main's shape (see `api.notes.create`): the block text goes in `extracted_text` and `content`
   * (always strings, even for an empty body), its plain-text summary is the `description`. 'Just me' saves a draft;
   * 'My class' limits visibility to the class; 'All of Notarium' is public (accounts never see 'My school').
   * The flash line is built from the audience label.
   */
  const publish = async () => {
    if (!isUser) {
      goDiscover();
      return;
    }
    if (!canPublish) {
      setPublishError('A title and a subject are needed first.');
      goWrite();
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
        tags: remixOn ? ['remix-ok'] : [],
        status: audience === 'Just me' ? 'draft' : 'published',
        visibility: audience === 'My class' ? 'class' : 'everyone',
      });
      set({ createPhase: 'write' });
      published();
      setTitle('');
      setBlocks([blank()]);
      // Notes opens the row main just wrote (by id — main's created_at is whole seconds, so "newest" can tie)
      // and shows this once as a confirmation line (location.state.flash).
      nav(`/app/notes?note=${note.id}&subject=${subjectId}`, {
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
    <div data-screen-label="Create and publish a note" className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-[9px] flex-wrap">
        {CHIPS.map((c) => (
          <Pill
            key={c.id}
            on={createPhase === c.id}
            onClick={() => set({ createPhase: c.id })}
            className="px-[19px] py-[9px] text-[13px] font-bold hover:border-accent-600"
          >
            {c.label}
          </Pill>
        ))}
        <span className="text-[13px] text-neutral-700 ml-1.5">
          Writing is for you. Publishing is a separate decision, made later.
        </span>
      </div>
      {offer && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-3 bg-sage-100 border border-sage-300 text-sage-800 rounded-none px-[18px] py-3 text-[14px] font-bold"
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
          <button
            type="button"
            onClick={discard}
            className={cn(buttonVariants({ variant: 'slot' }), 'px-4 py-1.5 text-[13px]')}
          >
            Discard
          </button>
        </p>
      )}

      {createPhase === 'write' && (
        <div className="flex flex-wrap gap-5 items-start">
          <div className="flex-[100_1_420px] min-w-[min(100%,330px)] bg-neutral-100 border border-neutral-300 rounded-none px-9 py-8 flex flex-col gap-4 min-h-[520px]">
            <div className="flex items-center gap-[9px] flex-wrap">
              {isUser ? (
                <>
                  <label htmlFor="create-subject" className="sr-only">
                    Subject
                  </label>
                  <select
                    id="create-subject"
                    value={subjectId}
                    onChange={(e) => setSubjectId(Number(e.target.value))}
                    className="bg-accent-200 text-accent-700 border-0 rounded-none px-[13px] py-[5px] text-[12px] font-bold cursor-pointer"
                  >
                    <option value={0}>
                      {subjects.loading ? 'Loading subjects…' : 'Pick a subject'}
                    </option>
                    {(subjects.data ?? []).map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span className="bg-accent-200 text-accent-700 rounded-none px-[13px] py-[5px] text-[12px] font-bold">
                  Kimia
                </span>
              )}
              <span className="border border-neutral-400 text-neutral-700 rounded-none px-[13px] py-[5px] text-[12px] font-semibold">
                {isUser ? `Draft · ${filled} blocks` : 'Draft · saved 2 min ago'}
              </span>
              <span className="border border-sage-300 bg-sage-100 text-sage-700 rounded-none px-[13px] py-[5px] text-[12px] font-bold">
                Only you can see this
              </span>
            </div>
            {isUser && (
              <>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-label="Title"
                  placeholder="Title — e.g. Stoikiometri — Konsep Mol"
                  className="w-full bg-transparent border-0 border-b border-neutral-300 font-heading text-[32px] text-ink placeholder:text-neutral-400 py-1 focus:outline-none focus:border-accent"
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
                      'w-full resize-none bg-transparent border-0 rounded-none placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-200/40',
                      BLOCK_SKIN[b.kind],
                    )}
                  />
                ))}
              </>
            )}
            {!isUser &&
              BLOCKS.map((b, i) => (
                <div key={i}>
                  {b.kind === 'h' && <h2 className="text-[32px] [text-wrap:pretty]">{b.text}</h2>}
                  {b.kind === 'p' && (
                    <p className="text-[16px] leading-[1.7] text-neutral-900 max-w-[64ch] [text-wrap:pretty]">
                      {b.text}
                    </p>
                  )}
                  {b.kind === 'f' && (
                    <div className="bg-surface border-l-[3px] border-accent rounded-none px-[22px] py-4 font-heading text-[24px] text-accent-900">
                      {b.text}
                    </div>
                  )}
                </div>
              ))}
            {isUser ? (
              <button
                type="button"
                onClick={() => addBlock(blank())}
                className={cn(
                  HINT,
                  'w-full text-left bg-transparent cursor-pointer hover:border-accent-600',
                )}
              >
                Keep writing, or press / to insert a block…
              </button>
            ) : (
              <div className={HINT}>Keep writing, or press / to insert a block…</div>
            )}
            <div className="flex gap-2 flex-wrap mt-auto pt-2 border-t border-neutral-200">
              {INSERTABLES.map((i, k) => (
                <button
                  key={i}
                  ref={k === 0 ? insertRef : undefined}
                  type="button"
                  onClick={() =>
                    isUser &&
                    addBlock(
                      i === 'Heading'
                        ? { kind: 'h', text: '' }
                        : i === 'Formula'
                          ? { kind: 'f', text: '' }
                          : { kind: 'p', text: `[${i}] ` },
                    )
                  }
                  className="border border-neutral-400 bg-transparent text-neutral-800 rounded-none px-[15px] py-2 text-[13px] font-bold cursor-pointer hover:bg-neutral-200 hover:border-accent-600"
                >
                  + {i}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-[1_1_290px] min-w-[min(100%,275px)] max-w-[360px] flex flex-col gap-5">
            <div className="bg-surface border border-neutral-300 rounded-none p-[22px] flex flex-col gap-3">
              <div className="flex items-center gap-[9px]">
                <span className="w-[26px] h-[26px] rounded-none bg-sage-700 text-sage-100 flex items-center justify-center text-[12px] font-extrabold">
                  N
                </span>
                <span className="text-[15px] font-extrabold">Gap finder</span>
              </div>
              {GAP_CHECKS.map((g) => {
                const skin = GAP_SKIN[g.kind];
                return (
                  <div
                    key={g.label}
                    className={cn(
                      'flex items-start gap-[11px] border rounded-none px-3.5 py-3',
                      skin.box,
                    )}
                  >
                    <span
                      className={cn(
                        'w-5 h-5 rounded-full text-accent-100 flex items-center justify-center text-[12px] font-extrabold flex-[0_0_20px]',
                        skin.markBg,
                      )}
                    >
                      {skin.mark}
                    </span>
                    <span className="flex-1 min-w-0 text-[13.5px] leading-[1.45] [text-wrap:pretty]">
                      {g.label}
                    </span>
                  </div>
                );
              })}
              <p className="text-[12.5px] text-neutral-700 leading-[1.5]">
                Checked against the curriculum and the notes already published for this topic — so
                you add what is missing, not a fifth copy.
              </p>
            </div>

            <div className="bg-neutral-100 border border-neutral-300 rounded-none p-[22px] flex flex-col gap-[11px]">
              <Kicker size="md" className="text-neutral-700">
                Ready?
              </Kicker>
              <p className="text-[14px] leading-[1.55] text-neutral-800 [text-wrap:pretty]">
                Publishing is where the note stops being yours alone. Nothing happens until you say
                so.
              </p>
              <button
                type="button"
                onClick={goPublish}
                title={blocker ?? undefined}
                className={cn(primary, 'self-start px-[22px] py-[11px] text-[14px]')}
              >
                Review and publish
              </button>
              {blocker && <span className="text-[12.5px] text-neutral-700">{blocker}</span>}
            </div>
          </div>
        </div>
      )}

      {createPhase === 'publish' && (
        <div className="flex flex-wrap gap-5 items-start">
          <div className="flex-[100_1_400px] min-w-[min(100%,320px)] flex flex-col gap-5">
            <div className="bg-neutral-100 border border-neutral-300 rounded-none p-6 flex flex-col gap-[18px]">
              <h4 className="text-[20px]">Who sees it</h4>
              <div className="flex gap-[9px] flex-wrap">
                {audiences.map((a) => (
                  <Pill
                    key={a}
                    on={audience === a}
                    onClick={() => setAudience(a)}
                    className="px-[18px] py-2.5 text-[14px] font-bold hover:border-accent-600"
                  >
                    {a}
                  </Pill>
                ))}
              </div>
              <div className="flex items-center gap-3.5 flex-wrap pt-1.5 border-t border-neutral-200">
                <button
                  type="button"
                  aria-pressed={remixOn}
                  onClick={() => set({ remixOn: !remixOn })}
                  className={cn(
                    'border-[1.5px] rounded-full px-[18px] py-2.5 text-[14px] font-bold cursor-pointer hover:border-accent-600',
                    remixOn
                      ? 'bg-sage-200 border-sage text-sage-800'
                      : 'bg-transparent border-neutral-400 text-neutral-700',
                  )}
                >
                  {remixOn ? 'Remix allowed' : 'No remixing'}
                </button>
                <span className="flex-1 min-w-[200px] text-[13.5px] leading-[1.5] text-neutral-700 [text-wrap:pretty]">
                  A remix keeps your name on the lineage and credits you when the copy earns votes.
                </span>
              </div>
            </div>

            <div className="bg-accent-200 border border-accent-300 rounded-none p-[26px] flex flex-col gap-[13px]">
              <Kicker size="md" className="text-accent-700">
                Before you publish
              </Kicker>
              <h3 className="text-[23px] text-accent-900">One gap is still open</h3>
              <p className="text-[15px] leading-[1.55] text-accent-800 max-w-[60ch] [text-wrap:pretty]">
                The mol–volume section is missing, and it is the most searched part of this topic in
                kelas 10. Notes that cover it get roughly three times the saves.
              </p>
              <div className="flex gap-2.5 flex-wrap pt-0.5">
                <button
                  type="button"
                  onClick={goWrite}
                  className={cn(primary, 'px-[22px] py-3 text-[15px]')}
                >
                  Add it first
                </button>
                <button
                  type="button"
                  disabled={publishing || !!blocker}
                  title={blocker ?? undefined}
                  onClick={() => void publish()}
                  className="border border-accent-400 bg-transparent text-accent-700 rounded-none px-[22px] py-3 text-[15px] font-bold cursor-pointer hover:bg-accent-100 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {publishing
                    ? 'Publishing…'
                    : isUser
                      ? audience === 'Just me'
                        ? 'Save as draft'
                        : 'Publish anyway'
                      : 'Publish anyway'}
                </button>
              </div>
              {blocker && (
                <p className="text-[13px] font-semibold text-accent-800">
                  {blocker}{' '}
                  <button
                    type="button"
                    onClick={goWrite}
                    className="underline underline-offset-[3px] bg-transparent border-0 p-0 text-accent-800 font-semibold cursor-pointer hover:text-accent-900"
                  >
                    Back to writing
                  </button>
                </p>
              )}
              {publishError && (
                <p role="alert" className="text-[13px] font-semibold text-accent-800">
                  {publishError}
                </p>
              )}
            </div>
          </div>

          <div className="flex-[1_1_290px] min-w-[min(100%,275px)] max-w-[360px] flex flex-col gap-5">
            <div className="bg-neutral-100 border border-neutral-300 rounded-none p-[22px] flex flex-col gap-3">
              <Kicker size="md" className="text-neutral-700">
                How it will appear
              </Kicker>
              <div className="relative overflow-hidden bg-accent-100 border border-neutral-300 rounded-none p-5 flex flex-col gap-2.5">
                <span className="relative bg-accent-200 text-accent-700 rounded-none px-3 py-[5px] text-[12px] font-bold self-start">
                  {isUser ? subjectName : 'Kimia'}
                </span>
                <span className="relative font-heading text-[18px] leading-[1.2] text-ink [text-wrap:pretty]">
                  {isUser ? title.trim() || 'Untitled note' : 'Stoikiometri — Konsep Mol'}
                </span>
                <span className="relative text-[13px] text-accent-900 font-semibold">
                  {learner} ·{' '}
                  {session?.kind === 'user' && session.user.class
                    ? `Kelas ${session.user.class}`
                    : 'SMAN 4'}
                </span>
                <span className="relative flex items-center gap-3 text-[13px] font-bold text-accent-700">
                  <span>0 saves</span>
                  <span className="text-accent-800 font-semibold">4 pages</span>
                </span>
              </div>
            </div>

            <div className="bg-sage-100 border border-sage-300 rounded-none p-[22px] flex flex-col gap-[9px]">
              <Kicker size="md" className="text-sage-700">
                What counts as quality
              </Kicker>
              <p className="text-[14px] leading-[1.55] text-sage-800 [text-wrap:pretty]">
                Saves and votes rank the note. What ranks you is whether learners who read it then
                answer questions on that topic correctly.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
