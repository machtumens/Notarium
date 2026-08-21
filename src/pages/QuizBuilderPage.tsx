import { Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../lib/api';
import { logger } from '../lib/logger';
import LoadingSpinner from '../components/LoadingSpinner';
import { TestSimulatorPage, TestResultsPage } from '../app/lazyPages';
import { darkTheme } from '../theme';

// QuizBuilderPage owns the single /quiz route as an in-page step machine
// (Fork C): build → run → results. The three views live in separate files;
// this page holds the shared state, hands generated questions + duration to the
// runner, and the collected answers to the results view. A refresh resets to
// 'build' (accepted known-gap: no in-progress persistence, matches Phase 2).

export type QuizQuestionType = 'mcq' | 'true_false' | 'short_answer';
export type QuizSourceType = 'note' | 'subject';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface StructuredQuestion {
  type: QuizQuestionType;
  question: string;
  options?: string[];
  correct_answer?: number;
  model_answer?: string;
  explanation?: string;
}

// One answer per question, index-aligned with the questions array.
export interface QuizAnswer {
  selectedIndex: number | null; // mcq / true_false
  text: string; // short_answer
}

type Step = 'build' | 'run' | 'results';
type SourceOption = { id: number; label: string };

const TYPE_OPTIONS: { value: QuizQuestionType; label: string }[] = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short answer' },
];
const DIFFICULTIES: QuizDifficulty[] = ['easy', 'medium', 'hard'];

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background: darkTheme.colors.bgPrimary,
  color: darkTheme.colors.textPrimary,
  padding: '32px 20px 64px',
};
const inner: React.CSSProperties = { maxWidth: '640px', margin: '0 auto' };
const card: React.CSSProperties = {
  background: darkTheme.colors.bgSecondary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.lg,
  padding: '24px',
};
const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  margin: '0 0 8px 0',
  color: darkTheme.colors.textSecondary,
};
const controlBase: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: darkTheme.colors.bgTertiary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.md,
  color: darkTheme.colors.textPrimary,
  fontSize: '14px',
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
const fieldWrap: React.CSSProperties = { marginBottom: '20px' };

function CenteredSpinner() {
  return (
    <div style={pageWrap}>
      <div style={inner}>
        <LoadingSpinner message="Loading..." />
      </div>
    </div>
  );
}

