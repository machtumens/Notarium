import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { I } from '@/components/ui/icons';
import { ApiError, CLASS_RE, api } from '@/lib/api';
import { OB_HABITS, OB_RESULT, OB_SUBJECTS } from '@/lib/data';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

// Session lengths are not in data.ts (logic.js `obLengths`), so they live here.
const LENGTHS = ['10 min', '25 min', '60 min'];
/** Step index of the account form; the result step follows it (a signed-in account skips the form, so the result step takes its slot). */
const ACCOUNT = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const primary = cn(
  buttonVariants({ variant: 'primary' }),
  'px-7 py-3.5 text-[15px] disabled:opacity-40 disabled:cursor-not-allowed',
);
const chip = 'border border-ink text-ink px-3 py-1 text-[12.5px] font-bold';
const linkBtn =
  'border-0 bg-transparent text-neutral-700 text-[13px] font-bold cursor-pointer underline underline-offset-[3px] hover:text-ink';
const inputCls =
  'border border-neutral-400 bg-bg px-4 py-3 text-[15px] text-ink w-full focus:border-ink';
const toggleCls =
  'absolute right-1.5 top-1/2 -translate-y-1/2 border border-neutral-400 bg-transparent text-neutral-700 px-2.5 py-1 text-xs font-bold cursor-pointer hover:border-ink hover:text-ink aria-pressed:bg-ink aria-pressed:border-ink aria-pressed:text-accent-100';

type Account = { name: string; email: string; password: string; cls: string };
type Checked = 'name' | 'email' | 'password' | 'cls';

/**
 * Mirrors main's signup rules (name 1–100, password 8–128, an email on the school domain, a class in its
 * `10.1` shape) so the obvious refusals never reach the worker; whatever main still refuses
 * (an unknown class, a taken email) is shown in its own words by `finish`.
 *
 * The class is required, though the worker would accept a signup without one.
 * `RequireSession` holds any account with no class on /welcome, so an account
 * created without one is stranded there the moment it is made — asking here is
 * one field, not a detour.
 */
const accountErrors = (a: Account): Record<Checked, string> => ({
  name: a.name.trim() ? '' : 'Enter your name',
  email: EMAIL_RE.test(a.email.trim()) ? '' : 'That email does not look right',
  password: a.password.length >= 8 ? '' : 'Password needs at least 8 characters',
  cls: !a.cls.trim()
    ? 'Enter your class'
    : CLASS_RE.test(a.cls.trim())
      ? ''
      : 'Class looks like 10.1 — grade, dot, class number',
});

function Intro({ kicker, title, body }: { kicker: string; title: string; body?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="meta">{kicker}</span>
      <h2 className="text-[clamp(24px,3.2vw,40px)]">{title}</h2>
      {body && (
        <p className="text-[15px] leading-[1.5] text-neutral-700 max-w-[56ch] [text-wrap:pretty]">
          {body}
        </p>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="meta">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-[12.5px] font-semibold text-ink">
          {error}
        </p>
      )}
    </div>
  );
}

