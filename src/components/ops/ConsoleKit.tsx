/**
 * Console primitives for the admin surfaces (ops today, moderation next).
 *
 * These are instrument-grade versions of the plain cards the ops page used to
 * build inline: a sticky HUD, readout tiles that carry state, status lights,
 * guarded destructive controls and a typed-phrase confirm. Everything below is
 * presentational — no data fetching, no api imports — so both dashboards can
 * share them.
 *
 * Colours come from `darkTheme` (the Frosted Canopy palette; the name is a
 * legacy alias). The only additions are the darkened semantic inks used for
 * text on a tinted chip, which the Theme shape does not carry.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { darkTheme } from '../../theme';
import { ink } from './tokens';

const t = darkTheme;

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'mute';

const toneColor: Record<Tone, string> = {
  ok: t.colors.success,
  warn: t.colors.warning,
  crit: t.colors.danger,
  info: t.palette?.juniper ?? ink.info,
  mute: ink.faint,
};

const toneInk: Record<Tone, string> = {
  ok: ink.ok,
  warn: ink.warn,
  crit: ink.crit,
  info: ink.info,
  mute: ink.faint,
};

/** rgba() from a hex + alpha, so tints stay derived from the palette. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const mono = "'IBM Plex Mono', ui-monospace, monospace";

// ─────────────────────────────────────────────────────────── HUD

export interface HudReadout {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: Tone;
}

/**
 * Always-on instrument strip. Sticks to the top so the operator never has to
 * navigate to find out whether something is wrong.
 */
export function Hud({
  title,
  scope,
  items,
  right,
}: {
  title: string;
  scope: string;
  items: HudReadout[];
  right?: ReactNode;
}) {
  return (
    <header
      style={{
        background: ink.hud,
        color: '#dfeae2',
        display: 'flex',
        alignItems: 'stretch',
        overflowX: 'auto',
        boxShadow: '0 1px 0 rgba(0,0,0,.2)',
      }}
      className="ops-hud ops-hud-bar"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          padding: '7px 16px',
          borderRight: '1px solid rgba(255,255,255,.08)',
          flex: 'none',
        }}
      >
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '7px',
            display: 'grid',
            placeItems: 'center',
            background: `linear-gradient(150deg, ${t.colors.accent}, #4c9a70)`,
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 700,
            fontSize: '14px',
            color: '#fff',
          }}
        >
          N
        </div>
        <div>
          <div
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 600,
              fontSize: '13px',
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: '9px',
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'rgba(223,234,226,.45)',
            }}
          >
            {scope}
          </div>
        </div>
      </div>

      {items.map((it) => (
        <div
          key={it.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '1px',
            padding: '7px 15px',
            borderRight: '1px solid rgba(255,255,255,.08)',
            whiteSpace: 'nowrap',
            flex: 'none',
          }}
        >
          <span
            style={{
              fontSize: '9px',
              letterSpacing: '.13em',
              textTransform: 'uppercase',
              color: 'rgba(223,234,226,.5)',
            }}
          >
            {it.label}
          </span>
          <span
            style={{
              fontFamily: mono,
              fontVariantNumeric: 'tabular-nums',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color:
                it.tone === 'ok'
                  ? '#8fd0ae'
                  : it.tone === 'warn'
                    ? '#e0b877'
                    : it.tone === 'crit'
                      ? '#e39a7c'
                      : '#dfeae2',
            }}
          >
            {it.value}
            {it.unit && (
              <span style={{ fontSize: '10px', color: 'rgba(223,234,226,.45)', fontWeight: 400 }}>
                {it.unit}
              </span>
            )}
          </span>
        </div>
      ))}

      {right && (
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 14px',
            flex: 'none',
          }}
        >
          {right}
        </div>
      )}
    </header>
  );
}

// ─────────────────────────────────────────────────────── Readouts

/** 1px-gap grid so the tiles read as one instrument cluster, not loose cards. */
export function Readouts({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1px',
        background: t.colors.borderColor,
        borderRadius: t.borderRadius.md,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,.78)',
      }}
    >
      {children}
    </div>
  );
}

