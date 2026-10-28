import { useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { cn, tone } from '@/lib/utils';
import { useApp } from '@/store';

// Fixed phone-frame data from logic.js (`mobileBars`, `mobileWeak`, `tabSet`).
const BARS = [
  { label: 'Kimia', pct: 41 },
  { label: 'Fisika', pct: 66 },
  { label: 'Matematika', pct: 78 },
];
const WEAK = [
  { label: 'Stoikiometri', pct: 41 },
  { label: 'Vektor', pct: 58 },
  { label: 'Trigonometri', pct: 63 },
];
const TABS = ['Home', 'Discover', 'Practice', 'Notes', 'You'];
const STREAK = [
  { n: '12', l: 'day streak' },
  { n: '2,480', l: 'XP' },
  { n: '#7', l: 'kelas 10' },
];

const modeKicker = 'text-xs font-bold tracking-[0.08em] uppercase text-neutral-700';
const kickerAccent = 'text-[10px] font-bold tracking-[0.1em] uppercase text-accent-700';
const accentCard = 'border-t border-ink pt-3.5';
const paperCard = 'border-t border-neutral-300 pt-3.5';
const cta = cn(
  buttonVariants({ variant: 'primary' }),
  'self-stretch p-[13px] text-[15px] min-h-[46px]',
);

/** One phone: label above, bezel, 734px screen, and the tab bar with the active dot. */
function Phone({
  label,
  active,
  children,
}: {
  label: string;
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-[372px] flex-[0_0_372px] flex flex-col gap-[11px]">
      <span className="text-xs font-bold tracking-[0.09em] uppercase text-neutral-700">
        {label}
      </span>
      <div className="bg-surface border border-ink rounded-[40px] p-3">
        <div className="bg-bg rounded-[30px] h-[734px] flex flex-col overflow-hidden">
          {children}
          <div className="border-t border-neutral-300 bg-surface pt-2.5 px-2 pb-3.5 flex justify-around">
            {TABS.map((t) => {
              const on = t === active;
              return (
                <span
                  key={t}
                  className="flex flex-col items-center gap-[5px] min-w-[56px] min-h-[46px] justify-center"
                >
                  <span
                    className={cn(
                      'w-[7px] h-[7px] rounded-full',
                      on ? 'bg-accent' : 'bg-neutral-400',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[11px]',
                      on ? 'font-extrabold text-ink' : 'font-semibold text-neutral-700',
                    )}
                  >
                    {t}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Track({ pct, className }: { pct: number; className?: string }) {
  return (
    <span className={cn('block h-1.5 rounded-full bg-neutral-200 overflow-hidden', className)}>
      <span
        className="block h-1.5 rounded-full"
        style={{ background: tone(pct), width: `${pct}%` }}
      />
    </span>
  );
}

/** The quiet "why" note at the bottom of every frame — a hairline rule, not a tinted card. */
function Note({ kicker, body }: { kicker: string; body: string }) {
  return (
    <div className="border-t border-neutral-300 pt-3 flex flex-col gap-1.5">
      <span className="meta">{kicker}</span>
      <span className="text-[13px] leading-[1.5] text-neutral-700">{body}</span>
    </div>
  );
}

/** The same space on a phone: three frames (normal week · exam week · quick break). */
export function Mobile() {
  const { learner, session, continueAsGuest, set } = useApp();
  const nav = useNavigate();
  // No auth gate in the prototype: enter as guest first so RequireSession does not bounce to /login.
  const openNote = () => {
    if (!session) continueAsGuest();
    nav('/app/notes');
  };
  const startPractice = () => {
    if (!session) continueAsGuest();
    set({ practiceView: 'question' });
    nav('/app/practice');
  };

  return (
    <div data-screen-label="Mobile" className="px-[30px] pt-9 pb-[60px] flex flex-col gap-[22px]">
      <div className="max-w-[70ch]">
        <h2 className="text-[28px]">The same space on a phone</h2>
        <p className="mt-2 text-[15px] text-neutral-700 [text-wrap:pretty]">
          The stable core becomes a tab bar. The adaptive surface stays adaptive — the canvas is one
          column, and the context decides what survives the cut.
        </p>
      </div>

      <div className="flex gap-[26px] flex-wrap">
        <Phone label="Normal week" active="Home">
          <div className="px-5 pt-5 pb-3 flex flex-col gap-[3px]">
            <span className={modeKicker}>Study mode</span>
            <h3 className="text-[25px]">Sore, {learner}</h3>
          </div>
          <div className="flex-1 overflow-hidden pt-1 px-4 pb-4 flex flex-col gap-3">
            <div className={cn(accentCard, 'flex flex-col gap-[9px]')}>
              <span className={kickerAccent}>Next best action</span>
              <span className="font-heading text-xl leading-[1.15] text-accent-900">
                Finish the Stoikiometri note
              </span>
              <span className="text-[13px] leading-[1.5] text-accent-800">
                3 sections left · about 12 minutes
              </span>
              <button type="button" onClick={openNote} className={cta}>
                Continue note
              </button>
            </div>
            <div className={cn(paperCard, 'flex flex-col gap-[11px]')}>
              <span className="text-[15px] font-extrabold">Mastery this week</span>
              {BARS.map((i) => (
                <div key={i.label} className="flex items-center gap-2.5">
                  <span className="flex-1 min-w-0 text-[13px] font-semibold text-neutral-900">
                    {i.label}
                  </span>
                  <Track pct={i.pct} className="w-16 flex-[0_0_64px]" />
                  <span data-num className="text-xs font-bold text-neutral-700 w-[30px] text-right">
                    {i.pct}%
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-300 pt-3.5 flex items-baseline gap-5">
              {STREAK.map((s) => (
                <div key={s.l} className="flex flex-col">
                  <span data-num className="font-heading text-[26px] leading-none text-ink">
                    {s.n}
                  </span>
                  <span className="text-[11px] font-bold text-neutral-600">{s.l}</span>
                </div>
              ))}
            </div>
            <Note
              kicker="Why this moved"
              body="Kimia rose above Biologi after two quizzes under 50%."
            />
          </div>
        </Phone>

        <Phone label="Exam week · 5 days out" active="Practice">
          <div className="bg-ink px-5 py-[22px] flex items-center gap-4">
            <span data-num className="font-heading text-[48px] leading-[0.9] text-accent-100">
              5
            </span>
            <div className="leading-[1.25]">
              <div className="font-heading text-[17px] text-accent-100">
                days until Sumatif Akhir Semester
              </div>
              <div className="text-xs font-semibold text-accent-300 mt-1">
                8–12 Desember · 6 mata pelajaran
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden p-4 flex flex-col gap-3">
            <div className={cn(accentCard, 'flex flex-col gap-[9px]')}>
              <span className={kickerAccent}>Highest value now</span>
              <span className="font-heading text-xl leading-[1.15] text-accent-900">
                Stoikiometri drill · 20 questions
              </span>
              <span className="text-[13px] leading-[1.5] text-accent-800">
                Problem solving 54% against concepts 82%.
              </span>
              <button type="button" onClick={startPractice} className={cta}>
                Start drill
              </button>
            </div>
            <div className={cn(paperCard, 'flex flex-col gap-3')}>
              <span className="text-[15px] font-extrabold">Weak topics</span>
              {WEAK.map((i) => (
                <div key={i.label} className="flex flex-col gap-[5px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-[13px] font-semibold text-neutral-900">{i.label}</span>
                    <span data-num className="text-xs font-bold text-neutral-700">
                      {i.pct}%
                    </span>
                  </div>
                  <Track pct={i.pct} />
                </div>
              ))}
            </div>
            <Note
              kicker="Paused until 12 Desember"
              body="Discover · Community notes · Study groups"
            />
          </div>
        </Phone>

        <Phone label="Quick break · 10 minutes" active="Home">
          <div className="px-5 pt-5 pb-2.5 flex flex-col gap-[3px]">
            <span className={modeKicker}>Quick mode</span>
            <h3 className="text-[25px]">Ten minutes</h3>
          </div>
          <div className="flex-1 pt-2 px-4 pb-4 flex flex-col gap-3.5">
            <div className={cn(accentCard, 'flex flex-col gap-3 flex-1 justify-center')}>
              <span className="font-heading text-[44px] leading-none text-accent-900">3</span>
              <span className="font-heading text-[21px] leading-[1.15] text-accent-900">
                questions · Stoikiometri
              </span>
              <span className="text-sm leading-[1.55] text-accent-800">
                Short enough to finish. All three come from the concept you missed on Tuesday.
              </span>
              <button
                type="button"
                onClick={startPractice}
                className={cn(
                  buttonVariants({ variant: 'primary' }),
                  'p-[15px] text-base min-h-[50px]',
                )}
              >
                Start · 5 min
              </button>
            </div>
            <div className={cn(paperCard, 'flex items-center gap-3')}>
              <span className="font-heading text-[26px] text-ink">4</span>
              <span className="flex-1 text-sm font-semibold text-neutral-800">
                revision cards due
              </span>
              <span className="text-[13px] font-bold text-accent-700">Review</span>
            </div>
            <Note kicker="Why so little" body="You said ten minutes. Nothing else loaded." />
          </div>
        </Phone>
      </div>
    </div>
  );
}
