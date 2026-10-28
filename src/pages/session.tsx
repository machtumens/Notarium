import { useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Kicker } from '@/components/ui/kicker';
import { Pill } from '@/components/ui/pill';
import { DIAGNOSTIC, FEEDBACK, MASTERY_DELTA, SESSION_GOALS } from '@/lib/data';
import { cn } from '@/lib/utils';
import { useApp, type AppState } from '@/store';

const PHASES: { id: AppState['sessionPhase']; label: string }[] = [
  { id: 'before', label: '1 · Before · diagnostic' },
  { id: 'during', label: '2 · During · workspace' },
  { id: 'after', label: '3 · After · feedback' },
];
const STARS = [1, 2, 3, 4, 5];

/** A "panel" here is content under a hairline rule, not a filled box. The loud variant opens a column. */
const panel = 'border-t border-neutral-300 pt-4';
const panelLoud = 'border-t-2 border-ink pt-5';
const primary = buttonVariants({ variant: 'primary' });
const slot = buttonVariants({ variant: 'slot' });
const darkBtn = cn(buttonVariants({ variant: 'dark' }), 'px-[17px] py-[9px] text-[13px]');

/**
 * Mastery band as ink weight rather than hue: weak reads loudest (solid ink) and mastered recedes
 * to light grey. `tone()` in lib/utils still returns the old warm ramp — these bars take their fill
 * from the ink tokens instead, so the screen is grayscale regardless of when that helper is fixed.
 */
function bandFill(pct: number) {
  if (pct < 50) return 'bg-ink';
  if (pct < 70) return 'bg-neutral-600';
  return 'bg-neutral-400';
}

/**
 * Agenda / session-goals card. Each goal is a row on a left rule — ink for the one that matters,
 * hairline for the rest. The before-phase variant stays a touch roomier (gap 14 / indent 16 vs 12 / 15).
 */
function Goals({
  title,
  gap,
  pad,
  cta,
}: {
  title: string;
  gap: string;
  pad: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className={cn(panel, 'flex flex-col', gap)}>
      <h4 className="text-[19px]">{title}</h4>
      {SESSION_GOALS.map((g) => (
        <div
          key={g.label}
          className={cn(
            'border-l-2 flex flex-col gap-[3px]',
            pad,
            g.primary ? 'border-ink' : 'border-neutral-300',
          )}
        >
          <span
            className={cn(
              'text-sm',
              g.primary ? 'font-extrabold text-ink' : 'font-bold text-neutral-800',
            )}
          >
            {g.label}
          </span>
          <span className="text-[12.5px] text-neutral-600">{g.meta}</span>
        </div>
      ))}
      {cta}
    </div>
  );
}

