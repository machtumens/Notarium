import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Kicker } from '@/components/ui/kicker';
import { Pill } from '@/components/ui/pill';
import { OTHER_SETS, QUESTION, WHY_SET } from '@/lib/data';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

const LENGTHS = ['10 min', '25 min', '60 min'];
/**
 * 12 progress segments encoded as ink weight, not hue: the four done recede to mid-grey, the
 * current one is solid ink (the loudest mark on the strip), the rest sit at hairline weight.
 * Square — a 22×5 segment is a bar, not one of the genuinely circular things that keep a radius.
 */
const DOTS = Array.from({ length: 12 }, (_, i) =>
  i < 4 ? 'bg-neutral-600' : i === 4 ? 'bg-ink' : 'bg-neutral-300',
);

const primary = buttonVariants({ variant: 'primary' });
const slot = buttonVariants({ variant: 'slot' });

/**
 * Verdict block. Both states are content under a rule; the heading already says which one it is,
 * so the only differentiation is rule weight — a wrong answer is the actionable one, so it gets the ink.
 */
const VERDICT = {
  right: {
    box: 'border-t border-neutral-300',
    title: 'Benar — 0,1 mol',
    body: 'n = m / Mr = 9,8 / 98 = 0,1 mol. That is the third of these you have taken in a row, and Stoikiometri just moved off the weak list.',
  },
  wrong: {
    box: 'border-t-2 border-ink',
    title: 'Not this time — the answer is 0,1 mol',
    body: 'n = m / Mr = 9,8 / 98 = 0,1 mol. The division is the whole question — this is the same step that cost you question 4 on Tuesday, so two more like it are queued.',
  },
};

/**
 * Option skin once an answer is picked: a hairline row by default, the correct one inverts to solid
 * ink, and the learner's own wrong pick keeps a heavier hairline. No tint anywhere — the `mark` label
 * states the verdict in words and the ink weight carries it visually.
 */
function optionSkin(i: number, picked: number | null) {
  const revealed = picked !== null;
  if (revealed && i === QUESTION.correct)
    return {
      box: 'border-ink bg-ink',
      key: 'border-accent-100 text-accent-100',
      label: 'text-accent-100',
      mark: 'correct',
      markFg: 'text-accent-300',
    };
  if (revealed && i === picked)
    return {
      box: 'border-ink bg-transparent',
      key: 'border-ink text-ink',
      label: 'text-ink',
      mark: 'your answer',
      markFg: 'text-neutral-700',
    };
  return {
    box: 'border-neutral-300 bg-transparent',
    key: 'border-neutral-400 text-neutral-700',
    label: 'text-neutral-900',
    mark: '',
    markFg: 'text-neutral-700',
  };
}

/**
 * Practice: the recommended set + other sets (landing), then one worked question (question).
 * The landing/question switch is global (`practiceView`) so Home's "Start drill" can open the drill directly.
 */
