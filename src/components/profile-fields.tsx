import { useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { ApiError, CLASS_RE, FOCUS_SUBJECTS_MAX, type Subject, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

const inputCls =
  'border border-neutral-400 bg-bg px-4 py-[11px] text-[15px] text-ink w-full max-w-[220px] focus:border-ink';

/**
 * The worker's own wording, shown as it came. There used to be a branch mapping
 * `Invalid class selection` to "that class is not on the school register" —
 * PUT /api/user/class cannot answer that any more (owner decision, 28 Oct: a
 * class off the register is stored, not refused), so the branch could only ever
 * have told a student something untrue.
 */
const friendly = (e: unknown) => {
  if (!(e instanceof ApiError))
    return 'Could not reach Notarium. Check your connection and try again.';
  return e.message || 'Could not save that.';
};

type Props = {
  /** Called once the save has landed and the session user has been re-read. */
  onSaved?: () => void;
  saveLabel?: string;
};

/**
 * The two things a student owns about their profile: their class, and the
 * subjects they want the app to lean towards. Used by the post-sign-in step and
 * by Customize, which is why it is a component and not page markup — the fields
 * and their rules are the same in both places, only the chrome around them differs.
 *
 * The display name is deliberately absent. On a Google account it is read from
 * Google at every sign-in, so an input here would be a lie.
 */
export function ProfileFields({ onSaved, saveLabel = 'Save' }: Props) {
  const { session, recheckSession } = useApp();
  const user = session?.kind === 'user' ? session.user : null;

  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [cls, setCls] = useState(user?.class ?? '');
  const [focus, setFocus] = useState<number[]>(user?.focus_subject_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api
      .subjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, []);

  const shaped = CLASS_RE.test(cls.trim());
  const can = shaped && !busy;
  const full = focus.length >= FOCUS_SUBJECTS_MAX;

  const toggle = (id: number) => {
    setSaved(false);
    setFocus((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < FOCUS_SUBJECTS_MAX
          ? [...cur, id]
          : cur,
    );
  };

  const save = async () => {
    if (!can) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.user.saveProfile(cls.trim(), focus);
      // The store's session user is what every screen reads, so re-read it from
      // the worker rather than patching a copy of it here.
      await recheckSession();
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-7"
    >
      <div className="flex flex-col gap-2">
        <span className="meta">Your name</span>
        <p className="text-[19px] font-extrabold text-ink">{user?.name ?? 'Not signed in'}</p>
        <p className="text-[13px] text-neutral-700 max-w-[52ch] [text-wrap:pretty]">
          This comes from your Google account, so it is not editable here. Change it with Google if
          it is wrong.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="pf-class" className="meta">
          Your class
        </label>
        <input
          id="pf-class"
          value={cls}
          onChange={(e) => {
            setCls(e.target.value);
            setSaved(false);
          }}
          placeholder="10.1"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={cls.trim().length > 0 && !shaped}
          aria-describedby="pf-class-hint"
          className={inputCls}
        />
        <p id="pf-class-hint" className="text-[13px] text-neutral-700">
          {cls.trim().length > 0 && !shaped
            ? 'Grade, dot, class number — like 10.1 or 12.3.'
            : 'Grade, dot, class number — like 10.1.'}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="meta">Focus subjects</span>
          <span data-num className="text-[12.5px] font-bold text-ink">
            {focus.length} / {FOCUS_SUBJECTS_MAX}
          </span>
        </div>
        <p className="text-[13px] text-neutral-700 max-w-[52ch] [text-wrap:pretty]">
          The subjects that matter to you this semester. Everything else stays available — these
          just come first.
        </p>
        {subjects === null ? (
          <p className="text-[13px] text-neutral-600">Loading subjects…</p>
        ) : subjects.length === 0 ? (
          <p className="text-[13px] text-neutral-600">
            Subjects could not be loaded. You can set these later in Customize.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const on = focus.includes(s.id);
              return (
                <Pill
                  key={s.id}
                  on={on}
                  onClick={() => toggle(s.id)}
                  className={cn('px-4 py-2.5 text-[14px] font-bold', !on && full && 'opacity-50')}
                >
                  {s.name}
                </Pill>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="bg-ink px-4 py-2.5 text-[13px] font-semibold text-accent-100">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4 flex-wrap border-t border-ink pt-4">
        <button
          type="submit"
          disabled={!can}
          className={cn(
            'px-6 py-[13px] text-[15px] min-h-[48px]',
            can
              ? buttonVariants({ variant: 'primary' })
              : 'border-0 bg-neutral-200 text-neutral-600 font-bold cursor-not-allowed',
          )}
        >
          {busy ? 'Saving…' : saveLabel}
        </button>
        {saved && (
          <p role="status" className="text-[13px] font-semibold text-ink">
            Saved.
          </p>
        )}
        {!shaped && !busy && (
          <span className="text-[12.5px] font-semibold text-neutral-700">
            A class is needed before you can save
          </span>
        )}
      </div>
    </form>
  );
}