/** Tutor session workspace: one object with three states (before / during / after). */
export function Session() {
  const { sessionPhase, rating, set } = useApp();
  const nav = useNavigate();
  // logic.js goSession also sets screen:'session' — we are already on that route.
  const goSession = () => set({ sessionPhase: 'during' });
  const endSession = () => set({ sessionPhase: 'after' });
  const startPractice = () => {
    set({ practiceView: 'question' });
    nav('/app/practice');
  };

  return (
    <div data-screen-label="Tutor session workspace" className="flex flex-col gap-6">
      <div className="flex items-center gap-[9px] flex-wrap">
        {PHASES.map((p) => (
          <Pill
            key={p.id}
            on={sessionPhase === p.id}
            onClick={() => set({ sessionPhase: p.id })}
            className="px-[17px] py-[9px] text-[13px] font-bold"
          >
            {p.label}
          </Pill>
        ))}
        <span className="text-[13px] text-neutral-700 ml-1.5">
          The session is one object with three states, not three screens.
        </span>
      </div>

      {sessionPhase === 'before' && (
        <div className="flex flex-wrap gap-x-10 gap-y-8 items-start">
          <div className="flex-[100_1_420px] min-w-[min(100%,330px)] flex flex-col gap-8">
            <div className={cn(panelLoud, 'flex flex-col gap-[13px]')}>
              <Kicker size="md" className="text-neutral-600">
                Sent to Paul · 2 hours before
              </Kicker>
              <h3 className="text-[clamp(24px,3.2vw,40px)] max-w-[28ch] [text-wrap:balance]">
                AI diagnostic · Vektor
              </h3>
              <p className="text-[15px] leading-[1.55] text-neutral-700 max-w-[62ch] [text-wrap:pretty]">
                The tutor opens the session already knowing which step breaks. Nobody spends the
                first fifteen minutes finding out.
              </p>
            </div>
            <div className={cn(panel, 'flex flex-col gap-[18px]')}>
              <h4 className="text-[20px]">What the diagnostic says</h4>
              {DIAGNOSTIC.map((d) => (
                <div key={d.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-[15px] font-bold text-neutral-900">{d.label}</span>
                    <span data-num className="text-[13px] font-bold text-neutral-700">
                      {d.pct}%
                    </span>
                  </div>
                  <span className="block h-[7px] rounded-full bg-neutral-200 overflow-hidden">
                    <span
                      className={cn('block h-[7px] rounded-full', bandFill(d.pct))}
                      style={{ width: `${d.pct}%` }}
                    />
                  </span>
                  <span className="text-[13px] text-neutral-700">{d.note}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-[1_1_300px] min-w-[min(100%,280px)] max-w-[380px] flex flex-col gap-8">
            <Goals
              title="Agenda Paul set"
              gap="gap-3.5"
              pad="pl-4 py-1"
              cta={
                <button
                  type="button"
                  onClick={goSession}
                  className={cn(primary, 'self-start px-[22px] py-[11px] text-sm')}
                >
                  Join session
                </button>
              }
            />
            <div className={cn(panel, 'flex flex-col gap-[9px]')}>
              <Kicker size="md" className="text-neutral-600">
                Your prep
              </Kicker>
              <p className="text-sm leading-[1.55] text-neutral-700 [text-wrap:pretty]">
                Two questions you flagged are already on the whiteboard. Nothing else is asked of
                you before 19:00.
              </p>
            </div>
          </div>
        </div>
      )}

      {sessionPhase === 'during' && (
        <div className="flex flex-wrap gap-x-10 gap-y-8 items-start">
          <div className="flex-[100_1_420px] min-w-[min(100%,330px)] flex flex-col gap-8">
            {/* The live panel is this screen's one inverted band — the accent is spent here and nowhere else. */}
            <div className="bg-ink text-accent-100 p-[22px] flex flex-col gap-4">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="w-2 h-2 rounded-none bg-accent-400 animate-[livepulse_1.8s_ease-in-out_infinite]" />
                <Kicker size="md" className="text-accent-300">
                  <span data-num>Live · 24:10</span>
                </Kicker>
                <span data-num className="ml-auto text-[13px] font-bold text-accent-200">
                  Goal 2 of 3
                </span>
              </div>
              <div className="flex gap-3.5 flex-wrap">
                <div className="flex-[1_1_220px] min-w-[200px] border border-accent-600 h-[168px] flex items-center justify-center gap-[13px]">
                  <span className="w-[52px] h-[52px] rounded-none bg-accent-100 text-ink flex items-center justify-center text-[18px] font-extrabold">
                    PA
                  </span>
                  <div className="leading-[1.3]">
                    <div className="text-base font-bold text-accent-100">Paul</div>
                    <div className="text-[13px] text-accent-300">speaking</div>
                  </div>
                </div>
                <div className="flex-[0_0_132px] border border-accent-600 h-[168px] flex items-center justify-center">
                  <span className="w-[42px] h-[42px] rounded-none border border-accent-100 text-accent-100 flex items-center justify-center text-[15px] font-extrabold">
                    A
                  </span>
                </div>
              </div>
              <div className="flex gap-[9px] flex-wrap">
                <button type="button" onClick={goSession} className={darkBtn}>
                  Mute
                </button>
                <button type="button" onClick={goSession} className={darkBtn}>
                  Share screen
                </button>
                {/* Filled paper on the inverted band: buttonVariants has no "inverse primary", and the ink `primary` would vanish here. */}
                <button
                  type="button"
                  onClick={endSession}
                  className="ml-auto border border-accent-100 bg-accent-100 text-ink px-[19px] py-[9px] text-[13px] font-bold cursor-pointer hover:bg-accent-300"
                >
                  End session
                </button>
              </div>
            </div>
            <div className={cn(panel, 'flex flex-col gap-3.5')}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h4 className="text-[20px]">Whiteboard</h4>
                <span data-num className="text-[13px] text-neutral-700">
                  Both cursors · 3 sketches
                </span>
              </div>
              <div className="border border-dashed border-neutral-400 bg-neutral-100 min-h-[250px] flex items-center justify-center p-6">
                <span className="text-sm font-semibold text-neutral-700 text-center max-w-[36ch] [text-wrap:pretty]">
                  Shared canvas placeholder — component to be specified. Current sketch: penguraian
                  komponen on rotated axes.
                </span>
              </div>
            </div>
          </div>
          <div className="flex-[1_1_300px] min-w-[min(100%,280px)] max-w-[380px] flex flex-col gap-8">
            <Goals title="Session goals" gap="gap-3" pad="pl-[15px] py-1" />
            <div className={cn(panel, 'flex flex-col gap-[11px]')}>
              <div className="flex items-center gap-[9px]">
                <span className="w-[26px] h-[26px] rounded-full bg-ink text-accent-100 flex items-center justify-center text-xs font-extrabold">
                  N
                </span>
                <span className="text-[15px] font-extrabold">AI assistant</span>
                <Kicker size="md" className="ml-auto text-neutral-600">
                  Listening
                </Kicker>
              </div>
              <p className="text-sm leading-[1.55] text-neutral-800 [text-wrap:pretty]">
                Silent by default. At 20:00 it writes the summary, three practice questions and the
                mastery update, and Paul approves them before they land.
              </p>
              <button
                type="button"
                onClick={goSession}
                className={cn(slot, 'self-start px-[17px] py-[9px] text-[13px]')}
              >
                Ask it something now
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionPhase === 'after' && (
        <div className="flex flex-wrap gap-x-10 gap-y-8 items-start">
          <div className="flex-[100_1_400px] min-w-[min(100%,320px)] flex flex-col gap-8">
            <div className={cn(panelLoud, 'flex flex-col gap-[18px]')}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h4 className="text-[20px]">Tutor feedback</h4>
                <span data-num className="text-xs font-bold text-neutral-600">
                  submitted 20:04
                </span>
              </div>
              {FEEDBACK.map((f) => (
                <div key={f.label} className="flex flex-col gap-1.5">
                  <Kicker size="md" className="text-neutral-600">
                    {f.label}
                  </Kicker>
                  <p className="text-[15px] leading-[1.6] text-neutral-800 max-w-[62ch] [text-wrap:pretty]">
                    {f.value}
                  </p>
                </div>
              ))}
            </div>
            <div className={cn(panel, 'flex flex-col gap-[13px]')}>
              <Kicker size="md" className="text-neutral-600">
                Generated from the feedback
              </Kicker>
              <h3 className="text-[24px]">Rotated-axis vektor · 6 questions</h3>
              <p className="text-[15px] leading-[1.55] text-neutral-700 max-w-[60ch] [text-wrap:pretty]">
                Not more component practice — the specific thing Paul said still slips. It is in
                your queue for tomorrow.
              </p>
              <button
                type="button"
                onClick={startPractice}
                className={cn(primary, 'self-start px-6 py-3 text-[15px]')}
              >
                Start now instead
              </button>
            </div>
          </div>
          <div className="flex-[1_1_300px] min-w-[min(100%,280px)] max-w-[380px] flex flex-col gap-8">
            <div className={cn(panel, 'flex flex-col gap-4')}>
              <h4 className="text-[19px]">Mastery updated</h4>
              {MASTERY_DELTA.map((d) => {
                const moved = d.to > d.from;
                return (
                  <div key={d.label} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2.5">
                      <span className="text-sm font-bold text-neutral-900">{d.label}</span>
                      <span
                        data-num
                        className={cn(
                          'text-[13px] font-extrabold',
                          moved ? 'text-ink' : 'text-neutral-600',
                        )}
                      >
                        {moved ? `+${d.to - d.from}` : 'unchanged'}
                      </span>
                    </div>
                    <span className="block h-[7px] rounded-full bg-neutral-200 overflow-hidden">
                      <span
                        className={cn('block h-[7px] rounded-full', bandFill(d.to))}
                        style={{ width: `${d.to}%` }}
                      />
                    </span>
                    <span data-num className="text-[12.5px] text-neutral-700">
                      {d.from}% → {d.to}%
                    </span>
                  </div>
                );
              })}
              <p className="text-[13px] leading-[1.5] text-neutral-700 [text-wrap:pretty]">
                A human's judgement moves the model. This is the only place in Notarium where that
                happens.
              </p>
            </div>
            <div className={cn(panel, 'flex flex-col gap-[11px]')}>
              <Kicker size="md" className="text-neutral-600">
                Rate the session
              </Kicker>
              <div className="flex gap-[7px]">
                {STARS.map((n) => {
                  const on = n <= rating;
                  return (
                    <button
                      key={n}
                      data-num
                      type="button"
                      onClick={() => set({ rating: n })}
                      aria-label={`${n} of 5`}
                      aria-pressed={on}
                      className={cn(
                        'border w-[38px] h-[38px] text-sm font-extrabold cursor-pointer hover:border-ink',
                        on
                          ? 'bg-ink border-ink text-accent-100'
                          : 'bg-transparent border-neutral-400 text-neutral-700',
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <p className="text-[13px] text-neutral-700">
                Your rating weights his match score for other learners, not his position in your
                board.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
