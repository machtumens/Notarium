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

  return (
    <div style={pageWrap}>
      <div style={inner}>
        <div style={card}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 4px 0' }}>Results</h1>
          <p style={{ margin: 0, color: darkTheme.colors.textSecondary, fontSize: '15px' }}>
            {correctCount} / {questions.length} correct
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
