import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import api, { type NoteDetail } from '../lib/api';
import { logger } from '../lib/logger';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkTheme } from '../theme';

// ProcessPage — the standalone /notes/:id/process pipeline. Walks ONE note
// through a linear stepper: read the OCR'd text → generate a summary → take a
// quiz (which seeds SM-2 review cards) → done. It always mounts with a real id
// (either an existing My-Library note opened directly, or a freshly captured
// note redirected here from /notes/capture), so it never branches on a missing id.

type Step = 'ocr-review' | 'summary' | 'quiz' | 'srs-done';
type QuizStage = 'answer' | 'confidence' | 'reveal';

// Quiz question shape — mirrors the backend generateQuiz output. The correct
// index is exposed under either `correctAnswer` or `correct_answer` depending on
// the provider, so both are read (reference: QuizModal.tsx, not imported).
interface QuizQuestion {
  id?: number;
  question: string;
  options: string[];
  correctAnswer?: number;
  correct_answer?: number;
  explanation?: string;
}
interface QuizShape {
  questions: QuizQuestion[];
  title?: string;
}

const getCorrectIndex = (q?: QuizQuestion): number | undefined =>
  q?.correctAnswer ?? q?.correct_answer;

const CONFIDENCE_OPTIONS = [
  { value: 1, label: 'Guessing' },
  { value: 2, label: 'Fairly sure' },
  { value: 3, label: 'Confident' },
];

