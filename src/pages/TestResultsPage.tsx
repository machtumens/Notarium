import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkTheme } from '../theme';
import type { QuizAnswer, QuizSourceType, StructuredQuestion } from './QuizBuilderPage';

// TestResultsPage grades a finished test and shows per-question results (Fork A).
// MCQ / True-False are graded by comparison; short-answer is AI-graded by reusing
// the existing /api/recall/grade endpoint (the gradeRecall pattern), with a
// self-graded fallback when the AI call errors (Locked Decision 5). Wrong answers
// are batched into the SRS via POST /api/quiz/attempt with Promise.allSettled,
// non-blocking (Fork E) — a soft toast surfaces a partial failure.

interface Props {
  questions: StructuredQuestion[];
  answers: QuizAnswer[];
  sourceType: QuizSourceType;
  sourceId: number | null;
  onRestart: () => void;
  onReview: () => void;
}

// 'self' = the AI grader was unavailable, so the user marks it manually.
type GradeStatus = 'correct' | 'incorrect' | 'self';
interface Grade {
  status: GradeStatus;
  score?: number;
  feedback?: string;
}

const SHORT_ANSWER_PASS = 60;

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
const secondaryBtn: React.CSSProperties = {
  padding: '12px 20px',
  background: 'transparent',
  border: `1px solid ${darkTheme.colors.borderColor}`,
  color: darkTheme.colors.textPrimary,
  borderRadius: darkTheme.borderRadius.md,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '15px',
  transition: darkTheme.transitions.default,
};