export function Readout({
  label,
  value,
  unit,
  delta,
  state,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: ReactNode;
  state?: 'warn' | 'crit';
}) {
  const bg =
    state === 'crit'
      ? tint(t.colors.danger, 0.1)
      : state === 'warn'
        ? tint(t.colors.warning, 0.09)
        : 'rgba(255,255,255,.72)';
  const valueColor =
    state === 'crit' ? ink.crit : state === 'warn' ? ink.warn : t.colors.textPrimary;
  return (
    <div style={{ background: bg, padding: '11px 13px' }}>
      <div
        style={{
          fontSize: '9.5px',
          letterSpacing: '.11em',
          textTransform: 'uppercase',
          color: ink.fainter,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: mono,
          fontVariantNumeric: 'tabular-nums',
          fontSize: '22px',
          fontWeight: 500,
          letterSpacing: '-.02em',
          lineHeight: 1.15,
          marginTop: '4px',
          color: valueColor,
        }}
      >
        {value}
        {unit && (
          <span
            style={{ fontSize: '11px', color: ink.fainter, fontWeight: 400, marginLeft: '2px' }}
          >
            {unit}
          </span>
        )}
      </div>
      {delta && <div style={{ fontSize: '11px', color: ink.faint, marginTop: '3px' }}>{delta}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────── Panel

export function Panel({
  legend,
  sub,
  actions,
  tone,
  children,
  bodyPadding = '14px',
}: {
  legend: string;
  sub?: ReactNode;
  actions?: ReactNode;
  tone?: 'crit';
  children: ReactNode;
  bodyPadding?: string;
}) {
  const border = tone === 'crit' ? tint(t.colors.danger, 0.35) : 'rgba(255,255,255,.78)';
  return (
    <section
      style={{
        background: t.colors.bgSecondary,
        backdropFilter: t.glass?.panelBlur ?? 'blur(22px) saturate(1.25)',
        border: `1px solid ${border}`,
        borderRadius: t.borderRadius.md,
        boxShadow: t.shadows.default,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          padding: '9px 14px',
          borderBottom: `1px solid ${tone === 'crit' ? tint(t.colors.danger, 0.25) : t.colors.borderColor}`,
          background: tone === 'crit' ? tint(t.colors.danger, 0.07) : 'rgba(255,255,255,.4)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '11px',
            letterSpacing: '.11em',
            textTransform: 'uppercase',
            fontWeight: 600,
            color: tone === 'crit' ? ink.crit : t.colors.textSecondary,
          }}
        >
          {legend}
        </h2>
        {sub && (
          <span style={{ fontSize: '11px', color: ink.fainter, fontFamily: mono }}>{sub}</span>
        )}
        {actions && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>{actions}</div>
        )}
      </div>
      <div style={{ padding: bodyPadding }}>{children}</div>
    </section>
  );
}

// ───────────────────────────────────────────────────────── Lights

export function Lights({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '8px',
      }}
    >
      {children}
    </div>
  );
}

/** `state === undefined` renders the unknown/off bulb rather than a false green. */
export function Light({
  name,
  value,
  state,
}: {
  name: string;
  value?: ReactNode;
  state: Tone | undefined;
}) {
  const c = state ? toneColor[state] : ink.faint;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '9px 11px',
        borderRadius: t.borderRadius.sm,
        background: '#fff',
        border: `1px solid ${t.colors.borderColor}`,
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          flex: 'none',
          background: c,
          boxShadow: `0 0 0 3px ${tint(c, 0.18)}`,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 500 }}>{name}</div>
        {value != null && (
          <div style={{ fontSize: '10px', color: ink.fainter, fontFamily: mono }}>{value}</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────── Pills & rows

export function Pill({
  tone = 'mute',
  children,
  bare,
}: {
  tone?: Tone;
  children: ReactNode;
  bare?: boolean;
}) {
  const c = toneColor[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '10.5px',
        fontWeight: 500,
        padding: '2px 7px',
        borderRadius: '4px',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        color: toneInk[tone],
        background: tint(c, 0.15),
        border: `1px solid ${tint(c, 0.3)}`,
      }}
    >
      {!bare && (
        <span
          style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor' }}
        />
      )}
      {children}
    </span>
  );
}

