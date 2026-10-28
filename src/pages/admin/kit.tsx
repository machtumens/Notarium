/**
 * The admin dashboard's shared parts. Nothing here invents a new visual device: a panel is
 * content under an ink rule, a table is hairlines, a figure is tabular, and the one emphatic
 * state is inversion to solid ink. Same system as the rest of the app, at a denser scale —
 * admin screens carry five times the rows a student screen does.
 */
import { useEffect, useRef, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Kicker } from '@/components/ui/kicker';
import { cn } from '@/lib/utils';

export const primary = buttonVariants({ variant: 'primary' });
export const slot = buttonVariants({ variant: 'slot' });
/** The row-level affordance: small, square, hairline. Dense tables cannot afford full buttons. */
export const TINY =
  'border border-neutral-400 bg-transparent px-2 py-1 text-[11.5px] font-bold text-neutral-800 cursor-pointer whitespace-nowrap hover:bg-ink hover:text-accent-100 hover:border-ink disabled:opacity-40 disabled:pointer-events-none';
/** Text input / select / textarea, flush and ruled rather than boxed-and-rounded. */
export const INPUT =
  'w-full border border-neutral-400 bg-bg px-3 py-2 text-[14px] text-ink placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-ink';

/** A labelled section. The rule is ink for a primary panel, grey for a secondary one. */
export function Panel({
  title,
  note,
  right,
  quiet,
  children,
  className,
}: {
  title: string;
  note?: string;
  right?: React.ReactNode;
  quiet?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3.5 pt-3.5',
        quiet ? 'border-t border-neutral-300' : 'border-t border-ink',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-5 flex-wrap">
        <div className="flex flex-col gap-1">
          <Kicker as="h2" size="md" className="text-ink">
            {title}
          </Kicker>
          {note && (
            <p className="text-[13px] leading-[1.45] text-neutral-700 max-w-[64ch] [text-wrap:pretty]">
              {note}
            </p>
          )}
        </div>
        {right && <div className="flex items-center gap-2.5 flex-wrap">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** One number and its name. Figures are off the type scale on purpose — they are the content. */
export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-neutral-300 pt-2.5 min-w-[108px] flex-1">
      <span className="meta">{label}</span>
      <span
        data-num
        className="font-heading font-extrabold tracking-[-0.03em] text-[clamp(26px,3vw,38px)] leading-[1] text-ink"
      >
        {value}
      </span>
      {sub && (
        <span data-num className="text-[12px] text-neutral-600">
          {sub}
        </span>
      )}
    </div>
  );
}

export const StatRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap gap-x-7 gap-y-4">{children}</div>
);

/**
 * A table. `cols` carries each column's width hint and whether it holds a figure, so the
 * header and the body cannot drift apart. Horizontal scroll rather than wrapping: an admin
 * reads a row across, and a wrapped row stops being a row.
 */
