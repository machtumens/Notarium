import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { api, noteText, type Note } from '@/lib/api';
import { noteSummary, textToBlocks, type Block } from '@/lib/blocks';
import { NOTE_CHIPS, NOTE_SECTIONS } from '@/lib/data';
import { useAiChat } from '@/lib/use-ai-chat';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

const primary = buttonVariants({ variant: 'primary' });
const slot = buttonVariants({ variant: 'slot' });
const ADD_SECTION_REPLY =
  'Added under Konsep mol: n = V / 22,4 at STP, with the 9,8 g H₂SO₄ example carried through so both formulas sit on the same numbers.';
/**
 * A chat turn is a square block: the AI's is outlined paper, yours is solid ink. With alignment
 * that is the whole distinction — no tail, no radius, no second colour.
 */
const TURN =
  'max-w-[88%] px-4 py-3 text-[15px] leading-[1.6] whitespace-pre-line [text-wrap:pretty]';

/** The design's sample note, used for guests and as the empty state. */
const DEMO_NOTE = {
  id: 0,
  title: 'Stoikiometri — Konsep Mol',
  subject_name: 'Kimia',
  created_at: '2026-12-04',
  summary: 'n = m / Mr',
  body: [
    'Mol adalah satuan jumlah zat. Satu mol berisi 6,022 × 10²³ partikel, angka yang disebut bilangan Avogadro. Satuan ini dipakai supaya massa yang bisa ditimbang di laboratorium bisa dihubungkan dengan jumlah partikel yang tidak bisa dihitung satu per satu.',
    'Contoh: 9,8 gram H₂SO₄ dengan Mr = 98 berarti n = 9,8 / 98 = 0,1 mol. Urutannya selalu sama — cari Mr dulu, baru bagi massanya. Kesalahan yang paling sering terjadi adalah lupa mengubah satuan massa ke gram.',
  ],
};

const noteBody = (n: Note) => textToBlocks(noteText(n));

/** One note block: heading, formula on its left rule, or paragraph — the same skins as the Create editor. */
const BlockView = ({ b }: { b: Block }) =>
  b.kind === 'h' ? (
    <h3 className="text-[clamp(20px,2.4vw,28px)] max-w-[36ch] [text-wrap:pretty]">{b.text}</h3>
  ) : b.kind === 'f' ? (
    <div className="border-l-[3px] border-ink pl-5 py-1 font-heading font-bold tracking-[-0.02em] text-[clamp(20px,2.4vw,28px)] text-ink">
      {b.text}
    </div>
  ) : (
    <p className="text-[17px] leading-[1.65] text-neutral-900 max-w-[70ch] [text-wrap:pretty] whitespace-pre-line">
      {b.text}
    </p>
  );

/**
 * Note viewer. Signed in: the rail lists your notes (plus one opened from Discover via ?note=&subject=)
 * and the article renders the selected note at full width — main has no chat routes, so there is no
 * companion for accounts. Guest: the design's Stoikiometri sample with the AI companion and canned replies.
 */