export default function TestResultsPage({
  questions,
  answers,
  sourceType,
  sourceId,
  onRestart,
  onReview,
}: Props) {
  const [grades, setGrades] = useState<Grade[] | null>(null);
  // "Better than last time" (redesign 2e step 3). Recorded once, when grading
  // settles, so the comparison is against the PREVIOUS test rather than this one.
  const [previous, setPrevious] = useState<{ delta: number; score_pct: number } | null>(null);

  // One SRS attempt per wrong answer. note_id is set only for a single-note
  // source (owned → ownership check passes); a subject source logs a note-less card.
  const logWrong = (q: StructuredQuestion) =>
    api.logQuizAttempt({
      note_id: sourceType === 'note' && sourceId != null ? sourceId : undefined,
      question_text: q.question,
      is_correct: false,
      confidence: 2,
    });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const computed: Grade[] = await Promise.all(
        questions.map(async (q, i): Promise<Grade> => {
          const ans = answers[i];
          if (q.type === 'mcq' || q.type === 'true_false') {
            const ok = ans?.selectedIndex != null && ans.selectedIndex === q.correct_answer;
            return { status: ok ? 'correct' : 'incorrect' };
          }
          // short_answer
          const text = (ans?.text ?? '').trim();
          if (!text) return { status: 'incorrect' };
          const model = (q.model_answer ?? '').trim();
          if (!model) return { status: 'self' };
          try {
            const res = await api.gradeRecall({ note_content: model, recall_text: text });
            const score = typeof res.score === 'number' ? res.score : 0;
            return {
              status: score >= SHORT_ANSWER_PASS ? 'correct' : 'incorrect',
              score,
              feedback: res.feedback,
            };
          } catch {
            // AI grader unavailable → hand off to the self-grade control.
            return { status: 'self' };
          }
        }),
      );
      if (cancelled) return;
      setGrades(computed);

      // Batch the SRS writes for the definitively-wrong answers. Non-blocking:
      // a failure only surfaces as a soft toast and never blocks the render.
      const wrong = questions.filter((_, i) => computed[i].status === 'incorrect');
      if (wrong.length > 0) {
        const settled = await Promise.allSettled(wrong.map((q) => logWrong(q)));
        if (!cancelled && settled.some((s) => s.status === 'rejected')) {
          toast('Some review cards may not have been saved.');
        }
      }

      // Record the finished mock. Non-blocking and failure-tolerant, exactly
      // like the SRS batch above: a history write must never cost the student
      // their results screen.
      try {
        const res = await api.completeTest({
          question_count: questions.length,
          correct_count: computed.filter((g) => g.status === 'correct').length,
          source_type: sourceType,
          source_id: sourceId,
        });
        if (!cancelled && res.previous) {
          setPrevious({ delta: res.previous.delta, score_pct: res.previous.score_pct });
        }
      } catch {
        // History is a nice-to-have here; swallow and move on.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selfGrade = (i: number, ok: boolean) => {
    setGrades((prev) =>
      prev
        ? prev.map((g, idx) => (idx === i ? { ...g, status: ok ? 'correct' : 'incorrect' } : g))
        : prev,
    );
    if (!ok) logWrong(questions[i]).catch(() => {});
  };

  if (!grades) {
    return (
      <div style={pageWrap}>
        <div style={inner}>
          <LoadingSpinner message="Grading your test…" />
        </div>
      </div>
    );
  }

  const correctCount = grades.filter((g) => g.status === 'correct').length;
  const pendingSelf = grades.some((g) => g.status === 'self');

  // Per-topic breakdown (redesign option 2e, step 3 — "Waves 9/10, Optics 8/12").
  // Grouped from the generator's per-question `topic`. Older cached quizzes have
  // no topic, so the section simply does not render rather than inventing a
  // bucket — a breakdown that lumps everything under "General" would be worse
  // than none, because it looks like real information and is not.
  const topicRows = (() => {
    const seen = questions.some((q) => (q.topic ?? '').trim().length > 0);
    if (!seen) return [];
    const by = new Map<string, { correct: number; total: number }>();
    questions.forEach((q, i) => {
      const t = (q.topic ?? '').trim();
      if (!t) return;
      const row = by.get(t) ?? { correct: 0, total: 0 };
      row.total += 1;
      if (grades[i]?.status === 'correct') row.correct += 1;
      by.set(t, row);
    });
    // Weakest first — the point of the breakdown is what to go and revise.
    return [...by.entries()]
      .map(([topic, r]) => ({ topic, ...r, pct: r.total ? r.correct / r.total : 0 }))
      .sort((a, b) => a.pct - b.pct);
  })();

  return (
    <div style={pageWrap}>
      <div style={inner}>
        <div style={card}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px 0' }}>Results</h1>
          <p style={{ margin: 0, color: darkTheme.colors.textSecondary, fontSize: '15px' }}>
            {correctCount} / {questions.length} correct
            {previous && (
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: previous.delta >= 0 ? 'rgba(99,163,127,.18)' : 'rgba(191,107,79,.16)',
                  color: previous.delta >= 0 ? '#1f5c3e' : '#8a3f28',
                }}
              >
                {previous.delta >= 0 ? '+' : ''}
                {previous.delta} pts vs last time ({previous.score_pct}%)
              </span>
            )}
            {pendingSelf ? ' · some answers need self-grading below' : ''}
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '18px' }}>
            <button style={primaryBtn} onClick={onReview}>
              Go to Review
            </button>
            <button style={secondaryBtn} onClick={onRestart}>
              Build another test
            </button>
          </div>
        </div>

        {topicRows.length > 0 && (
          <div style={{ ...card }}>
            <h2
              className="mono"
              style={{
                fontSize: 10.5,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: darkTheme.colors.textSecondary,
                margin: '0 0 12px',
              }}
            >
              By topic · weakest first
            </h2>
            {topicRows.map((r) => {
              // Clay marks a weak topic — the brief reserves it for exactly this.
              const weak = r.pct < 0.6;
              const bar = weak ? '#bf6b4f' : r.pct < 0.85 ? '#b98a3f' : '#2e7d52';
              return (
                <div key={r.topic} style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{r.topic}</span>
                    <span className="mono" style={{ color: bar, fontWeight: 600 }}>
                      {r.correct}/{r.total}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${r.topic}: ${r.correct} of ${r.total} correct`}
                    style={{
                      height: 6,
                      borderRadius: 999,
                      background: 'rgba(28,42,34,.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round(r.pct * 100)}%`,
                        height: '100%',
                        background: bar,
                        borderRadius: 999,
                        transition: 'width 500ms cubic-bezier(0.16,1,0.3,1)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {questions.map((q, i) => {
          const g = grades[i];
          const ans = answers[i];
          const border =
            g.status === 'correct'
              ? darkTheme.colors.success
              : g.status === 'incorrect'
                ? darkTheme.colors.danger
                : darkTheme.colors.borderColor;
          const options =
            q.type === 'true_false' ? (q.options ?? ['True', 'False']) : (q.options ?? []);
          return (
            <div key={i} style={{ ...card, borderLeft: `3px solid ${border}` }}>
              <p style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 10px 0' }}>
                <span style={{ color: darkTheme.colors.textSecondary }}>{i + 1}. </span>
                {q.question}
              </p>

              {(q.type === 'mcq' || q.type === 'true_false') && (
                <div style={{ fontSize: '14px', lineHeight: 1.7 }}>
                  <div>
                    Your answer:{' '}
                    <strong>
                      {ans?.selectedIndex != null ? options[ans.selectedIndex] : '(blank)'}
                    </strong>
                  </div>
                  {q.correct_answer != null && (
                    <div style={{ color: darkTheme.colors.success }}>
                      Correct: <strong>{options[q.correct_answer]}</strong>
                    </div>
                  )}
                </div>
              )}

              {q.type === 'short_answer' && (
                <div style={{ fontSize: '14px', lineHeight: 1.7 }}>
                  <div>
                    Your answer: <strong>{ans?.text?.trim() || '(blank)'}</strong>
                  </div>
                  {q.model_answer && (
                    <div style={{ color: darkTheme.colors.textSecondary, marginTop: '4px' }}>
                      Model answer: {q.model_answer}
                    </div>
                  )}
                  {typeof g.score === 'number' && (
                    <div style={{ marginTop: '4px' }}>AI score: {g.score}/100</div>
                  )}
                  {g.feedback && (
                    <div style={{ color: darkTheme.colors.textSecondary, marginTop: '4px' }}>
                      {g.feedback}
                    </div>
                  )}
                  {g.status === 'self' && (
                    <div style={{ marginTop: '10px' }}>
                      <p
                        style={{
                          fontSize: '13px',
                          margin: '0 0 8px 0',
                          color: darkTheme.colors.textSecondary,
                        }}
                      >
                        Automatic grading was unavailable — mark yourself:
                      </p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          style={{ ...secondaryBtn, padding: '8px 14px', fontSize: '13px' }}
                          onClick={() => selfGrade(i, true)}
                        >
                          I was correct
                        </button>
                        <button
                          style={{ ...secondaryBtn, padding: '8px 14px', fontSize: '13px' }}
                          onClick={() => selfGrade(i, false)}
                        >
                          I was wrong
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: 600 }}>
                {g.status === 'correct' && (
                  <span style={{ color: darkTheme.colors.success }}>✓ Correct</span>
                )}
                {g.status === 'incorrect' && (
                  <span style={{ color: darkTheme.colors.danger }}>✗ Incorrect</span>
                )}
                {g.status === 'self' && (
                  <span style={{ color: darkTheme.colors.textSecondary }}>Awaiting self-grade</span>
                )}
              </div>

              {q.explanation && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    background: darkTheme.colors.bgTertiary,
                    borderLeft: `3px solid ${darkTheme.colors.accent}`,
                    borderRadius: darkTheme.borderRadius.md,
                    fontSize: '13px',
                    lineHeight: 1.5,
                    color: darkTheme.colors.textSecondary,
                  }}
                >
                  {q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