export function Practice() {
  const { practiceView, gamification, set } = useApp();
  const [length, setLength] = useState('25 min');
  const [picked, setPicked] = useState<number | null>(null);
  const [hintOpen, setHintOpen] = useState(false);

  const startPractice = () => {
    setPicked(null);
    setHintOpen(false);
    set({ practiceView: 'question' });
  };
  const endPractice = () => {
    setPicked(null);
    setHintOpen(false);
    set({ practiceView: 'landing' });
  };

  return (
    <div data-screen-label="Practice">
      {practiceView === 'landing' && (
        <div className="flex flex-wrap gap-x-10 gap-y-8 items-start">
          <div className="flex-[100_1_400px] min-w-[min(100%,320px)] flex flex-col gap-9">
            <div className="border-t-2 border-ink pt-5 flex flex-col gap-3.5">
              <Kicker size="md" className="text-neutral-600">
                Recommended set
              </Kicker>
              <h3 className="text-[clamp(24px,3.2vw,40px)] max-w-[28ch] [text-wrap:balance]">
                Stoikiometri · mol dan massa
              </h3>
              <p className="text-[15px] leading-[1.55] text-neutral-700 max-w-[60ch] [text-wrap:pretty]">
                Twelve questions built from the four you got wrong on Tuesday. Two are deliberately
                easier so the set starts in your hands.
              </p>
              <div className="flex items-center gap-[9px] flex-wrap">
                <span className="text-[13px] font-bold text-neutral-700 mr-1">Session length</span>
                {LENGTHS.map((l) => (
                  <Pill
                    key={l}
                    on={length === l}
                    onClick={() => setLength(l)}
                    className="px-[17px] py-[9px] text-[13px] font-bold"
                  >
                    <span data-num>{l}</span>
                  </Pill>
                ))}
              </div>
              <button
                type="button"
                onClick={startPractice}
                className={cn(primary, 'self-start px-7 py-[13px] text-[16px] mt-1')}
              >
                Start practice
              </button>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-8 gap-y-6">
              {OTHER_SETS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={startPractice}
                  className="text-left border-t border-neutral-300 bg-transparent pt-3 pb-1 cursor-pointer flex flex-col gap-1.5 hover:border-ink"
                >
                  <span className="meta">{s.subject}</span>
                  <span className="font-heading text-[17px] font-extrabold tracking-[-0.02em] leading-[1.2] text-ink">
                    {s.title}
                  </span>
                  <span data-num className="text-[13px] text-neutral-600">
                    {s.meta}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-[1_1_290px] min-w-[min(100%,275px)] max-w-[360px] border-t border-neutral-300 pt-4 flex flex-col gap-3.5">
            <h4 className="text-[19px]">Why this set</h4>
            {WHY_SET.map((w) => (
              <div key={w} className="flex gap-[11px] items-baseline">
                <span className="w-[5px] h-[5px] rounded-full bg-ink flex-[0_0_5px] mt-2" />
                <span className="flex-1 min-w-0 text-[14px] leading-[1.5] text-neutral-700">
                  {w}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {practiceView === 'question' && (
        <div className="max-w-[820px] flex flex-col gap-6">
          <div className="flex items-center gap-3.5 flex-wrap">
            <div className="flex gap-[5px]">
              {DOTS.map((cls, i) => (
                <span key={i} className={cn('block w-[22px] h-[5px]', cls)} />
              ))}
            </div>
            <span data-num className="text-[13px] font-bold text-neutral-700">
              Question 5 of 12
            </span>
            <span data-num className="ml-auto text-[13px] font-bold text-ink">
              {gamification ? '+40 XP this session' : '4 correct so far'}
            </span>
            <button
              type="button"
              onClick={endPractice}
              className={cn(slot, 'px-4 py-2 text-[13px]')}
            >
              End session
            </button>
          </div>

          <div className="border-t-2 border-ink pt-6 flex flex-col gap-[22px]">
            <Kicker size="md" className="text-neutral-600">
              Kimia · Stoikiometri
            </Kicker>
            <h3 className="text-[clamp(24px,3.2vw,40px)] [text-wrap:pretty]">
              Berapa mol dari 9,8 gram H₂SO₄ jika Mr = 98?
            </h3>
            <div className="flex flex-col">
              {QUESTION.options.map((o, i) => {
                const skin = optionSkin(i, picked);
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setPicked(i)}
                    className={cn(
                      'flex items-center gap-3.5 text-left border-t px-1 py-4 cursor-pointer last:border-b hover:border-ink',
                      skin.box,
                    )}
                  >
                    <span
                      className={cn(
                        'w-7 h-7 border flex items-center justify-center text-[13px] font-extrabold flex-[0_0_28px]',
                        skin.key,
                      )}
                    >
                      {o.key}
                    </span>
                    <span
                      data-num
                      className={cn('flex-1 min-w-0 text-[16px] font-semibold', skin.label)}
                    >
                      {o.label}
                    </span>
                    <span className={cn('text-[13px] font-bold', skin.markFg)}>{skin.mark}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-[11px] flex-wrap">
              <button
                type="button"
                onClick={() => setHintOpen((h) => !h)}
                className={cn(slot, 'px-[18px] py-2.5 text-[14px]')}
              >
                {hintOpen ? 'Hide hint' : 'Show a hint'}
              </button>
              <span className="text-[13px] text-neutral-700">
                Asking for a hint still counts — it just logs differently.
              </span>
            </div>

            {hintOpen && (
              <div className="bg-surface border-l-[3px] border-accent px-5 py-4 text-[15px] leading-[1.55] text-accent-800">
                Start from n = m / Mr. You already have both numbers.
              </div>
            )}

            {picked !== null &&
              (() => {
                const v = picked === QUESTION.correct ? VERDICT.right : VERDICT.wrong;
                return (
                  <div className={cn('pt-4 flex flex-col gap-2', v.box)}>
                    <span className="text-[15px] font-extrabold">{v.title}</span>
                    <p className="text-[15px] leading-[1.6] text-neutral-800 [text-wrap:pretty]">
                      {v.body}
                    </p>
                    <button
                      type="button"
                      onClick={endPractice}
                      className={cn(primary, 'self-start px-[22px] py-[11px] text-[14px] mt-1')}
                    >
                      Next question
                    </button>
                  </div>
                );
              })()}
          </div>
        </div>
      )}
    </div>
  );
}
