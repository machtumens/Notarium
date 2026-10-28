import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { api, topNotes } from '@/lib/api';
import { accountModulesFor, modulesFor, type Module, type Slot } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { cn, tone } from '@/lib/utils';
import { useApp } from '@/store';

/** 12-col span, collapsed for narrower canvases. */
function spanFor(n: number, w: number) {
  if (w < 700) return 12;
  if (w < 1080) return n >= 7 ? 12 : 6;
  return n;
}

// A module is content under a rule, not a box, so the rules line up across a row and the screen
// reads as a set of bands. BAND is the primary rule, ROW the quiet one between items inside a band.
const BAND = 'border-t border-ink pt-4 h-full flex flex-col';
const ROW = 'border-b border-neutral-300';
// Buttons come from the shared variants; only padding and text size live at the call site.
const primary = cn(buttonVariants({ variant: 'primary' }), 'px-5 py-2.5 text-[13px]');
const slot = cn(buttonVariants({ variant: 'slot' }), 'px-4 py-2 text-[13px]');
const onInk = cn(buttonVariants({ variant: 'dark' }), 'px-6 py-3 text-[15px]');

/**
 * Adaptive Home: the module set is chosen by context (normal / exam / session / break),
 * trimmed by density (Calm 4 · Balanced 8 · Cockpit all) and gamification.
 * Accounts get a live set instead — nothing from the design's learner model is shown as their own record.
 */
export function Home() {
  const { ctx, density, gamification, set, isUser, session } = useApp();
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1200);
  // ponytail: useAsync has no refetch, so retry bumps a dep and every account fetch re-runs.
  const [tick, setTick] = useState(0);
  const retry = () => setTick((t) => t + 1);

  // Live account data; guests never fetch (enabled = false) and keep the design's module set.
  const mine = useAsync(() => api.notes.mine(), [tick], isUser);
  const commons = useAsync(() => api.subjects().then((s) => topNotes(s, 5)), [tick], isUser);
  const leaders = useAsync(() => api.leaderboard(), [tick], isUser);
  const user = session?.kind === 'user' ? session.user : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ponytail: density is a plain slice; a real scorer per module can replace it later.
  let mods: Slot[] = user ? accountModulesFor(user, mine, commons, leaders) : modulesFor(ctx);
  mods = mods.filter((m) => gamification || m.k !== 'stat');
  if (density === 'Calm') mods = mods.slice(0, 4);
  else if (density === 'Balanced') mods = mods.slice(0, 8);

  const act = (a?: string) => () => {
    if (!a) return;
    if (a === 'practice:question') {
      set({ practiceView: 'question' });
      nav('/app/practice');
      return;
    }
    nav(`/app/${a}`);
  };
  const leave = () => {
    set({ ctx: 'normal', mode: 'Study' });
    nav('/app/home');
  };

  return (
    // 11 column gaps have to fit the content box: at 375px that leaves 327px, so 32px gaps (352px)
    // would push a full-row child 25px past the viewport. 16px below 900px keeps it inside.
    <div
      ref={ref}
      data-screen-label="Adaptive Home"
      className="grid grid-cols-12 gap-x-4 min-[900px]:gap-x-8 gap-y-9"
    >
      {mods.map((m, i) => (
        // The hero is the screen's one inverted band, so it takes the whole row whatever its span says.
        <div
          key={`${ctx}-${i}`}
          className="min-w-0 animate-rise"
          style={{
            gridColumn: m.k === 'hero' ? '1 / -1' : `span ${spanFor(m.span, w)}`,
            animationDelay: `${i * 55}ms`,
          }}
        >
          {m.k === 'pending' ? (
            <div
              aria-busy="true"
              className="h-full min-h-[180px] border-t border-ink bg-neutral-100 animate-livepulse"
            />
          ) : m.k === 'failed' ? (
            <p className="border-t border-ink pt-4 text-[13.5px] font-semibold text-neutral-800">
              {m.label} could not load —{' '}
              <button
                type="button"
                onClick={retry}
                className="border-0 bg-transparent p-0 text-ink font-extrabold cursor-pointer underline underline-offset-[3px] decoration-neutral-400 hover:decoration-ink"
              >
                retry
              </button>
            </p>
          ) : (
            <ModuleCard m={m} act={act} leave={leave} customize={() => nav('/app/customize')} />
          )}
        </div>
      ))}
    </div>
  );
}

