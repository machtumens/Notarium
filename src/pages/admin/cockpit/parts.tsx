/**
 * Cockpit instruments. Plain SVG and CSS, no chart library: a dial, a strip chart, an annunciator
 * lamp, a guarded toggle. Colour never carries meaning alone — every lamp prints its verdict word,
 * and every instrument has a text equivalent for a screen reader.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { WORD, type Verdict } from './stations';

export type Tone = 'green' | 'amber' | 'red' | 'cyan' | 'dim';
export const toneOf = (v: Verdict): Tone =>
  v === 'go' ? 'green' : v === 'caution' ? 'amber' : v === 'nogo' ? 'red' : 'dim';

export const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** A bezelled panel. `code` is the plate number stamped in its corner, like a switch-panel label. */
export function Panel({
  code,
  title,
  right,
  children,
  className,
}: {
  code: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('ck-panel', className)}>
      <header className="ck-panel-head">
        <span className="ck-code">{code}</span>
        <h2 className="ck-title">{title}</h2>
        {right && <div className="ck-panel-right">{right}</div>}
      </header>
      {children}
    </section>
  );
}

/** Annunciator tile: an LED, the station, its verdict in words, and the evidence line. */
export function Lamp({
  verdict,
  label,
  detail,
}: {
  verdict: Verdict;
  label: string;
  detail: string;
}) {
  return (
    <div className="ck-lamp" data-tone={toneOf(verdict)} data-v={verdict}>
      <span className="ck-led" aria-hidden />
      <span className="ck-lamp-label">{label}</span>
      <span className="ck-lamp-word">{WORD[verdict]}</span>
      <span className="ck-lamp-detail">{detail}</span>
    </div>
  );
}

/** A digital numeric readout: label above, figure below, optional unit and sub-line. */
export function Readout({
  label,
  value,
  unit,
  sub,
  tone = 'cyan',
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="ck-readout" data-tone={tone}>
      <span className="ck-cap">{label}</span>
      <span className="ck-figure">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {sub && <span className="ck-sub">{sub}</span>}
    </div>
  );
}