/** Onboarding: three questions (subjects · habit · session length), the account form, then the starting space. */
export function Onboard() {
  const nav = useNavigate();
  const { session, continueAsGuest, signUp } = useApp();
  const hasAccount = session?.kind === 'user';
  const last = hasAccount ? ACCOUNT : ACCOUNT + 1;
  const [step, setStep] = useState(0);
  const [subjects, setSubjects] = useState<string[]>(['Matematika', 'Fisika', 'Kimia']);
  const [habit, setHabit] = useState('Practice first');
  const [len, setLen] = useState('25 min');
  const [acct, setAcct] = useState<Account>({ name: '', email: '', password: '', cls: '' });
  const [touched, setTouched] = useState<Partial<Record<Checked, boolean>>>({});
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; exists?: boolean } | null>(null);

  const count = `${subjects.length} dipilih`;
  const toggle = (x: string) =>
    setSubjects((cur) => (cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x]));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const next = () => setStep((s) => Math.min(last, s + 1));
  const guest = () => {
    continueAsGuest();
    nav('/app/home');
  };

  const onAccount = step === ACCOUNT && !hasAccount;
  const errors = accountErrors(acct);
  const valid = !errors.name && !errors.email && !errors.password && !errors.cls;
  const err = (k: Checked) => (touched[k] ? errors[k] : '');
  const edit = (k: keyof Account) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAcct((a) => ({ ...a, [k]: e.target.value }));
  const touch = (k: Checked) => () => setTouched((t) => ({ ...t, [k]: true }));
  const a11y = (k: Checked, extra?: string) => ({
    'aria-invalid': !!err(k),
    'aria-describedby': err(k) ? `ob-${k}-error` : undefined,
    className: cn(inputCls, err(k) && 'border-ink', extra),
  });
  const submitAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, cls: true });
    if (valid) next();
  };

  const finish = async () => {
    if (hasAccount) {
      nav('/app/home');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(
        acct.email.trim(),
        acct.password,
        acct.name.trim(),
        acct.cls.trim() || undefined,
      );
      nav('/app/home');
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      // ponytail: the worker says `Email already registered` (409); matched by message so a 400 variant lands here too.
      // Any other refusal (`Invalid class selection`, the domain rule) is shown in main's own words.
      if (apiErr && (apiErr.status === 409 || /already|exist|registered/i.test(apiErr.message)))
        setError({ text: 'That email already has an account.', exists: true });
      else
        setError({
          text: apiErr?.message || 'Could not reach Notarium. Check your connection and try again.',
        });
      setBusy(false);
    }
  };

  return (
    <div data-screen-label="Onboarding" className="px-6 md:px-10 pt-8 pb-16 flex justify-center">
      <div className="w-[min(100%,760px)] flex flex-col gap-6">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Step rule, not a row of lozenges: the filled length is the progress. */}
          <div className="flex gap-1">
            {Array.from({ length: last + 1 }, (_, i) => (
              <span
                key={i}
                className={cn('block w-10 h-[3px]', i <= step ? 'bg-ink' : 'bg-neutral-300')}
              />
            ))}
          </div>
          <span className="meta">Three questions, then you are in</span>
          {step < ACCOUNT && (
            <button
              type="button"
              onClick={() => setStep(ACCOUNT)}
              className={cn('ml-auto', linkBtn)}
            >
              Skip — I will set it up later
            </button>
          )}
        </div>

        <div className="border-t-2 border-ink pt-8 pb-2 flex flex-col gap-6 min-h-[420px]">
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <Intro
                kicker="Question 1"
                title="What are you studying?"
                body="Pick the subjects that matter this semester. Everything else stays available — it just will not take space on your canvas."
              />
              <div className="flex gap-2 flex-wrap">
                {OB_SUBJECTS.map((x) => (
                  <Pill
                    key={x}
                    on={subjects.includes(x)}
                    onClick={() => toggle(x)}
                    className="px-4 py-2.5 text-[15px] font-bold"
                  >
                    {x}
                  </Pill>
                ))}
              </div>
              <span data-num className="meta">
                {count}
              </span>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <Intro
                kicker="Question 2"
                title="How do you usually study?"
                body="This is a starting guess, not a verdict. Notarium will watch what you actually do and correct itself within a week."
              />
              {/* Options sit flush in a hairline mosaic (gap-px over a grey ground); the chosen one inverts to ink. */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-px bg-neutral-300">
                {OB_HABITS.map((h) => {
                  const on = habit === h.label;
                  return (
                    <button
                      key={h.label}
                      type="button"
                      onClick={() => setHabit(h.label)}
                      className={cn(
                        'text-left px-5 py-4 cursor-pointer flex flex-col gap-1.5 border-0',
                        on ? 'bg-ink' : 'bg-bg hover:bg-neutral-100',
                      )}
                    >
                      <span
                        className={cn(
                          'text-base font-extrabold tracking-[-0.02em]',
                          on ? 'text-accent-100' : 'text-ink',
                        )}
                      >
                        {h.label}
                      </span>
                      <span
                        className={cn(
                          'text-sm leading-[1.45] [text-wrap:pretty]',
                          on ? 'text-accent-300' : 'text-neutral-700',
                        )}
                      >
                        {h.body}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <Intro
                kicker="Question 3"
                title="How long is a session?"
                body="Every practice set, revision block and AI recommendation gets sized to this number. Change it any day."
              />
              <div className="flex gap-2 flex-wrap">
                {LENGTHS.map((l) => (
                  <Pill
                    key={l}
                    on={len === l}
                    onClick={() => setLen(l)}
                    className="px-8 py-3.5 text-lg font-extrabold"
                  >
                    {l}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          {onAccount && (
            <div className="flex flex-col gap-5">
              <Intro
                kicker="Your account"
                title="Keep this space"
                body="An account carries your notes, progress and this setup to any device. Guests get the demo space instead and start fresh each visit."
              />
              {/* The short way in: Google both creates the account and proves the
                  address is the school's, so the form below is only for people who
                  would rather set a password. */}
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => api.auth.googleSignIn('/app/home')}
                  className={cn(
                    buttonVariants({ variant: 'primary' }),
                    'flex items-center justify-center gap-2.5 px-6 py-[14px] text-[15px] min-h-[50px] w-full max-w-[460px]',
                  )}
                >
                  <I.school size={18} /> Continue with Google
                </button>
                <p className="text-[12.5px] text-neutral-700">
                  Any Google account works. Your name comes from Google; you pick your class next.
                </p>
                <div className="flex items-center gap-3 pt-1 max-w-[460px]">
                  <span className="h-px flex-1 bg-neutral-300" />
                  <span className="meta">or set a password</span>
                  <span className="h-px flex-1 bg-neutral-300" />
                </div>
              </div>
              <form
                id="account"
                noValidate
                onSubmit={submitAccount}
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-x-5 gap-y-4"
              >
                <Field id="ob-name" label="Name" error={err('name')}>
                  <input
                    id="ob-name"
                    type="text"
                    autoComplete="name"
                    autoFocus
                    maxLength={100}
                    value={acct.name}
                    onChange={edit('name')}
                    onBlur={touch('name')}
                    placeholder="Arga Pratama"
                    {...a11y('name')}
                  />
                </Field>
                <Field id="ob-email" label="Email" error={err('email')}>
                  <input
                    id="ob-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={255}
                    value={acct.email}
                    onChange={edit('email')}
                    onBlur={touch('email')}
                    placeholder="nama@email.com"
                    {...a11y('email')}
                  />
                </Field>
                <Field id="ob-password" label="Password" error={err('password')}>
                  <div className="relative">
                    <input
                      id="ob-password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      maxLength={128}
                      value={acct.password}
                      onChange={edit('password')}
                      onBlur={touch('password')}
                      placeholder="At least 8 characters"
                      {...a11y('password', 'pr-[72px]')}
                    />
                    <button
                      type="button"
                      aria-pressed={showPass}
                      onClick={() => setShowPass((v) => !v)}
                      className={toggleCls}
                    >
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </Field>
                <Field id="ob-class" label="Class" error={err('cls')}>
                  <input
                    id="ob-class"
                    type="text"
                    autoComplete="off"
                    maxLength={50}
                    value={acct.cls}
                    onChange={edit('cls')}
                    onBlur={touch('cls')}
                    placeholder="10.1"
                    {...a11y('cls')}
                  />
                </Field>
              </form>
            </div>
          )}

          {step === last && (
            <div className="flex flex-col gap-6">
              <Intro kicker="Your starting space" title="This is what opens tomorrow" />
              <div className="border-t border-ink pt-4 flex flex-col gap-3">
                <div className="flex gap-1.5 flex-wrap">
                  <span className={chip}>{habit}</span>
                  <span className={chip} data-num>
                    {len} sessions
                  </span>
                  <span className={chip} data-num>
                    {count}
                  </span>
                </div>
                <p className="text-base leading-[1.5] text-ink max-w-[62ch] [text-wrap:pretty]">
                  {OB_RESULT[habit]}
                </p>
              </div>
              <div className="border-t border-neutral-300 pt-4 flex flex-col gap-2">
                <span className="meta">Adaptive mode · Hybrid</span>
                <p className="text-sm leading-[1.5] text-neutral-700 max-w-[62ch] [text-wrap:pretty]">
                  Notarium keeps this layout and promotes one module when something urgent appears.
                  You can switch to Automatic or Manual at any time under Customize.
                </p>
              </div>
              {error && (
                <p
                  role="alert"
                  className="flex items-center gap-3 flex-wrap text-[13px] font-semibold text-ink bg-neutral-100 border-l-2 border-ink px-4 py-3"
                >
                  {error.text}
                  {error.exists && (
                    <Link
                      to="/login"
                      className="inline-flex items-center border border-ink bg-transparent text-ink px-3 py-1 text-[12.5px] font-bold no-underline hover:bg-ink hover:text-accent-100"
                    >
                      Sign in instead
                    </Link>
                  )}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2.5 flex-wrap mt-auto pt-6">
            <button
              type="button"
              onClick={back}
              className="border border-neutral-400 bg-transparent text-ink px-6 py-3.5 text-[15px] font-bold cursor-pointer hover:border-ink"
            >
              Back
            </button>
            {step === last ? (
              <button
                type="button"
                onClick={() => void finish()}
                disabled={busy}
                className={primary}
              >
                {busy ? 'Creating your account…' : 'Enter Notarium'}
              </button>
            ) : (
              <button
                type={onAccount ? 'submit' : 'button'}
                form={onAccount ? 'account' : undefined}
                onClick={onAccount ? undefined : next}
                disabled={onAccount && !valid}
                className={primary}
              >
                Continue
              </button>
            )}
            {onAccount && (
              <button type="button" onClick={guest} className={linkBtn}>
                Continue as guest instead
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
