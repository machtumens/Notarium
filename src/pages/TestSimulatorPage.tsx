import { useEffect, useMemo, useRef, useState } from 'react';
import { darkTheme } from '../theme';
import type { QuizAnswer, StructuredQuestion } from './QuizBuilderPage';

// Exam hall — redesign brief option 2e, step 2 ("In the hall · timed").
//
// One question at a time with a navigator strip, a flag-for-review toggle and
// Back/Next, replacing the previous scroll-through-everything list. That is the
// brief's design and it is also the better exam UX: it paces the candidate,
// makes "what have I not answered yet" answerable at a glance, and lets someone
// park a hard question instead of stalling on it.
//
// Juniper (#3e7d8c) is the hall's colour — the brief assigns it to exams and
// timed work, replacing the old purple.
//
// UNCHANGED from Phase 4 on purpose: the answers array shape, the onSubmit
// contract, the countdown ref plumbing and the auto-submit-on-expiry path. That
// logic is proven and index-aligned with the grading code; only the presentation
// layer is new. Refresh still loses the timer and progress (accepted known-gap).

interface Props {
  questions: StructuredQuestion[];
  durationSec: number;
  onSubmit: (answers: QuizAnswer[]) => void;
}

const JUNIPER = '#3e7d8c';
const JUNIPER_DEEP = '#2c5f6b';

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  padding: '28px 20px 56px',
  color: darkTheme.colors.textPrimary,
};
const inner: React.CSSProperties = { maxWidth: '760px', margin: '0 auto' };

const glass: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.55)',
  backdropFilter: 'blur(26px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.3)',
  border: '1px solid rgba(255, 255, 255, 0.75)',
  boxShadow: '0 18px 40px rgba(20, 44, 30, 0.18)',
  borderRadius: 16,
};

const pill: React.CSSProperties = {
  height: 38,
  padding: '0 22px',
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  transition: darkTheme.transitions.default,
};