export type Col = { key: string; label: string; num?: boolean; w?: string };
export function Table<T>({
  cols,
  rows,
  keyOf,
  cell,
  empty = 'Nothing here yet.',
}: {
  cols: Col[];
  rows: T[];
  keyOf: (row: T) => string | number;
  cell: (row: T, key: string) => React.ReactNode;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="py-3 text-[14px] text-neutral-700">{empty}</p>;
  // A wide register gets a floor and scrolls sideways rather than squashing eight columns into a
  // phone. A three- or four-column summary gets no floor at all: it sits in a half-width column,
  // where a 640px floor would clip it inside its own scroller for no reason.
  const floor = cols.length <= 4 ? undefined : 640;
  // Only the last column loses its right padding — a figure column in the middle keeps the gap, or
  // it runs straight into whatever follows it ("112" + "2026-09-01" reading as one number).
  const pad = (i: number) => (i === cols.length - 1 ? 'pr-0' : 'pr-4');
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full border-collapse" style={floor ? { minWidth: floor } : undefined}>
        <thead>
          <tr className="border-b border-ink">
            {cols.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                style={c.w ? { width: c.w } : undefined}
                className={cn(
                  'meta py-2 align-bottom font-bold',
                  pad(i),
                  c.num ? 'text-right pl-4' : 'text-left',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={keyOf(r)}
              className="border-b border-neutral-300 align-top hover:bg-neutral-100"
            >
              {cols.map((c, i) => (
                <td
                  key={c.key}
                  {...(c.num ? { 'data-num': true } : {})}
                  className={cn(
                    'py-2.5 text-[13.5px] leading-[1.45] text-neutral-900',
                    pad(i),
                    c.num ? 'text-right pl-4 font-semibold whitespace-nowrap' : 'text-left',
                  )}
                >
                  {cell(r, c.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A state word: inverted ink when it matters, a hairline outline when it is just information. */
export function Tag({ children, on }: { children: React.ReactNode; on?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap',
        on ? 'bg-ink text-accent-100' : 'border border-neutral-400 text-neutral-700',
      )}
    >
      {children}
    </span>
  );
}

/**
 * A destructive action, two steps. There is no modal and no `window.confirm`: the button
 * becomes its own confirmation, and reverts after six seconds if nobody commits — so a
 * half-pressed Delete never sits armed on the screen.
 */
export function Confirm({
  label,
  confirmLabel,
  onConfirm,
  className,
  disabled,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const arm = () => {
    setArmed(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(false), 6000);
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          arm();
          return;
        }
        clearTimeout(timer.current);
        setArmed(false);
        onConfirm();
      }}
      className={cn(TINY, armed && 'bg-ink text-accent-100 border-ink', className)}
    >
      {armed ? (confirmLabel ?? `${label} — confirm`) : label}
    </button>
  );
}

/**
 * A labelled control. The label is the micro-caption, never a floating placeholder — and the
 * hint sits OUTSIDE the label on purpose: inside it, the control's accessible name becomes
 * "Days1 to 365", which is what a screen reader would then announce.
 */
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // `flex-1` is for a field sharing a ROW with its siblings. Stacked in a column it would grow
    // vertically into whatever slack the column has, which is where the gaping forms came from —
    // a column call site passes `grow-0` to switch it off.
    <div className={cn('flex flex-col gap-1.5 flex-1 min-w-[160px]', className)}>
      <label className="flex flex-col gap-1.5">
        <span className="meta">{label}</span>
        {children}
      </label>
      {hint && <span className="text-[11.5px] leading-[1.4] text-neutral-600">{hint}</span>}
    </div>
  );
}

/**
 * A daily series as bars. No chart library and no axis furniture: the tallest bar is the
 * scale, the dates are the axis, and the figures are on the bars themselves at this size.
 */
export function Bars({ points, label }: { points: { t: string; v: number }[]; label: string }) {
  if (points.length === 0)
    return (
      <p className="py-2 text-[13px] text-neutral-700">
        No {label.toLowerCase()} recorded in this window.
      </p>
    );
  const max = Math.max(...points.map((p) => p.v), 1);
  return (
    <div
      className="flex items-end gap-[3px] h-[104px]"
      role="img"
      aria-label={`${label}: ${points.map((p) => `${p.t} ${p.v}`).join(', ')}`}
    >
      {points.map((p) => (
        <span
          key={p.t}
          title={`${p.t} · ${p.v}`}
          className="flex-1 min-w-[4px] flex flex-col justify-end items-center gap-1"
        >
          <span data-num className="text-[10px] font-bold text-neutral-600">
            {p.v || ''}
          </span>
          <span
            className="w-full bg-ink"
            style={{ height: `${Math.max((p.v / max) * 84, p.v > 0 ? 2 : 0)}px` }}
          />
        </span>
      ))}
    </div>
  );
}

/** Loading / error / forbidden for one panel's data, so a 403 on one panel never blanks the page. */
export function Async({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
  children: React.ReactNode;
}) {
  if (loading)
    return (
      <div aria-hidden className="flex flex-col gap-2 py-2 animate-pulse">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn('h-3.5 bg-neutral-200', i === 1 ? 'w-3/5' : 'w-4/5')} />
        ))}
      </div>
    );
  if (error)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 py-2">
        <span className="text-[13.5px] font-semibold text-neutral-900 [text-wrap:pretty]">
          {/forbidden/i.test(error) ? 'Your admin role does not cover this panel.' : error}
        </span>
        <button type="button" onClick={retry} className={TINY}>
          Retry
        </button>
      </div>
    );
  return <>{children}</>;
}

/**
 * Run a write, then report it in one line. Admin writes are one-shot and mostly invisible
 * (a flag flips in KV, a row changes in D1), so the result has to be said out loud.
 */
export function useAction(onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const run = async (text: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      if (!live.current) return;
      setSaid({ ok: true, text });
      onDone?.();
    } catch (e) {
      if (!live.current) return;
      setSaid({ ok: false, text: e instanceof Error ? e.message : 'That did not work.' });
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return { busy, said, run, clear: () => setSaid(null) };
}

/** What `useAction` has to say, as a line under a rule. */
export function Said({ said }: { said: { ok: boolean; text: string } | null }) {
  if (!said) return null;
  return (
    <p
      role="status"
      className={cn(
        'border-t pt-2 text-[13px] font-semibold [text-wrap:pretty]',
        said.ok ? 'border-ink text-ink' : 'border-neutral-300 text-neutral-800',
      )}
    >
      {said.ok ? said.text : `Refused — ${said.text}`}
    </p>
  );
}
