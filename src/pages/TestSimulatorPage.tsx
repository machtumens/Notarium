import { useEffect, useRef, useState } from 'react';
import { darkTheme } from '../theme';
import type { QuizAnswer, StructuredQuestion } from './QuizBuilderPage';

// TestSimulatorPage runs a generated test: it renders every question (one card
// each, input shaped by question type) and a whole-test countdown timer
// (setInterval + useRef, Fork D). When the timer hits zero it auto-submits via
// the exact same path as the manual "Submit test" button. Refresh loses the
// timer + progress (accepted known-gap).

interface Props {
  questions: StructuredQuestion[];
  durationSec: number;
  onSubmit: (answers: QuizAnswer[]) => void;
}

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background: darkTheme.colors.bgPrimary,
  color: darkTheme.colors.textPrimary,
  padding: '32px 20px 64px',
};
const inner: React.CSSProperties = { maxWidth: '720px', margin: '0 auto' };
const card: React.CSSProperties = {
  background: darkTheme.colors.bgSecondary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.lg,
  padding: '20px',
  marginBottom: '16px',
};
const primaryBtn: React.CSSProperties = {
  padding: '12px 20px',
  background: darkTheme.colors.accent,
  border: 'none',
  color: '#fff',
  borderRadius: darkTheme.borderRadius.md,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '15px',
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

export default function TestSimulatorPage({ questions, durationSec, onSubmit }: Props) {
  const [answers, setAnswers] = useState<QuizAnswer[]>(() => questions.map(emptyAnswer));
  const [remaining, setRemaining] = useState(durationSec);

  // Refs so the interval + the auto-submit read the freshest values without
  // re-arming the timer every second (avoids a stale-closure double submit).
  const answersRef = useRef(answers);
  const finishedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync answersRef in an effect rather than during render (react-hooks/refs):
  // writing a ref during render is unsafe under concurrent rendering. This runs
  // before any timer/handler that reads answersRef.current, so finish() still
  // submits the freshest answers.
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    onSubmit(answersRef.current);
  };

  // Whole-test countdown (setInterval + useRef).
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Auto-submit on expiry — same path as the manual button.
  useEffect(() => {
    if (remaining === 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const setSelected = (qi: number, idx: number) =>
    setAnswers((prev) => prev.map((a, i) => (i === qi ? { ...a, selectedIndex: idx } : a)));
  const setText = (qi: number, text: string) =>
    setAnswers((prev) => prev.map((a, i) => (i === qi ? { ...a, text } : a)));

  const lowTime = remaining <= 30;

  return (
    <div style={pageWrap}>
      <div style={inner}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            position: 'sticky',
            top: 0,
            background: darkTheme.colors.bgPrimary,
            padding: '8px 0',
            zIndex: 1,
          }}
        >
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: 0 }}>Test in progress</h1>
          <div
            aria-label="time remaining"
            style={{
              fontSize: '18px',
              fontWeight: 700,
              padding: '6px 14px',
              borderRadius: darkTheme.borderRadius.full,
              background: lowTime ? 'rgba(239, 68, 68, 0.15)' : darkTheme.colors.bgTertiary,
              color: lowTime ? darkTheme.colors.danger : darkTheme.colors.textPrimary,
              border: `1px solid ${lowTime ? darkTheme.colors.danger : darkTheme.colors.borderColor}`,
            }}
          >
            ⏱ {fmt(remaining)}
          </div>
        </div>

        {questions.map((q, qi) => (
          <div key={qi} style={card}>
            <p style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 14px 0' }}>
              <span style={{ color: darkTheme.colors.textSecondary }}>{qi + 1}. </span>
              {q.question}
            </p>

            {(q.type === 'mcq' || q.type === 'true_false') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(q.type === 'true_false'
                  ? (q.options ?? ['True', 'False'])
                  : (q.options ?? [])
                ).map((option, idx) => {
                  const selected = answers[qi]?.selectedIndex === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelected(qi, idx)}
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '14px',
                        cursor: 'pointer',
                        borderRadius: darkTheme.borderRadius.md,
                        background: selected
                          ? darkTheme.colors.accent
                          : darkTheme.colors.bgTertiary,
                        border: `1px solid ${selected ? darkTheme.colors.accent : darkTheme.colors.borderColor}`,
                        color: darkTheme.colors.textPrimary,
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'short_answer' && (
              <textarea
                aria-label={`answer ${qi + 1}`}
                value={answers[qi]?.text ?? ''}
                onChange={(e) => setText(qi, e.target.value)}
                placeholder="Type your answer…"
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  resize: 'vertical',
                  background: darkTheme.colors.bgTertiary,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: darkTheme.borderRadius.md,
                  color: darkTheme.colors.textPrimary,
                }}
              />
            )}
          </div>
        ))}

        <button style={{ ...primaryBtn, width: '100%' }} onClick={finish}>
          Submit test
        </button>
      </div>
    </div>
  );
}