function emptyAnswer(): QuizAnswer {
  return { selectedIndex: null, text: '' };
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isAnswered(q: StructuredQuestion, a: QuizAnswer | undefined): boolean {
  if (!a) return false;
  return q.type === 'short_answer' ? a.text.trim().length > 0 : a.selectedIndex !== null;
}

export default function TestSimulatorPage({ questions, durationSec, onSubmit }: Props) {
  const [answers, setAnswers] = useState<QuizAnswer[]>(() => questions.map(emptyAnswer));
  const [remaining, setRemaining] = useState(durationSec);
  const [current, setCurrent] = useState(0);
  // Flags are a candidate's private working state — they are not submitted.
  const [flagged, setFlagged] = useState<Set<number>>(new Set());

  const answersRef = useRef(answers);
  const finishedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    onSubmit(answersRef.current);
  };

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (remaining === 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const setSelected = (qi: number, idx: number) =>
    setAnswers((prev) => prev.map((a, i) => (i === qi ? { ...a, selectedIndex: idx } : a)));
  const setText = (qi: number, text: string) =>
    setAnswers((prev) => prev.map((a, i) => (i === qi ? { ...a, text } : a)));

  const toggleFlag = (qi: number) =>
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(qi)) next.delete(qi);
      else next.add(qi);
      return next;
    });

  const answeredCount = useMemo(
    () => questions.reduce((n, q, i) => n + (isAnswered(q, answers[i]) ? 1 : 0), 0),
    [questions, answers],
  );

  const lowTime = remaining <= 30;
  const q = questions[current];
  const a = answers[current];
  const last = current === questions.length - 1;

  return (
    <div style={pageWrap}>
      <div style={inner}>
        {/* Hall chrome: which question, and how long is left. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div>
            <div
              className="mono"
              style={{
                fontSize: 10.5,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: JUNIPER_DEEP,
                fontWeight: 600,
              }}
            >
              Exam hall · timed
            </div>
            <h1 style={{ fontSize: 20, margin: '4px 0 0' }}>
              Question {current + 1} of {questions.length}
            </h1>
          </div>
          <div
            aria-label="time remaining"
            aria-live={lowTime ? 'assertive' : 'off'}
            className="mono"
            style={{
              fontSize: 18,
              fontWeight: 700,
              padding: '7px 16px',
              borderRadius: 999,
              background: lowTime ? 'rgba(191,107,79,.16)' : 'rgba(62,125,140,.14)',
              color: lowTime ? '#8a3f28' : JUNIPER_DEEP,
              border: `1px solid ${lowTime ? 'rgba(191,107,79,.45)' : 'rgba(62,125,140,.34)'}`,
            }}
          >
            {fmt(remaining)}
          </div>
        </div>

        {/* Question navigator. Answered = pine, flagged = honey, untouched =
            neutral — so the strip answers "what have I skipped" instantly. */}
        <nav
          aria-label="Question navigator"
          style={{ ...glass, padding: '12px 14px', marginBottom: 14 }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {questions.map((qq, i) => {
              const done = isAnswered(qq, answers[i]);
              const flag = flagged.has(i);
              const here = i === current;
              const bg = flag
                ? 'rgba(201,155,74,.28)'
                : done
                  ? 'rgba(63,148,104,.22)'
                  : 'rgba(28,42,34,.06)';
              const fg = flag ? '#6f5015' : done ? '#1f5c3e' : '#3c4f43';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-label={`Question ${i + 1}${done ? ', answered' : ', not answered'}${flag ? ', flagged' : ''}`}
                  aria-current={here ? 'true' : undefined}
                  className="mono"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    background: bg,
                    color: fg,
                    fontSize: 10.5,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    border: here ? `2px solid ${JUNIPER}` : '1px solid transparent',
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: darkTheme.colors.textSecondary }}>
            {answeredCount} of {questions.length} answered
            {flagged.size > 0 && ` · ${flagged.size} flagged`}
          </div>
        </nav>

        <div style={{ ...glass, padding: 22, marginBottom: 14 }}>
          <p style={{ fontSize: 17, fontWeight: 600, margin: '0 0 16px', lineHeight: 1.45 }}>
            {q.question}
          </p>

          {(q.type === 'mcq' || q.type === 'true_false') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(q.type === 'true_false' ? (q.options ?? ['True', 'False']) : (q.options ?? [])).map(
                (option, idx) => {
                  const selected = a?.selectedIndex === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelected(current, idx)}
                      aria-pressed={selected}
                      style={{
                        padding: '13px 16px',
                        textAlign: 'left',
                        fontSize: 14,
                        cursor: 'pointer',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: selected
                          ? `linear-gradient(180deg, ${JUNIPER}, ${JUNIPER_DEEP})`
                          : 'rgba(255,255,255,.62)',
                        border: `1px solid ${selected ? JUNIPER_DEEP : 'rgba(28,42,34,.12)'}`,
                        // White on juniper, NOT Ink. The previous version put Ink
                        // on the accent fill at 2.97:1, below WCAG AA.
                        color: selected ? '#fff' : '#24382c',
                        fontWeight: selected ? 600 : 400,
                        transition: darkTheme.transitions.fast,
                      }}
                    >
                      <span
                        className="mono"
                        aria-hidden
                        style={{
                          width: 20,
                          height: 20,
                          flex: 'none',
                          borderRadius: 6,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                          background: selected ? 'rgba(255,255,255,.22)' : 'rgba(28,42,34,.07)',
                          color: selected ? '#fff' : '#3c4f43',
                        }}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {option}
                    </button>
                  );
                },
              )}
            </div>
          )}

          {q.type === 'short_answer' && (
            <textarea
              aria-label={`answer ${current + 1}`}
              value={a?.text ?? ''}
              onChange={(e) => setText(current, e.target.value)}
              placeholder="Type your answer…"
              rows={5}
              style={{
                width: '100%',
                padding: 13,
                fontSize: 14,
                resize: 'vertical',
                background: 'rgba(255,255,255,.62)',
                border: '1px solid rgba(28,42,34,.12)',
                borderRadius: 12,
                color: darkTheme.colors.textPrimary,
              }}
            />
          )}
        </div>

        {/* Flag · Back · Next, as the brief lays them out. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => toggleFlag(current)}
            aria-pressed={flagged.has(current)}
            style={{
              ...pill,
              background: flagged.has(current) ? 'rgba(201,155,74,.2)' : 'transparent',
              border: `1px solid ${flagged.has(current) ? 'rgba(185,138,60,.45)' : 'rgba(28,42,34,.18)'}`,
              color: flagged.has(current) ? '#6f5015' : '#3c4f43',
            }}
          >
            {flagged.has(current) ? 'Flagged' : 'Flag'}
          </button>

          <button
            type="button"
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
            style={{
              ...pill,
              background: 'rgba(255,255,255,.62)',
              border: '1px solid rgba(28,42,34,.12)',
              color: '#24382c',
              opacity: current === 0 ? 0.45 : 1,
              cursor: current === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Back
          </button>

          {!last ? (
            <button
              type="button"
              onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
              style={{
                ...pill,
                marginLeft: 'auto',
                background: `linear-gradient(180deg, ${JUNIPER}, ${JUNIPER_DEEP})`,
                border: 'none',
                color: '#fff',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.3), 0 10px 22px -12px rgba(44,95,107,.7)',
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              style={{
                ...pill,
                marginLeft: 'auto',
                background: 'linear-gradient(180deg, #3f9468, #2a6c47)',
                border: 'none',
                color: '#fff',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.35), 0 10px 22px -12px rgba(42,108,71,.7)',
              }}
            >
              Submit test
            </button>
          )}
        </div>

        {/* Always reachable: a candidate must be able to hand in early from any
            question, not only from the last one. */}
        {!last && (
          <button
            type="button"
            onClick={finish}
            style={{
              ...pill,
              marginTop: 14,
              width: '100%',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px dashed rgba(28,42,34,.22)',
              color: '#1f5c3e',
            }}
          >
            Submit test now ({answeredCount}/{questions.length} answered)
          </button>
        )}
      </div>
    </div>
  );
}