export default function QuizBuilderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('build');

  // Build-form state
  const [sourceType, setSourceType] = useState<QuizSourceType>('note');
  const [notes, setNotes] = useState<SourceOption[]>([]);
  const [subjects, setSubjects] = useState<SourceOption[]>([]);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium');
  const [types, setTypes] = useState<QuizQuestionType[]>(['mcq']);
  const [durationMin, setDurationMin] = useState(10);
  const [generating, setGenerating] = useState(false);

  // Carried into run / results
  const [questions, setQuestions] = useState<StructuredQuestion[]>([]);
  const [durationSec, setDurationSec] = useState(600);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);

  // Load the user's own notes + the subject list for the source pickers. Notes
  // come from /api/notes/my-notes (owned) so the server-side ownership check
  // on generation always passes for a note source.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [notesRes, subjectsRes] = await Promise.all([
          api.request<{ notes: Array<{ id: number; title: string }> }>(
            '/api/notes/my-notes?status=published',
          ),
          api.subjects.getAll(),
        ]);
        if (cancelled) return;
        setNotes((notesRes.notes || []).map((n) => ({ id: n.id, label: n.title })));
        setSubjects((subjectsRes.subjects || []).map((s) => ({ id: s.id, label: s.name })));
      } catch (err) {
        if (!cancelled) logger.error('quiz', 'Failed to load quiz sources', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = sourceType === 'note' ? notes : subjects;

  const toggleType = (t: QuizQuestionType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const build = async () => {
    if (sourceId == null) {
      toast.error('Pick a note or subject first.');
      return;
    }
    if (types.length === 0) {
      toast.error('Choose at least one question type.');
      return;
    }
    try {
      setGenerating(true);
      const { questions: qs } = await api.ai.generateStructuredQuiz({
        source_type: sourceType,
        source_id: sourceId,
        count,
        difficulty,
        types,
      });
      const generated = (qs || []) as StructuredQuestion[];
      if (generated.length === 0) {
        toast.error('No questions were generated. Try a different source.');
        return;
      }
      setQuestions(generated);
      setDurationSec(Math.max(30, Math.round(durationMin * 60)));
      setAnswers([]);
      setStep('run');
    } catch (err) {
      logger.error('quiz', 'Failed to generate quiz', err);
      toast.error('Failed to generate the quiz. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = (submitted: QuizAnswer[]) => {
    setAnswers(submitted);
    setStep('results');
  };

  const restart = () => {
    setQuestions([]);
    setAnswers([]);
    setStep('build');
  };

  if (step === 'run') {
    return (
      <Suspense fallback={<CenteredSpinner />}>
        <TestSimulatorPage
          questions={questions}
          durationSec={durationSec}
          onSubmit={handleSubmit}
        />
      </Suspense>
    );
  }

  if (step === 'results') {
    return (
      <Suspense fallback={<CenteredSpinner />}>
        <TestResultsPage
          questions={questions}
          answers={answers}
          sourceType={sourceType}
          sourceId={sourceId}
          onRestart={restart}
          onReview={() => navigate('/review')}
        />
      </Suspense>
    );
  }

  return (
    <div style={pageWrap}>
      <div style={inner}>
        <h1 style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 'bold', margin: '0 0 6px 0' }}>
          Build a test
        </h1>
        <p
          style={{ margin: '0 0 24px 0', color: darkTheme.colors.textSecondary, fontSize: '14px' }}
        >
          Generate a timed practice test from one of your notes or a whole subject.
        </p>

        <div style={card}>
          {/* Source type */}
          <div style={fieldWrap}>
            <span style={fieldLabel}>Source</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['note', 'subject'] as QuizSourceType[]).map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    setSourceType(st);
                    setSourceId(null);
                  }}
                  style={{
                    ...controlBase,
                    width: 'auto',
                    flex: 1,
                    cursor: 'pointer',
                    fontWeight: 600,
                    background:
                      sourceType === st ? darkTheme.colors.accent : darkTheme.colors.bgTertiary,
                    borderColor:
                      sourceType === st ? darkTheme.colors.accent : darkTheme.colors.borderColor,
                    color: sourceType === st ? '#fff' : darkTheme.colors.textPrimary,
                  }}
                >
                  {st === 'note' ? 'A single note' : 'A whole subject'}
                </button>
              ))}
            </div>
          </div>

          {/* Source picker */}
          <div style={fieldWrap}>
            <label style={fieldLabel} htmlFor="quiz-source">
              {sourceType === 'note' ? 'Note' : 'Subject'}
            </label>
            <select
              id="quiz-source"
              style={controlBase}
              value={sourceId ?? ''}
              onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">
                {options.length === 0
                  ? `No ${sourceType === 'note' ? 'notes' : 'subjects'} available`
                  : `Select a ${sourceType}...`}
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Count + difficulty */}
          <div style={{ ...fieldWrap, display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel} htmlFor="quiz-count">
                Questions
              </label>
              <input
                id="quiz-count"
                type="number"
                min={1}
                max={20}
                style={controlBase}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel} htmlFor="quiz-difficulty">
                Difficulty
              </label>
              <select
                id="quiz-difficulty"
                style={controlBase}
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d[0].toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Question types */}
          <div style={fieldWrap}>
            <span style={fieldLabel}>Question types</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {TYPE_OPTIONS.map((t) => {
                const on = types.includes(t.value);
                return (
                  <button
                    key={t.value}
                    onClick={() => toggleType(t.value)}
                    style={{
                      ...controlBase,
                      width: 'auto',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      background: on ? darkTheme.colors.accent : darkTheme.colors.bgTertiary,
                      borderColor: on ? darkTheme.colors.accent : darkTheme.colors.borderColor,
                      color: on ? '#fff' : darkTheme.colors.textPrimary,
                    }}
                  >
                    {on ? '✓ ' : ''}
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div style={fieldWrap}>
            <label style={fieldLabel} htmlFor="quiz-duration">
              Time limit (minutes)
            </label>
            <input
              id="quiz-duration"
              type="number"
              min={1}
              max={180}
              style={controlBase}
              value={durationMin}
              onChange={(e) =>
                setDurationMin(Math.max(1, Math.min(180, Number(e.target.value) || 1)))
              }
            />
          </div>

          <button
            style={{ ...primaryBtn, width: '100%', opacity: generating ? 0.7 : 1 }}
            onClick={build}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Generate test'}
          </button>
        </div>
      </div>
    </div>
  );
}