/** A horizontal gauge bar for a count against the largest of its set. */
export function HBar({
  label,
  value,
  max,
  tone = 'cyan',
}: {
  label: string;
  value: number;
  max: number;
  tone?: Tone;
}) {
  return (
    <div className="ck-hbar" data-tone={tone}>
      <span className="ck-hbar-label" title={label}>
        {label}
      </span>
      <span className="ck-hbar-track" aria-hidden>
        <span
          style={{ width: `${max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0}%` }}
        />
      </span>
      <span className="ck-hbar-val">{fmt(value)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dial
// ---------------------------------------------------------------------------

const SWEEP_START = 135; // degrees, SVG orientation: 0 = +x, clockwise. 135° is bottom-left.
const SWEEP = 270;
const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
};
function arc(r: number, a0: number, a1: number) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * A 270° dial. `caution` / `warn` paint the amber and red bands for a higher-is-worse reading;
 * leave both off for a plain cyan scale. `value === null` parks the needle and prints dashes.
 */
export function Dial({
  label,
  value,
  max,
  unit,
  caution,
  warn,
  digits = 0,
}: {
  label: string;
  value: number | null;
  max: number;
  unit: string;
  caution?: number;
  warn?: number;
  digits?: number;
}) {
  const at = (v: number) => SWEEP_START + SWEEP * Math.min(Math.max(v / max, 0), 1);
  const bands: { from: number; to: number; tone: Tone }[] =
    caution === undefined || warn === undefined
      ? [{ from: 0, to: max, tone: 'cyan' }]
      : [
          { from: 0, to: caution, tone: 'green' },
          { from: caution, to: warn, tone: 'amber' },
          { from: warn, to: max, tone: 'red' },
        ];
  const tone: Tone =
    value === null
      ? 'dim'
      : warn !== undefined && value >= warn
        ? 'red'
        : caution !== undefined && value >= caution
          ? 'amber'
          : caution !== undefined
            ? 'green'
            : 'cyan';
  const [nx, ny] = polar(38, value === null ? SWEEP_START : at(value));
  const text = value === null ? 'no reading' : `${value.toFixed(digits)} ${unit} of ${max}`;
  return (
    <figure className="ck-dial" data-tone={tone} role="img" aria-label={`${label}: ${text}`}>
      <svg viewBox="0 0 120 112" aria-hidden>
        <path d={arc(50, SWEEP_START, SWEEP_START + SWEEP)} className="ck-dial-track" />
        {bands.map((b) => (
          <path
            key={b.from}
            d={arc(50, at(b.from), at(b.to))}
            className="ck-dial-band"
            data-tone={b.tone}
          />
        ))}
        {Array.from({ length: 11 }, (_, i) => {
          const a = SWEEP_START + (SWEEP / 10) * i;
          const [x0, y0] = polar(56, a);
          const [x1, y1] = polar(i % 5 === 0 ? 44 : 49, a);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} className="ck-dial-tick" />;
        })}
        <line x1="60" y1="60" x2={nx} y2={ny} className="ck-dial-needle" />
        <circle cx="60" cy="60" r="4" className="ck-dial-hub" />
        <text x="60" y="88" textAnchor="middle" className="ck-dial-val">
          {value === null ? '—' : value.toFixed(digits)}
        </text>
        <text x="60" y="100" textAnchor="middle" className="ck-dial-unit">
          {unit}
        </text>
      </svg>
      <figcaption className="ck-cap">{label}</figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

const H = 40;
/** Split on nulls so a dropped probe leaves a gap in the trace instead of a false line. */
function paths(values: (number | null)[], max: number) {
  const n = values.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => H - 2 - (v / max) * (H - 6);
  const runs: [number, number][][] = [[]];
  values.forEach((v, i) => {
    if (v === null) runs.push([]);
    else runs[runs.length - 1].push([x(i), y(v)]);
  });
  return runs
    .filter((r) => r.length > 0)
    .map((r) => {
      const line = r
        .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`)
        .join('');
      const area = `${line}L${r[r.length - 1][0].toFixed(2)} ${H}L${r[0][0].toFixed(2)} ${H}Z`;
      return { line, area };
    });
}

/** A strip chart. The scale is its own peak, printed, so the trace is never mistaken for an absolute. */
export function Scope({
  label,
  values,
  unit = '',
  tone = 'cyan',
  tall,
}: {
  label: string;
  values: (number | null)[];
  unit?: string;
  tone?: Tone;
  tall?: boolean;
}) {
  const real = values.filter((v): v is number => v !== null);
  const peak = Math.max(...real, 0);
  const max = Math.max(peak, 1);
  const last = real.length ? real[real.length - 1] : null;
  return (
    <figure
      className={cn('ck-scope', tall && 'ck-scope-tall')}
      data-tone={tone}
      role="img"
      aria-label={`${label}: latest ${last ?? 'none'}${unit}, peak ${peak}${unit}, ${real.length} samples`}
    >
      <figcaption>
        <span className="ck-cap">{label}</span>
        <span className="ck-scope-now">
          {last === null ? '—' : last.toLocaleString()}
          <small>{unit}</small>
        </span>
      </figcaption>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2="100" y1={H * f} y2={H * f} className="ck-scope-grid" />
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <line key={f} x1={100 * f} x2={100 * f} y1="0" y2={H} className="ck-scope-grid" />
        ))}
        {real.length > 0 &&
          paths(values, max).map((p, i) => (
            <g key={i}>
              <path d={p.area} className="ck-scope-fill" />
              <path d={p.line} className="ck-scope-line" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
      </svg>
      <span className="ck-scope-peak">
        {real.length ? `PEAK ${peak.toLocaleString()}${unit}` : 'NO SAMPLES'}
      </span>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

/**
 * A toggle switch. `guarded` puts a hazard-striped cover over it: the first press lifts the cover
 * for six seconds, the second throws the switch — the same arm-then-commit rule as `Confirm`.
 */
export function Switch({
  label,
  detail,
  on,
  disabled,
  guarded,
  onToggle,
}: {
  label: string;
  detail: string;
  on: boolean;
  disabled?: boolean;
  guarded?: boolean;
  onToggle: () => void;
}) {
  const [up, setUp] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const press = () => {
    if (guarded && !up) {
      setUp(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setUp(false), 6000);
      return;
    }
    clearTimeout(timer.current);
    setUp(false);
    onToggle();
  };
  return (
    <div className="ck-switch-row">
      <span className="ck-switch-text">
        <span className="ck-switch-label">{label}</span>
        <span className="ck-sub">{detail}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={guarded && !up ? `${label} — lift guard` : label}
        disabled={disabled}
        onClick={press}
        className="ck-switch"
        data-on={on}
        data-guard={guarded ? (up ? 'up' : 'down') : undefined}
      >
        <span className="ck-switch-lever" aria-hidden />
        <span className="ck-switch-state" aria-hidden>
          {guarded && !up ? 'GUARD' : on ? 'ON' : 'OFF'}
        </span>
      </button>
    </div>
  );
}
