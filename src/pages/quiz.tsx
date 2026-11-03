import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { api, type Quiz as QuizData, type QuizRequest } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

const primary = cn(buttonVariants({ variant: 'primary' }), 'px-5 py-3 text-[14px]');
const slot = cn(buttonVariants({ variant: 'slot' }), 'px-4 py-2 text-[13px]');
const COUNTS = [5, 10];
const LEVELS: QuizRequest['difficulty'][] = ['easy', 'medium', 'hard'];

/**
 * Quiz: questions written by the AI from the notes students share. `?note=` quizzes one note (the
 * note viewer's "Quiz me"); otherwise the student picks a subject and the worker draws on the most
 * liked notes they can see in it. One sitting, no timer: answer, check, read why.
 */
export function Quiz() {
  const { session } = useApp();
  const [params] = useSearchParams();
  const noteId = Number(params.get('note')) || 0;
  const focus = session?.kind === 'user' ? (session.user.focus_subject_ids ?? []) : [];
  const subjects = useAsync(() => api.subjects(), []);
  const note = useAsync(() => api.notes.view(noteId), [noteId], noteId > 0);

  const [subjectId, setSubjectId] = useState(0);
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizRequest['difficulty']>('medium');
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);

  // Focus subjects first, then the rest; only subjects that hold notes can feed a quiz.
  const withNotes = (subjects.data ?? []).filter((s) => s.note_count > 0);
  const ordered = [
    ...withNotes.filter((s) => focus.includes(s.id)),
    ...withNotes.filter((s) => !focus.includes(s.id)),
  ];
  const chosen = subjectId || ordered[0]?.id || 0;

  const request = (): QuizRequest => ({
    source_type: noteId ? 'note' : 'subject',
    source_id: noteId || chosen,
    count,
    difficulty,
    types: ['mcq', 'true_false'],
  });

  // The Gemini route: no AI key on our side, the student runs the quiz in their own Gemini chat.
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const openGemini = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setPrompt((await api.quizPrompt(request())).prompt);
    } catch (e) {
      setError((e as Error).message || 'Could not prepare the Gemini prompt.');
    } finally {
      setBusy(false);
    }
  };
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt ?? '');
      setCopied(true);
    } catch {
      // Clipboard blocked: the textarea is selectable, so the student can copy by hand.
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    setQuiz(null);
    setPicks({});
    setChecked(false);
    try {
      const q = await api.quiz(request());
      // Short answers need grading we do not do yet; the prompt can still slip one in.
      setQuiz({ ...q, questions: (q.questions ?? []).filter((x) => x.options?.length) });
    } catch (e) {
      setError((e as Error).message || 'Could not write a quiz right now.');
    } finally {
      setBusy(false);
    }
  };

  const questions = quiz?.questions ?? [];
  const score = questions.filter((q, i) => picks[i] === q.correct_answer).length;
  const weak = [
    ...new Set(
      questions.filter((q, i) => picks[i] !== q.correct_answer && q.topic).map((q) => q.topic!),
    ),
  ];

  return (
    <div data-screen-label="Quiz" className="flex flex-col gap-6 max-w-[760px]">
      <div className="border-t border-ink pt-3 flex flex-col gap-1">
        <span className="meta">Quiz</span>
        <h2 className="text-[clamp(28px,4vw,44px)]">
          {noteId ? (note.data?.title ?? 'This note') : 'Test yourself on shared notes'}
        </h2>
        {noteId > 0 && (
          <Link to="/app/quiz" className="meta underline w-fit">
            Pick a subject instead
          </Link>
        )}
      </div>

      {!noteId && (
        <div className="flex flex-col gap-2">
          <span className="meta">Subject</span>
          <div className="flex gap-2 flex-wrap">
            {ordered.map((s) => (
              <Pill key={s.id} on={chosen === s.id} onClick={() => setSubjectId(s.id)}>
                {s.name}
              </Pill>
            ))}
            {subjects.data && ordered.length === 0 && (
              <p className="text-neutral-700">
                No shared notes yet. Once classmates post, quiz here.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-x-8 gap-y-3 flex-wrap">
        <div className="flex flex-col gap-2">
          <span className="meta">Questions</span>
          <div className="flex gap-2">
            {COUNTS.map((n) => (
              <Pill key={n} on={count === n} onClick={() => setCount(n)}>
                {n}
              </Pill>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="meta">Difficulty</span>
          <div className="flex gap-2">
            {LEVELS.map((l) => (
              <Pill key={l} on={difficulty === l} onClick={() => setDifficulty(l)}>
                {l}
              </Pill>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          className={primary}
          disabled={busy || (!noteId && !chosen)}
          onClick={start}
        >
          {busy ? 'Working…' : quiz ? 'New quiz' : 'Start quiz'}
        </button>
        <button
          type="button"
          className={slot}
          disabled={busy || (!noteId && !chosen)}
          onClick={openGemini}
        >
          Quiz me in Gemini
        </button>
      </div>
      {error && (
        <p role="alert" className="text-ink border-l-[3px] border-ink pl-3">
          {error} You can still take this quiz in Gemini with the button above.
        </p>
      )}
      {prompt && (
        <div
          className="flex flex-col gap-2 border border-neutral-300 p-4"
          data-testid="gemini-panel"
        >
          <span className="meta">Your quiz, ready for Gemini</span>
          <p className="text-neutral-800">
            1. Copy the prompt. 2. Open Gemini and paste it. Gemini asks the questions one at a time
            and marks your answers.
          </p>
          <textarea
            readOnly
            value={prompt}
            rows={6}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Quiz prompt for Gemini"
            className="w-full border border-neutral-300 bg-transparent p-2 text-[13px] font-mono"
          />
          <div className="flex gap-3 flex-wrap">
            <button type="button" className={slot} onClick={copyPrompt}>
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
            <a
              href="https://gemini.google.com/app"
              target="_blank"
              rel="noopener noreferrer"
              className={slot}
            >
              Open Gemini
            </a>
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <ol className="flex flex-col gap-6 list-none p-0">
          {questions.map((q, i) => (
            <li key={i} className="border-t border-neutral-300 pt-4 flex flex-col gap-3">
              <span className="meta">
                {i + 1} / {questions.length}
                {q.topic ? ` · ${q.topic}` : ''}
              </span>
              <p className="text-[18px] font-semibold text-ink">{q.question}</p>
              <div
                className="flex flex-col gap-2"
                role="radiogroup"
                aria-label={`Question ${i + 1}`}
              >
                {(q.options ?? []).map((o, j) => {
                  const picked = picks[i] === j;
                  const right = checked && j === q.correct_answer;
                  const wrong = checked && picked && j !== q.correct_answer;
                  return (
                    <button
                      key={j}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      disabled={checked}
                      onClick={() => setPicks((p) => ({ ...p, [i]: j }))}
                      className={cn(
                        'text-left border px-4 py-2.5 text-[15px] cursor-pointer bg-transparent',
                        right
                          ? 'border-ink bg-ink text-accent-100'
                          : picked
                            ? 'border-ink text-ink border-2'
                            : 'border-neutral-300 text-neutral-900 hover:border-ink',
                      )}
                    >
                      {o}
                      {right && <span className="meta ml-2 text-accent-300">correct</span>}
                      {wrong && <span className="meta ml-2">your answer</span>}
                    </button>
                  );
                })}
              </div>
              {checked && q.explanation && (
                <p className="text-neutral-700 border-l-[3px] border-neutral-300 pl-3">
                  {q.explanation}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {questions.length > 0 && !checked && (
        <button
          type="button"
          className={cn(primary, 'w-fit')}
          disabled={Object.keys(picks).length < questions.length}
          onClick={() => setChecked(true)}
        >
          Check answers
        </button>
      )}
      {checked && (
        <div className="border-t-2 border-ink pt-4 flex flex-col gap-2" role="status">
          <span className="text-[28px] font-extrabold text-ink" data-num>
            {score} / {questions.length}
          </span>
          {weak.length > 0 ? (
            <p className="text-neutral-800">Go back over: {weak.join(', ')}.</p>
          ) : (
            <p className="text-neutral-800">Every topic answered right.</p>
          )}
          <button type="button" className={cn(slot, 'w-fit')} onClick={start}>
            Another quiz
          </button>
        </div>
      )}
    </div>
  );
}