const STEPS: { key: Step; label: string }[] = [
  { key: 'ocr-review', label: 'Review text' },
  { key: 'summary', label: 'Summary' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'srs-done', label: 'Done' },
];

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background: darkTheme.colors.bgPrimary,
  color: darkTheme.colors.textPrimary,
  padding: '32px 20px 64px',
};
const inner: React.CSSProperties = { maxWidth: '760px', margin: '0 auto' };
const card: React.CSSProperties = {
  background: darkTheme.colors.bgSecondary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.lg,
  padding: '24px',
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

function StepIndicator({ current }: { current: Step }) {
  const activeIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
      {STEPS.map((s, idx) => {
        const done = idx < activeIdx;
        const active = idx === activeIdx;
        return (
          <div
            key={s.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: darkTheme.borderRadius.full,
              fontSize: '13px',
              fontWeight: 600,
              background: active
                ? darkTheme.colors.accent
                : done
                  ? 'rgba(74, 222, 128, 0.12)'
                  : darkTheme.colors.bgTertiary,
              color: active
                ? '#fff'
                : done
                  ? darkTheme.colors.success
                  : darkTheme.colors.textSecondary,
              border: `1px solid ${active ? darkTheme.colors.accent : darkTheme.colors.borderColor}`,
            }}
          >
            <span>{done ? '✓' : idx + 1}</span>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

export default function ProcessPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const noteId = Number(id);

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [step, setStep] = useState<Step>('ocr-review');
  const [showAlreadyProcessed, setShowAlreadyProcessed] = useState(false);

  // Summary step
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Quiz step (cached in component state for the session; only re-fetched on an
  // explicit Regenerate click — a remount never silently regenerates).
  const [quiz, setQuiz] = useState<QuizShape | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [quizStage, setQuizStage] = useState<QuizStage>('answer');
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!Number.isFinite(noteId) || noteId <= 0) {
        setLoadError(true);
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const { note: fetched } = await api.notes.getNote(noteId);
        if (cancelled) return;
        setNote(fetched);
        // Already-processed re-entry: default to the "Already processed" card
        // (Review-first) when this note already has a summary.
        if (fetched.summary) setShowAlreadyProcessed(true);
      } catch (err) {
        if (cancelled) return;
        logger.error('process', 'Failed to load note', err);
        toast.error('Could not load this note. It may not exist or is not yours.');
        setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const runSummary = async () => {
    if (!note) return;
    try {
      setSummaryLoading(true);
      // MUST pass extracted_text as content — the endpoint 400s on empty content.
      const { summary: text } = await api.ai.generateSummary(noteId, note.extracted_text || '');
      setSummary(text);
    } catch (err) {
      logger.error('process', 'Failed to generate summary', err);
      toast.error('Failed to generate a summary. Try again.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const runQuiz = async () => {
    if (!note) return;
    try {
      setQuizLoading(true);
      // Same non-empty-content rule as the summary step.
      const { quiz: fresh } = await api.ai.generateQuiz(noteId, note.extracted_text || '');
      setQuiz(fresh as QuizShape);
      setCurrentQ(0);
      setSelected(null);
      setQuizStage('answer');
      setCorrectCount(0);
    } catch (err) {
      logger.error('process', 'Failed to generate quiz', err);
      toast.error('Failed to generate a quiz. Try again.');
    } finally {
      setQuizLoading(false);
    }
  };

  const goToSummary = () => {
    setStep('summary');
    if (!summary && !summaryLoading) runSummary();
  };

  const goToQuiz = () => {
    setStep('quiz');
    if (!quiz && !quizLoading) runQuiz();
  };

  const questions = quiz?.questions ?? [];
  const question: QuizQuestion | undefined = questions[currentQ];

  const handleAnswer = (idx: number) => {
    if (quizStage !== 'answer') return;
    setSelected(idx);
    setQuizStage('confidence');
  };

  const handleConfidence = (value: number) => {
    if (!question) return;
    setQuizStage('reveal');
    const isCorrect = selected === getCorrectIndex(question);
    if (isCorrect) setCorrectCount((c) => c + 1);
    // Log the attempt (this is the real SRS write). Non-blocking: a logging
    // failure must never interrupt the quiz.
    api
      .logQuizAttempt({
        note_id: noteId,
        question_text: question.question,
        is_correct: isCorrect,
        confidence: value,
      })
      .then((res) => {
        if (res?.success && typeof res.current_streak === 'number') {
          toast.success(`Streak: ${res.current_streak} · +${res.learning_points ?? 0} pts`);
        }
      })
      .catch(() => {
        /* non-blocking */
      });
  };

  const handleNextQuestion = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ((q) => q + 1);
      setSelected(null);
      setQuizStage('answer');
    } else {
      setStep('srs-done');
    }
  };

  // --- Render -------------------------------------------------------------

  if (isLoading) {
    return (
      <div style={pageWrap}>
        <div style={inner}>
          <LoadingSpinner message="Loading note..." />
        </div>
      </div>
    );
  }

  if (loadError || !note) {
    return (
      <div style={pageWrap}>
        <div style={inner}>
          <div style={card}>
            <h1 style={{ fontSize: '20px', margin: '0 0 8px 0' }}>Note unavailable</h1>
            <p style={{ margin: '0 0 20px 0', color: darkTheme.colors.textSecondary }}>
              We couldn't open this note. It may have been removed, or it isn't yours.
            </p>
            <button style={primaryBtn} onClick={() => navigate('/my-notes')}>
              Back to My Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <div style={inner}>
        <button
          onClick={() => navigate('/my-notes')}
          style={{
            ...secondaryBtn,
            padding: '6px 12px',
            fontSize: '13px',
            marginBottom: '20px',
          }}
        >
          ← My Library
        </button>

        <h1
          style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 'bold', margin: '0 0 24px 0' }}
        >
          {note.title}
        </h1>

        {showAlreadyProcessed ? (
          <div style={card}>
            <h2 style={{ fontSize: '20px', margin: '0 0 8px 0' }}>Already processed</h2>
            <p style={{ margin: '0 0 20px 0', color: darkTheme.colors.textSecondary }}>
              You've already generated a summary for this note. Jump straight into review, or
              regenerate the study material from scratch.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button style={primaryBtn} onClick={() => navigate('/review')}>
                Review
              </button>
              <button
                style={secondaryBtn}
                onClick={() => {
                  setShowAlreadyProcessed(false);
                  goToSummary();
                }}
              >
                Regenerate
              </button>
            </div>
          </div>
        ) : (
          <>
            <StepIndicator current={step} />

            {step === 'ocr-review' && (
              <div style={card}>
                <h2 style={{ fontSize: '18px', margin: '0 0 12px 0' }}>
                  Review the extracted text
                </h2>
                <div
                  style={{
                    maxHeight: '340px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    background: darkTheme.colors.bgTertiary,
                    border: `1px solid ${darkTheme.colors.borderColor}`,
                    borderRadius: darkTheme.borderRadius.md,
                    padding: '16px',
                    fontSize: '14px',
                    lineHeight: 1.6,
                    color: darkTheme.colors.textSecondary,
                    marginBottom: '20px',
                  }}
                >
                  {note.extracted_text?.trim()
                    ? note.extracted_text
                    : 'No extracted text is available for this note.'}
                </div>
                <button style={primaryBtn} onClick={goToSummary}>
                  Continue to Summary
                </button>
              </div>
            )}

            {step === 'summary' && (
              <div style={card}>
                <h2 style={{ fontSize: '18px', margin: '0 0 12px 0' }}>Summary</h2>
                {summaryLoading ? (
                  <LoadingSpinner message="Generating summary..." />
                ) : summary ? (
                  <>
                    <div
                      style={{
                        whiteSpace: 'pre-wrap',
                        background: darkTheme.colors.bgTertiary,
                        border: `1px solid ${darkTheme.colors.borderColor}`,
                        borderRadius: darkTheme.borderRadius.md,
                        padding: '16px',
                        fontSize: '14px',
                        lineHeight: 1.6,
                        marginBottom: '20px',
                      }}
                    >
                      {summary}
                    </div>
                    <button style={primaryBtn} onClick={goToQuiz}>
                      Continue to Quiz
                    </button>
                  </>
                ) : (
                  <div>
                    <p style={{ margin: '0 0 16px 0', color: darkTheme.colors.textSecondary }}>
                      Couldn't generate a summary.
                    </p>
                    <button style={secondaryBtn} onClick={runSummary}>
                      Retry
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === 'quiz' && (
              <div style={card}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                  }}
                >
                  <h2 style={{ fontSize: '18px', margin: 0 }}>
                    Quiz{questions.length ? ` (${currentQ + 1}/${questions.length})` : ''}
                  </h2>
                  <button
                    style={{ ...secondaryBtn, padding: '6px 12px', fontSize: '13px' }}
                    onClick={runQuiz}
                    disabled={quizLoading}
                  >
                    Regenerate
                  </button>
                </div>

                {quizLoading ? (
                  <LoadingSpinner message="Generating quiz..." />
                ) : !question ? (
                  <div>
                    <p style={{ margin: '0 0 16px 0', color: darkTheme.colors.textSecondary }}>
                      No quiz questions were generated.
                    </p>
                    <button style={secondaryBtn} onClick={runQuiz}>
                      Try again
                    </button>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px 0' }}>
                      {question.question}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {question.options?.map((option, idx) => {
                        const correctIdx = getCorrectIndex(question);
                        const revealed = quizStage === 'reveal';
                        let bg = darkTheme.colors.bgTertiary;
                        let border = darkTheme.colors.borderColor;
                        if (revealed && idx === correctIdx) {
                          bg = 'rgba(74, 222, 128, 0.15)';
                          border = darkTheme.colors.success;
                        } else if (revealed && idx === selected) {
                          bg = 'rgba(239, 68, 68, 0.15)';
                          border = darkTheme.colors.danger;
                        } else if (!revealed && selected === idx) {
                          bg = darkTheme.colors.accent;
                          border = darkTheme.colors.accent;
                        }
                        return (
                          <button
                            key={idx}
                            onClick={() => handleAnswer(idx)}
                            disabled={quizStage !== 'answer'}
                            style={{
                              padding: '12px 16px',
                              background: bg,
                              border: `1px solid ${border}`,
                              borderRadius: darkTheme.borderRadius.md,
                              color: darkTheme.colors.textPrimary,
                              cursor: quizStage === 'answer' ? 'pointer' : 'default',
                              textAlign: 'left',
                              fontSize: '14px',
                            }}
                          >
                            {revealed && idx === correctIdx ? '✓ ' : ''}
                            {revealed && idx === selected && idx !== correctIdx ? '✗ ' : ''}
                            {option}
                          </button>
                        );
                      })}
                    </div>

                    {quizStage === 'confidence' && (
                      <div style={{ marginTop: '20px' }}>
                        <p
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            margin: '0 0 10px 0',
                            color: darkTheme.colors.textSecondary,
                          }}
                        >
                          How sure are you?
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {CONFIDENCE_OPTIONS.map((c) => (
                            <button
                              key={c.value}
                              onClick={() => handleConfidence(c.value)}
                              style={{ ...secondaryBtn, flex: 1, fontSize: '13px' }}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {quizStage === 'reveal' && (
                      <div style={{ marginTop: '20px' }}>
                        {question.explanation && (
                          <div
                            style={{
                              padding: '12px 14px',
                              background: darkTheme.colors.bgTertiary,
                              border: `1px solid ${darkTheme.colors.borderColor}`,
                              borderLeft: `3px solid ${darkTheme.colors.accent}`,
                              borderRadius: darkTheme.borderRadius.md,
                              fontSize: '13px',
                              lineHeight: 1.5,
                              color: darkTheme.colors.textSecondary,
                              marginBottom: '16px',
                            }}
                          >
                            {question.explanation}
                          </div>
                        )}
                        <button style={primaryBtn} onClick={handleNextQuestion}>
                          {currentQ < questions.length - 1 ? 'Next question' : 'Finish'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {step === 'srs-done' && (
              <div style={card}>
                <h2 style={{ fontSize: '20px', margin: '0 0 8px 0' }}>Nice work! 🎉</h2>
                <p style={{ margin: '0 0 8px 0', color: darkTheme.colors.textSecondary }}>
                  {questions.length > 0
                    ? `You answered ${correctCount} of ${questions.length} correctly.`
                    : 'Quiz complete.'}
                </p>
                <p style={{ margin: '0 0 24px 0', color: darkTheme.colors.textSecondary }}>
                  These questions were added to your review queue — spaced repetition will bring
                  them back at the right time.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button style={primaryBtn} onClick={() => navigate('/review')}>
                    Go to Review
                  </button>
                  <button style={secondaryBtn} onClick={() => navigate('/my-notes')}>
                    Back to My Library
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