/** Label + description on the left, controls on the right. */
export function SwitchRow({
  name,
  desc,
  children,
}: {
  name: string;
  desc?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 0',
        borderBottom: `1px solid ${t.colors.borderColor}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: '12.5px' }}>{name}</div>
        {desc && (
          <div style={{ fontSize: '11px', color: ink.fainter, marginTop: '1px' }}>{desc}</div>
        )}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {children}
      </div>
    </div>
  );
}

export function Switch({
  on,
  onChange,
  disabled,
  danger,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  danger?: boolean;
  label: string;
}) {
  const bg = on ? (danger ? t.colors.danger : t.colors.accent) : 'rgba(28,42,34,.045)';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="ops-focus"
      style={{
        position: 'relative',
        width: '38px',
        height: '21px',
        borderRadius: '999px',
        flex: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        background: bg,
        border: `1px solid ${on ? bg : 'rgba(28,42,34,.2)'}`,
        transition: t.transitions.fast,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '2px',
          left: '2px',
          width: '15px',
          height: '15px',
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(28,42,34,.3)',
          transform: on ? 'translateX(17px)' : 'none',
          transition: t.transitions.fast,
        }}
      />
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  size = 'md',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  size?: 'md' | 'xs';
  type?: 'button' | 'submit';
}) {
  const base: CSSProperties = {
    font: 'inherit',
    fontSize: size === 'xs' ? '11px' : '12px',
    fontWeight: 500,
    padding: size === 'xs' ? '3px 8px' : '5px 11px',
    borderRadius: t.borderRadius.sm,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.42 : 1,
    border: `1px solid rgba(28,42,34,.2)`,
    background: '#fff',
    color: t.colors.textPrimary,
    transition: t.transitions.fast,
  };
  const v: CSSProperties =
    variant === 'primary'
      ? { background: t.colors.accent, borderColor: t.colors.accent, color: '#fff' }
      : variant === 'danger'
        ? { color: ink.crit, borderColor: tint(t.colors.danger, 0.4) }
        : variant === 'ghost'
          ? { borderColor: 'transparent', background: 'none', color: t.colors.textSecondary }
          : {};
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`ops-btn ops-btn-${variant} ops-focus`}
      style={{ ...base, ...v }}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: 'inline-flex',
        background: 'rgba(28,42,34,.045)',
        borderRadius: t.borderRadius.sm,
        padding: '2px',
        gap: '1px',
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className="ops-focus"
            style={{
              border: 0,
              font: 'inherit',
              fontSize: '11.5px',
              padding: '4px 10px',
              borderRadius: '5px',
              cursor: 'pointer',
              background: on ? '#fff' : 'none',
              color: on ? t.colors.textPrimary : t.colors.textSecondary,
              fontWeight: on ? 600 : 400,
              boxShadow: on ? '0 1px 2px rgba(28,42,34,.14)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'crit';
  children: ReactNode;
}) {
  const c = tone === 'crit' ? t.colors.danger : tone === 'warn' ? t.colors.warning : toneColor.info;
  return (
    <div
      style={{
        borderLeft: `3px solid ${c}`,
        background: tint(c, 0.07),
        padding: '10px 12px',
        borderRadius: `0 ${t.borderRadius.sm} ${t.borderRadius.sm} 0`,
        fontSize: '12.5px',
        color: t.colors.textSecondary,
      }}
    >
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────── Guard

/**
 * A striped cover over a destructive control. Lifting it is a deliberate first
 * act, so a destructive button can never be the thing you hit by accident on
 * the way to something else.
 *
 * To re-cover it when the thing it guards changes (a different day count, a
 * different target), give it a React `key` derived from that value — remounting
 * resets the cover, which is cheaper and less surprising than an effect.
 */
export function Guard({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {children}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ops-focus"
          aria-label="Lift the cover to arm this control"
          style={{
            position: 'absolute',
            inset: '-3px -4px',
            borderRadius: t.borderRadius.sm,
            cursor: 'pointer',
            border: `1px solid ${tint(t.colors.danger, 0.5)}`,
            background: `repeating-linear-gradient(45deg, ${tint(t.colors.danger, 0.16)} 0 6px, ${tint(t.colors.danger, 0.05)} 6px 12px)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '9.5px',
            letterSpacing: '.09em',
            textTransform: 'uppercase',
            fontWeight: 600,
            color: ink.crit,
            font: 'inherit',
          }}
        >
          Lift to arm
        </button>
      )}
    </span>
  );
}

// ──────────────────────────────────────────────────────── Confirm

export interface ConfirmSpec {
  title: string;
  body: string;
  /** What actually gets touched — shown verbatim so the count is never a surprise. */
  affected?: string;
  /** Typed exactly (case-insensitive) before the action unlocks. */
  phrase: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/**
 * Replaces the stacked window.confirm() calls. Two improvements that matter:
 * the dialog states the blast radius, and the operator has to type the phrase,
 * so muscle memory cannot carry them through it.
 *
 * The body is a separate component keyed on the spec, so each open starts with
 * an empty box by mounting fresh rather than by clearing state in an effect.
 */
export function ConfirmDialog({
  spec,
  onCancel,
}: {
  spec: ConfirmSpec | null;
  onCancel: () => void;
}) {
  if (!spec) return null;
  return <ConfirmBody key={`${spec.title}|${spec.phrase}`} spec={spec} onCancel={onCancel} />;
}

function ConfirmBody({ spec, onCancel }: { spec: ConfirmSpec; onCancel: () => void }) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const armed = typed.trim().toLowerCase() === spec.phrase.toLowerCase();