export function Notes() {
  const { isUser } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
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
  const openId = Number(params.get('note')) || 0;
  const openSubject = Number(params.get('subject')) || 0;

  const mine = useAsync(() => api.notes.mine(), [], isUser);
  const opened = useAsync(
    () => api.notes.bySubject(openSubject).then((ns) => ns.find((n) => n.id === openId) ?? null),
    [openId, openSubject],
    isUser && openId > 0 && openSubject > 0,
  );
  const rail = useMemo(() => {
    const list = [...(mine.data ?? [])];
    if (opened.data && !list.some((n) => n.id === opened.data!.id)) list.unshift(opened.data);
    return list;
  }, [mine.data, opened.data]);

  const [selectedId, setSelectedId] = useState<number>(0);
  useEffect(() => {
    if (openId) setSelectedId(openId);
    else if (rail.length && !selectedId) setSelectedId(rail[0].id);
  }, [openId, rail, selectedId]);
  const note = rail.find((n) => n.id === selectedId) ?? null;
  const [section, setSection] = useState('Konsep mol');

  const subject = note?.subject_name ?? DEMO_NOTE.subject_name;
  const title = note?.title ?? DEMO_NOTE.title;
  const companion = useAiChat('chat', () => ADD_SECTION_REPLY);
  const askChip = (label: string, reply?: string) => companion.send(label, reply);

  const live = isUser && !!note;
  const blocks: Block[] = live
    ? noteBody(note)
    : DEMO_NOTE.body.map((text) => ({ kind: 'p', text }));
  // Main fills `summary` with the description we send — the plain-text summary of the body (the first paragraph, before W5.5) — so a summary that only repeats the note is not shown twice.
  const repeats = (s: string, n: Note) =>
    s === blocks[0]?.text.trim() || s === noteSummary(noteText(n));
  const summary = live
    ? note.summary?.trim() && !repeats(note.summary.trim(), note)
      ? note.summary
      : null
    : DEMO_NOTE.summary;
  const showSummary = !live || !!summary;
  const railLoading = isUser && (mine.loading || opened.loading);
  const railError = isUser ? (mine.error ?? opened.error) : null;

  return (
    <div
      data-screen-label={isUser ? 'Note viewer' : 'Note viewer + AI companion'}
      className="flex flex-wrap gap-x-10 gap-y-7 items-start"
    >
      {flash && (
        <p
          role="status"
          className="w-full border-t-2 border-ink pt-2.5 text-[14px] font-bold text-ink"
        >
          {flash}
        </p>
      )}
      <nav
        aria-label={isUser ? 'Your notes' : 'Sections'}
        className="flex-[1_1_180px] min-w-[min(100%,170px)] max-w-[240px] border-t border-ink pt-3.5 flex flex-col gap-3"
      >
        <span className="meta">{isUser ? 'Your notes' : 'Sections'}</span>
        {railLoading && (
          <div aria-hidden className="flex flex-col gap-2 animate-pulse">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn('h-[14px] bg-neutral-200', i === 1 ? 'w-3/5' : 'w-4/5')}
              />
            ))}
          </div>
        )}
        {railError && (
          <div role="alert" className="flex flex-col items-start gap-2.5">
            <span className="text-[14px] font-semibold text-neutral-900 [text-wrap:pretty]">
              {railError}
            </span>
            <button
              type="button"
              onClick={mine.error ? mine.retry : opened.retry}
              className={cn(slot, 'px-3.5 py-1.5 text-[12.5px]')}
            >
              Retry
            </button>
          </div>
        )}
        {isUser && !railLoading && !railError && rail.length === 0 && (
          <div className="flex flex-col items-start gap-3">
            <span className="text-[15px] font-extrabold text-ink">No notes yet</span>
            <button
              type="button"
              onClick={() => nav('/app/create')}
              className={cn(primary, 'px-4 py-2 text-[13px]')}
            >
              Write your first note
            </button>
          </div>
        )}
        <div className="flex flex-col">
          {(isUser
            ? rail.map((n) => ({
                key: n.id,
                label: n.title,
                on: n.id === selectedId,
                go: () => setSelectedId(n.id),
              }))
            : NOTE_SECTIONS.map((l) => ({
                key: l,
                label: l,
                on: section === l,
                go: () => setSection(l),
              }))
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.go}
              className={cn(
                'flex items-center gap-2.5 w-full text-left border-t border-neutral-300 px-2 py-2.5 text-[14px] cursor-pointer',
                item.on
                  ? 'bg-ink text-accent-100 font-extrabold'
                  : 'bg-transparent text-neutral-900 font-semibold hover:bg-neutral-100',
              )}
            >
              <span
                className={cn(
                  'w-1 h-1 rounded-full flex-[0_0_4px]',
                  item.on ? 'bg-accent-100' : 'bg-neutral-400',
                )}
              />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <article className="flex-[100_1_380px] min-w-[min(100%,300px)] flex flex-col gap-6">
        <div className="flex items-baseline gap-x-5 gap-y-1.5 flex-wrap border-t border-ink pt-3">
          <span className="meta text-ink">{subject}</span>
          <span data-num className="meta">
            {live
              ? `${note.status === 'draft' ? 'Draft' : 'Published'} · ${note.created_at.slice(0, 10)}`
              : 'Catatan kelas · 4 Desember'}
          </span>
          <span data-num className="meta">
            {live ? `${note.likes ?? 0} likes` : '41% mastery'}
          </span>
        </div>
        <h2 className="text-[clamp(32px,5vw,64px)] max-w-[24ch] [text-wrap:balance]">{title}</h2>
        {blocks.length === 0 && (
          <p className="text-[15px] text-neutral-700">
            This note has no text yet — it may be photo-only.
          </p>
        )}
        {blocks.slice(0, 1).map((b, i) => (
          <BlockView key={i} b={b} />
        ))}
        {showSummary && (
          <div className="border-t border-ink pt-4 flex flex-col gap-2">
            <span className="meta">{live ? 'Summary' : 'Rumus inti'}</span>
            <span
              className={cn(
                'font-heading font-bold text-ink',
                live
                  ? 'text-[19px] leading-[1.4] max-w-[70ch]'
                  : 'text-[clamp(24px,3.2vw,40px)] leading-[1.05] tracking-[-0.03em]',
              )}
            >
              {summary}
            </span>
            {!live && (
              <span className="text-[14px] leading-[1.5] text-neutral-700">
                n = jumlah mol · m = massa (gram) · Mr = massa molekul relatif
              </span>
            )}
          </div>
        )}
        {blocks.slice(1).map((b, i) => (
          <BlockView key={i} b={b} />
        ))}
        {!live && (
          <div className="border-t border-neutral-300 pt-4 flex items-end gap-5 flex-wrap">
            <div className="flex-1 min-w-[220px] flex flex-col gap-1">
              <div className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
                Hubungan mol dengan volume (STP)
              </div>
              <div className="text-[15px] leading-[1.5] text-neutral-700">
                Bagian ini belum ada di catatanmu.
              </div>
            </div>
            <button
              type="button"
              onClick={() => askChip('Add the missing step.', ADD_SECTION_REPLY)}
              className={cn(primary, 'px-5 py-2.5 text-[14px]')}
            >
              Add section
            </button>
          </div>
        )}
      </article>

      {!isUser && (
        <aside className="flex-[1_1_300px] min-w-[min(100%,280px)] max-w-[380px] border-t border-ink pt-3.5 flex flex-col gap-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="w-6 h-6 flex-[0_0_24px] bg-ink text-accent-100 flex items-center justify-center text-[11px] font-extrabold">
              N
            </span>
            <span className="text-[15px] font-extrabold tracking-[-0.02em]">AI companion</span>
            <span className="meta ml-auto">Reading with you</span>
          </div>
          <div
            aria-live="polite"
            className="flex flex-col gap-2.5 max-h-[430px] overflow-auto border-y border-neutral-300 py-4"
          >
            {companion.thread.map((c, i) => (
              <div
                key={`${i}-${c.who}`}
                className={cn('flex', c.who === 'ai' ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    TURN,
                    c.who === 'ai'
                      ? 'border border-neutral-300 bg-bg text-neutral-900'
                      : 'bg-ink text-accent-100',
                  )}
                >
                  {c.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col mt-auto">
            {NOTE_CHIPS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => askChip(q.label, q.reply || undefined)}
                className="text-left border-t border-neutral-300 px-2 py-3 text-[14px] font-semibold text-neutral-900 cursor-pointer hover:bg-ink hover:text-accent-100"
              >
                {q.label}
              </button>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
