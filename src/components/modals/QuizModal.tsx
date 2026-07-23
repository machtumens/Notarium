import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import {
  darkTheme,
  modalOverlayStyle,
  modalContentStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
} from '../../theme';

interface QuizModalProps {
  noteId: number;
  onClose: () => void;
}

interface Question {
  id?: number;
  question: string;
  options: string[];
  correctAnswer?: number;
  correct_answer?: number;
  explanation?: string;
}

type Stage = 'answer' | 'confidence' | 'reveal';

const CONFIDENCE_OPTIONS = [
  { value: 1, label: 'Guessing' },
  { value: 2, label: 'Fairly sure' },
  { value: 3, label: 'Confident' },
];

const getCorrectIndex = (q?: Question): number | undefined => q?.correctAnswer ?? q?.correct_answer;

export default function QuizModal({ noteId, onClose }: QuizModalProps) {
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [confidences, setConfidences] = useState<(number | null)[]>([]);
  const [stage, setStage] = useState<Stage>('answer');
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the effect; behavior-preserving
    loadQuiz();
  }, [noteId]);

  const loadQuiz = async () => {
    try {
      setLoading(true);
      const data = await api.ai.generateQuiz(noteId);
      const quizData = data.quiz || { questions: [] };
      const count = quizData.questions?.length || 0;
      setQuiz(quizData);
      setAnswers(new Array(count).fill(null));
      setConfidences(new Array(count).fill(null));
      setCurrentQuestion(0);
      setStage('answer');
      setShowResults(false);
      setScore(0);
    } catch (error) {
      console.error('Failed to load quiz:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (optionIndex: number) => {
    if (stage !== 'answer') return;
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = optionIndex;
    setAnswers(newAnswers);
    setStage('confidence');
  };

  const handleConfidence = (confidence: number) => {
    const newConfidences = [...confidences];
    newConfidences[currentQuestion] = confidence;
    setConfidences(newConfidences);
    setStage('reveal');

    logAttempt(currentQuestion, confidence);
  };

  const logAttempt = (idx: number, confidence: number) => {
    const q: Question | undefined = quiz?.questions?.[idx];
    if (!q) return;
    const isCorrect = answers[idx] === getCorrectIndex(q);

    api
      .logQuizAttempt({
        note_id: noteId,
        question_text: q.question,
        is_correct: isCorrect,
        confidence,
      })
      .then((res) => {
        if (res?.success && typeof res.current_streak === 'number') {
          toast.success(`Streak: ${res.current_streak} · +${res.learning_points ?? 0} pts`);
        }
      })
      .catch(() => {
        // Non-blocking: logging failures must never interrupt the quiz.
      });
  };

  const goToNext = () => {
    if (currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setStage('answer');
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!quiz?.questions) return;

    let correctCount = 0;
    quiz.questions.forEach((q: Question, idx: number) => {
      if (answers[idx] === getCorrectIndex(q)) {
        correctCount++;
      }
    });

    setScore(Math.round((correctCount / quiz.questions.length) * 100));
    setShowResults(true);
  };

  if (loading) {
    return (
      <div style={modalOverlayStyle}>
        <div style={modalContentStyle as React.CSSProperties}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div
              style={{
                display: 'inline-block',
                width: '40px',
                height: '40px',
                border: '3px solid var(--border-color)',
                borderTop: `3px solid ${darkTheme.colors.accent}`,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: '16px',
              }}
            ></div>
            <p>Generating quiz...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!quiz?.questions || quiz.questions.length === 0) {
    return (
      <div style={modalOverlayStyle}>
        <div style={modalContentStyle as React.CSSProperties}>
          <p style={{ margin: 0, textAlign: 'center' }}>
            Failed to generate quiz. Please try again.
          </p>
          <button
            onClick={onClose}
            style={
              {
                ...buttonSecondaryStyle,
                width: '100%',
                marginTop: '16px',
              } as React.CSSProperties
            }
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (showResults) {
    return (
      <div style={modalOverlayStyle}>
        <div style={modalContentStyle as React.CSSProperties}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, marginBottom: '16px' }}>
            Quiz Results
          </h2>
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              background: darkTheme.colors.bgSecondary,
              borderRadius: darkTheme.borderRadius.lg,
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                fontSize: '48px',
                fontWeight: 'bold',
                color: score >= 70 ? '#86efac' : '#fca5a5',
                marginBottom: '8px',
              }}
            >
              {score}%
            </div>
            <p
              style={{
                margin: 0,
                color: darkTheme.colors.textSecondary,
                marginBottom: '16px',
              }}
            >
              You got{' '}
              {answers.filter((a, idx) => a === getCorrectIndex(quiz.questions[idx])).length} out of{' '}
              {quiz.questions.length} questions correct
            </p>
            {score >= 70 ? (
              <p style={{ margin: 0, color: '#86efac' }}>Great job! You passed the quiz! 🎉</p>
            ) : (
              <p style={{ margin: 0, color: '#fca5a5' }}>Keep practicing to improve your score!</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={loadQuiz}
              style={
                {
                  ...buttonSecondaryStyle,
                  flex: 1,
                } as React.CSSProperties
              }
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Retake Quiz
            </button>
            <button
              onClick={onClose}
              style={
                {
                  ...buttonPrimaryStyle,
                  flex: 1,
                } as React.CSSProperties
              }
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question: Question = quiz.questions[currentQuestion];
  const selected = answers[currentQuestion];
  const correctIndex = getCorrectIndex(question);
  const isRevealed = stage === 'reveal';
  const isCorrect = isRevealed && selected === correctIndex;

  const optionBackground = (idx: number): string => {
    if (isRevealed) {
      if (idx === correctIndex) return 'rgba(134, 239, 172, 0.15)';
      if (idx === selected) return 'rgba(252, 165, 165, 0.15)';
      return darkTheme.colors.bgTertiary;
    }
    return selected === idx ? darkTheme.colors.accent : darkTheme.colors.bgTertiary;
  };

  const optionBorder = (idx: number): string => {
    if (isRevealed) {
      if (idx === correctIndex) return '#86efac';
      if (idx === selected) return '#fca5a5';
      return darkTheme.colors.borderColor;
    }
    return selected === idx ? darkTheme.colors.accent : darkTheme.colors.borderColor;
  };

  return (
    <div style={modalOverlayStyle}>
      <div
        style={
          {
            ...modalContentStyle,
            maxWidth: '500px',
          } as React.CSSProperties
        }
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          }}
        >
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', margin: 0 }}>
            Quiz ({currentQuestion + 1}/{quiz.questions.length})
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: darkTheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: '24px',
              transition: darkTheme.transitions.default,
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = darkTheme.colors.textSecondary)}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            background: darkTheme.colors.bgSecondary,
            padding: '16px',
            borderRadius: darkTheme.borderRadius.lg,
            marginBottom: '24px',
          }}
        >
          <p
            style={{
              fontSize: '16px',
              fontWeight: '600',
              margin: 0,
              marginBottom: '16px',
            }}
          >
            {question?.question}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {question?.options?.map((option: string, idx: number) => {
              const interactive = stage === 'answer';
              return (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  disabled={!interactive}
                  style={{
                    padding: '12px 16px',
                    background: optionBackground(idx),
                    border: `1px solid ${optionBorder(idx)}`,
                    borderRadius: darkTheme.borderRadius.md,
                    color: !isRevealed && selected === idx ? '#fff' : darkTheme.colors.textPrimary,
                    cursor: interactive ? 'pointer' : 'default',
                    textAlign: 'left',
                    transition: darkTheme.transitions.default,
                    fontSize: '14px',
                  }}
                  onMouseOver={(e) => {
                    if (interactive && selected !== idx) {
                      e.currentTarget.style.background = darkTheme.colors.accent;
                      e.currentTarget.style.color = '#fff';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (interactive && selected !== idx) {
                      e.currentTarget.style.background = darkTheme.colors.bgTertiary;
                      e.currentTarget.style.color = darkTheme.colors.textPrimary;
                    }
                  }}
                >
                  {isRevealed && idx === correctIndex ? '✓ ' : ''}
                  {isRevealed && idx === selected && idx !== correctIndex ? '✗ ' : ''}
                  {option}
                </button>
              );
            })}
          </div>

          {/* FEATURE #23 — confidence prompt shown after answering, before the reveal */}
          {stage === 'confidence' && (
            <div style={{ marginTop: '20px' }}>
              <p
                style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  margin: 0,
                  marginBottom: '10px',
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
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      background: darkTheme.colors.bgTertiary,
                      border: `1px solid ${darkTheme.colors.borderColor}`,
                      borderRadius: darkTheme.borderRadius.md,
                      color: darkTheme.colors.textPrimary,
                      cursor: 'pointer',
                      fontSize: '13px',
                      transition: darkTheme.transitions.default,
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = darkTheme.colors.accent;
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = darkTheme.colors.bgTertiary;
                      e.currentTarget.style.color = darkTheme.colors.textPrimary;
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* FEATURE #25 — immediate elaborative feedback: correctness + explanation */}
          {isRevealed && (
            <div style={{ marginTop: '16px' }}>
              <p
                style={{
                  margin: 0,
                  marginBottom: question?.explanation ? '10px' : 0,
                  fontSize: '14px',
                  fontWeight: '600',
                  color: isCorrect ? '#86efac' : '#fca5a5',
                }}
              >
                {isCorrect ? 'Correct!' : 'Not quite.'}
              </p>
              {question?.explanation && (
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
                  }}
                >
                  {question.explanation}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {isRevealed ? (
            <button
              onClick={goToNext}
              style={
                {
                  ...buttonPrimaryStyle,
                  flex: 1,
                } as React.CSSProperties
              }
            >
              {currentQuestion < quiz.questions.length - 1 ? 'Next Question' : 'See Results'}
            </button>
          ) : (
            <button
              disabled
              style={
                {
                  ...buttonSecondaryStyle,
                  flex: 1,
                  opacity: 0.5,
                  cursor: 'default',
                } as React.CSSProperties
              }
            >
              {stage === 'answer' ? 'Select an answer' : 'Rate your confidence'}
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