function ModuleCard({
  m,
  act,
  leave,
  customize,
}: {
  m: Module;
  act: (a?: string) => () => void;
  leave: () => void;
  customize: () => void;
}) {
  switch (m.k) {
    case 'hero':
      // The screen's one inverted block. It is the accent, so it is spent here and nowhere else.
      return (
        <div className="bg-ink text-accent-100 px-5 py-8 md:px-8 md:py-11 h-full flex flex-col gap-4">
          <span className="meta text-accent-300">{m.kicker}</span>
          <h3 className="text-[clamp(24px,3.2vw,40px)] text-accent-100 max-w-[30ch] [text-wrap:balance]">
            {m.title}
          </h3>
          <p className="text-[15.5px] leading-[1.55] text-accent-300 max-w-[62ch] [text-wrap:pretty]">
            {m.body}
          </p>
          <div className="flex items-center gap-5 flex-wrap mt-auto pt-4">
            <button type="button" onClick={act(m.act)} className={onInk}>
              {m.cta}
            </button>
            {m.meta.map((c) => (
              <span key={c} data-num className="text-[12.5px] font-semibold text-accent-300">
                {c}
              </span>
            ))}
          </div>
        </div>
      );
    case 'countdown':
      return (
        <div className="border-t border-ink pt-4 flex items-start gap-6 md:gap-9 flex-wrap">
          <span
            data-num
            className="text-[clamp(68px,10vw,124px)] font-extrabold leading-[0.78] tracking-[-0.045em] flex-none"
          >
            {m.big}
          </span>
          <div className="flex-[1_1_240px] min-w-0 pt-1.5">
            <div className="text-[clamp(20px,2.4vw,28px)] font-extrabold leading-[1.05] tracking-[-0.03em] max-w-[20ch] [text-wrap:balance]">
              {m.title}
            </div>
            <div data-num className="text-[13.5px] font-semibold text-neutral-700 mt-2.5">
              {m.sub}
            </div>
          </div>
          <button type="button" onClick={act(m.act)} className={cn('flex-none mt-1.5', primary)}>
            {m.cta}
          </button>
        </div>
      );
    case 'bars':
      // Mastery reads left to right — subject, length, number — and the number is a measurement, so it is tabular.
      return (
        <div className={cn(BAND, 'gap-3')}>
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-[19px]">{m.title}</h4>
            <span className="meta">{m.note}</span>
          </div>
          <div className="flex flex-col">
            {m.items.map((i) => (
              <div key={i.label} className={cn('flex items-center gap-4 py-2.5', ROW)}>
                <span className="flex-1 min-w-0 text-[14px] font-semibold text-neutral-800">
                  {i.label}
                </span>
                <span className="block w-[clamp(56px,26%,120px)] h-1 bg-neutral-300 overflow-hidden flex-none">
                  <span
                    className="block h-1"
                    style={{ background: tone(i.pct), width: `${i.pct}%` }}
                  />
                </span>
                <span data-num className="text-[17px] font-extrabold w-[42px] text-right flex-none">
                  {i.pct}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'list':
      return (
        <div className={cn(BAND, 'gap-2.5')}>
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-[19px]">{m.title}</h4>
            <span data-num className="meta">
              {m.badge}
            </span>
          </div>
          <div className="flex flex-col">
            {m.items.map((i) => (
              <button
                key={i.id ?? i.label}
                type="button"
                onClick={act(i.act ?? m.act)}
                className={cn(
                  'flex items-baseline gap-3 w-full text-left border-0 bg-transparent py-2.5 px-0 cursor-pointer hover:border-ink',
                  ROW,
                )}
              >
                <span className="flex-1 min-w-0 text-[14px] font-semibold text-neutral-800 truncate">
                  {i.label}
                </span>
                <span
                  data-num
                  className="flex-none text-[12px] font-semibold text-neutral-600 whitespace-nowrap"
                >
                  {i.meta}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={act(m.act)}
            className="mt-auto self-start border-0 border-b border-neutral-400 bg-transparent pt-3.5 pb-px text-[13px] font-extrabold text-ink cursor-pointer hover:border-ink"
          >
            {m.cta}
          </button>
        </div>
      );
    case 'stat':
      // The figures block: label over a big tabular numeral, no fill.
      return (
        <div className={cn(BAND, 'gap-4')}>
          <h4 className="meta">{m.title}</h4>
          <dl className="flex gap-x-9 gap-y-5 flex-wrap">
            {m.stats.map((s) => (
              <div key={s.l}>
                <dt className="meta">{s.l}</dt>
                <dd
                  data-num
                  className="mt-1.5 text-[clamp(24px,3.2vw,40px)] font-extrabold leading-none"
                >
                  {s.n}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-[13.5px] leading-[1.5] text-neutral-700 mt-auto max-w-[34ch] [text-wrap:pretty]">
            {m.body}
          </p>
        </div>
      );
    case 'tutor':
      return (
        <div className={cn(BAND, 'gap-4')}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-ink animate-livepulse" />
            <span className="meta text-ink">Live · {m.timer}</span>
          </div>
          {/* The one filled surface on this screen: the video frame genuinely recedes behind the controls. */}
          <div className="bg-neutral-100 border border-neutral-300 h-[112px] flex items-center justify-center gap-3.5">
            <span className="w-12 h-12 rounded-full bg-ink text-accent-100 flex items-center justify-center text-[17px] font-extrabold">
              PD
            </span>
            <div>
              <div className="text-base font-bold">{m.title}</div>
              <div className="text-[13px] text-neutral-700">{m.sub}</div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap mt-auto">
            <button type="button" className={slot}>
              Mute
            </button>
            <button type="button" className={slot}>
              Share screen
            </button>
            <button type="button" onClick={leave} className={primary}>
              Leave
            </button>
          </div>
        </div>
      );
    case 'panel':
      return (
        <div className={cn(BAND, 'gap-2.5')}>
          <h4 className="text-[19px]">{m.title}</h4>
          <p className="text-[14px] leading-[1.55] text-neutral-700 max-w-[46ch] [text-wrap:pretty]">
            {m.body}
          </p>
          <button type="button" onClick={act(m.act)} className={cn('mt-auto self-start', slot)}>
            {m.cta}
          </button>
        </div>
      );
    case 'note':
      // An aside, so it hangs off a left rule instead of sitting under a top one.
      return (
        <div className="border-l border-ink pl-4 py-0.5 h-full flex flex-col gap-2">
          <span className="meta">{m.title}</span>
          <p className="text-[14px] leading-[1.55] text-neutral-700 max-w-[44ch] [text-wrap:pretty]">
            {m.body}
          </p>
          <button
            type="button"
            onClick={customize}
            className="mt-auto self-start border-0 bg-transparent p-0 pt-2 text-[13px] font-bold text-ink cursor-pointer underline underline-offset-[3px] decoration-neutral-400 hover:decoration-ink"
          >
            Take control
          </button>
        </div>
      );
  }
}