  return (
    <>
      {/* A button, not a div: clicking the backdrop to dismiss has to be
          reachable by keyboard too, and Escape alone is not discoverable. */}
      <button
        type="button"
        aria-label="Cancel and close"
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          border: 0,
          padding: 0,
          cursor: 'default',
          background: 'rgba(20,44,30,.34)',
          backdropFilter: 'blur(3px)',
          zIndex: 90,
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={spec.title}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 'min(430px, 92vw)',
          zIndex: 95,
          background: '#fbfdfa',
          border: `1px solid ${tint(t.colors.danger, 0.4)}`,
          borderRadius: '12px',
          boxShadow: t.shadows.lg,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${tint(t.colors.danger, 0.25)}`,
            background: tint(t.colors.danger, 0.07),
          }}
        >
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: ink.crit }}>
            {spec.title}
          </h2>
        </div>
        <div
          style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            fontSize: '12.5px',
            color: t.colors.textSecondary,
          }}
        >
          <p style={{ margin: 0 }}>{spec.body}</p>
          {spec.affected && (
            <Callout tone="crit">
              Affects: <span style={{ fontFamily: mono }}>{spec.affected}</span>
            </Callout>
          )}
          <label htmlFor="ops-confirm" style={{ display: 'block' }}>
            <span style={{ fontSize: '11px', color: ink.fainter }}>
              Type{' '}
              <span style={{ fontFamily: mono, color: ink.crit, fontWeight: 600 }}>
                {spec.phrase}
              </span>{' '}
              to continue
            </span>
            <input
              id="ops-confirm"
              ref={inputRef}
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              aria-label={`Type ${spec.phrase} to confirm`}
              className="ops-focus"
              style={{
                width: '100%',
                marginTop: '5px',
                font: 'inherit',
                fontFamily: mono,
                fontSize: '12px',
                padding: '5px 9px',
                border: '1px solid rgba(28,42,34,.2)',
                borderRadius: t.borderRadius.sm,
                background: '#fff',
                color: t.colors.textPrimary,
              }}
            />
          </label>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
            padding: '12px 16px',
            borderTop: `1px solid ${t.colors.borderColor}`,
            background: 'rgba(28,42,34,.045)',
          }}
        >
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!armed}
            onClick={() => {
              spec.onConfirm();
              onCancel();
            }}
          >
            {spec.confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────── Tabs & tables

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: Array<{ key: T; label: string; count?: number; hot?: boolean }>;
  active: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      style={{
        display: 'flex',
        gap: '1px',
        borderBottom: `1px solid ${t.colors.borderColor}`,
        marginBottom: '16px',
        overflowX: 'auto',
      }}
      className="ops-hud ops-hud-bar"
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.key)}
            className="ops-focus"
            style={{
              border: 0,
              background: 'none',
              font: 'inherit',
              fontSize: '12.5px',
              color: on ? t.colors.textPrimary : t.colors.textSecondary,
              fontWeight: on ? 600 : 400,
              padding: '7px 13px',
              cursor: 'pointer',
              borderBottom: `2px solid ${on ? t.colors.accent : 'transparent'}`,
              marginBottom: '-1px',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {tab.label}
            {tab.count != null && (
              <Pill tone={tab.hot ? 'crit' : 'mute'} bare>
                {tab.count}
              </Pill>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal scroll lives on the table's own container, never the page body. */
export function TableWrap({ children, maxHeight }: { children: ReactNode; maxHeight?: string }) {
  return (
    <div style={{ overflowX: 'auto', overflowY: maxHeight ? 'auto' : undefined, maxHeight }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
        {children}
      </table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '32px', textAlign: 'center', color: ink.fainter, fontSize: '12.5px' }}>
      {children}
    </div>
  );
}

/** Row actions that surface on hover — see `.ops-row` in index.css. */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <div
      className="ops-rowactions"
      style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}
    >
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────── Fields

export function TextField({
  value,
  onChange,
  placeholder,
  label,
  type = 'text',
  width,
  mono: isMono,
  disabled,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label: string;
  type?: 'text' | 'search' | 'number' | 'date';
  width?: string;
  mono?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      disabled={disabled}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="ops-focus"
      style={{
        font: 'inherit',
        fontFamily: isMono ? mono : undefined,
        fontSize: '12.5px',
        padding: '5px 9px',
        border: '1px solid rgba(28,42,34,.2)',
        borderRadius: t.borderRadius.sm,
        background: '#fff',
        color: t.colors.textPrimary,
        width: width ?? '100%',
      }}
    />
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  label,
  width,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  width?: string;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as T)}
      className="ops-focus"
      style={{
        font: 'inherit',
        fontSize: '12.5px',
        padding: '5px 9px',
        border: '1px solid rgba(28,42,34,.2)',
        borderRadius: t.borderRadius.sm,
        background: '#fff',
        color: t.colors.textPrimary,
        width: width ?? 'auto',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Filters({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────── Avatar, Modal

export function Avatar({
  name,
  photoUrl,
  size = 34,
}: {
  name: string;
  photoUrl?: string;
  size?: number;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${Math.round(size * 0.3)}px`,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        fontFamily: "'Bricolage Grotesque', sans-serif",
        fontWeight: 600,
        fontSize: `${Math.round(size * 0.38)}px`,
        background: photoUrl
          ? `url('${photoUrl}') center/cover`
          : `linear-gradient(150deg, #4c9a70, ${t.colors.accent})`,
      }}
    >
      {!photoUrl && (name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * Shared modal shell. Backdrop is a real button so dismissing by clicking away
 * is reachable from the keyboard, and Escape closes.
 */
export function Modal({
  title,
  sub,
  onClose,
  children,
  footer,
  width = '520px',
  tone,
}: {
  title: string;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  tone?: 'crit';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          border: 0,
          padding: 0,
          cursor: 'default',
          background: 'rgba(20,44,30,.34)',
          backdropFilter: 'blur(3px)',
          zIndex: 90,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: `min(${width}, 94vw)`,
          maxHeight: '88vh',
          overflowY: 'auto',
          zIndex: 95,
          background: '#fbfdfa',
          border: `1px solid ${tone === 'crit' ? tint(t.colors.danger, 0.4) : t.colors.borderColor}`,
          borderRadius: '12px',
          boxShadow: t.shadows.lg,
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '14px 16px',
            borderBottom: `1px solid ${tone === 'crit' ? tint(t.colors.danger, 0.25) : t.colors.borderColor}`,
            background: tone === 'crit' ? tint(t.colors.danger, 0.07) : '#fbfdfa',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: '16px',
                fontWeight: 600,
                color: tone === 'crit' ? ink.crit : t.colors.textPrimary,
              }}
            >
              {title}
            </h2>
            {sub && (
              <div style={{ fontSize: '11.5px', color: ink.fainter, marginTop: '2px' }}>{sub}</div>
            )}
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="ghost" size="xs" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>
        <div style={{ padding: '16px' }}>{children}</div>
        {footer && (
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
              padding: '12px 16px',
              borderTop: `1px solid ${t.colors.borderColor}`,
              background: 'rgba(28,42,34,.045)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

/** Label-left / control-right form row, matching SwitchRow's rhythm. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '130px minmax(0,1fr)',
        gap: '10px',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: `1px solid ${t.colors.borderColor}`,
      }}
    >
      <label htmlFor={htmlFor} style={{ fontSize: '11.5px', color: ink.faint }}>
        {label}
      </label>
      <div>
        {children}
        {hint && (
          <div style={{ fontSize: '10.5px', color: ink.fainter, marginTop: '3px' }}>{hint}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Ranked horizontal bars. Widths are relative to the largest row, so the shape
 * reads as "share of the total" rather than an absolute scale.
 */
export function BarList({
  rows,
  tone = 'accent',
  empty,
}: {
  rows: Array<{ label: ReactNode; value: number; note?: ReactNode }>;
  tone?: 'accent' | 'info' | 'warn';
  empty?: ReactNode;
}) {
  if (rows.length === 0) return <EmptyState>{empty ?? 'Nothing to show yet.'}</EmptyState>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fill =
    tone === 'info'
      ? (t.palette?.juniper ?? '#3e7d8c')
      : tone === 'warn'
        ? t.colors.warning
        : t.colors.accent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11.5px',
              gap: '10px',
            }}
          >
            <span style={{ minWidth: 0 }}>{r.label}</span>
            <span style={{ fontFamily: mono, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
              {r.note ?? r.value.toLocaleString()}
            </span>
          </div>
          <div
            style={{
              height: '4px',
              borderRadius: '2px',
              background: 'rgba(28,42,34,.045)',
              marginTop: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '4px',
                borderRadius: '2px',
                width: `${Math.max(1, (r.value / max) * 100)}%`,
                background: r.value === 0 ? ink.fainter : fill,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
