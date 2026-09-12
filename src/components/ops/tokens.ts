/**
 * Console ink values. Kept out of ConsoleKit.tsx so that file exports only
 * components and Fast Refresh keeps working.
 *
 * These are the darkened semantic inks used for text sitting on a tinted chip
 * — the Theme shape carries the tint colours but not their readable text pairs.
 */
export const ink = {
  ok: '#2f6f4d',
  warn: '#8a6323',
  crit: '#96482c',
  info: '#2b606d',
  faint: '#6b7d72',
  fainter: '#94a49a',
  hud: '#18241d',
} as const;

import type { CSSProperties } from 'react';

export const monoFace = "'IBM Plex Mono', ui-monospace, monospace";
export const displayFace = "'Bricolage Grotesque', 'IBM Plex Sans', sans-serif";

/**
 * Dense table styles. Kept here rather than in ConsoleKit so that file exports
 * components only (Fast Refresh) — spread them onto <th>/<td> directly.
 */
export const thStyle: CSSProperties = {
  textAlign: 'left',
  fontSize: '9.5px',
  letterSpacing: '.11em',
  textTransform: 'uppercase',
  color: ink.fainter,
  fontWeight: 500,
  padding: '8px 12px',
  borderBottom: '1px solid rgba(28,42,34,.11)',
  whiteSpace: 'nowrap',
  background: 'rgba(255,255,255,.4)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

export const tdStyle: CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid rgba(28,42,34,.11)',
  verticalAlign: 'middle',
  fontSize: '12.5px',
};

export const tdNumStyle: CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  fontFamily: monoFace,
  fontVariantNumeric: 'tabular-nums',
};

/** Secondary line under a table cell's main value. */
export const rowSubStyle: CSSProperties = {
  fontSize: '10.5px',
  color: ink.fainter,
  marginTop: '1px',
};
