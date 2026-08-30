// Frosted Canopy — the design system from the "Frosty glass redesign with natural
// green" brief (turn 2). One green family + one warm accent, white glass over
// leaves, pills for actions, 16px panels.
//
// Palette (from the brief's 2a "The system" card):
//   Mist    #f4f8f3  page ground        Pine    #2e7d52  system colour (was blue)
//   Frost   white 55% glass fill        Moss    #63a37f  positive / people
//   Ink     #1c2a22  primary text       Juniper #3e7d8c  exams / timed work
//   Ink-2   #3c4f43  metadata on frost  Honey   #b98a3f  "you" — points, streak
//                                       Clay    #bf6b4f  weak-topic feedback
//
// Wiring note: ~58 files consume `darkTheme.colors.*` as inline styles, so the
// object below is the single repaint point for most of the app. The `Theme`
// shape is unchanged (every existing consumer keeps compiling); the new design
// primitives are additive optional fields.

export interface Theme {
  name: string;
  displayName: string;
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    textPrimary: string;
    textSecondary: string;
    borderColor: string;
    accent: string;
    accentHover: string;
    success: string;
    danger: string;
    dangerHover: string;
    warning: string;
    cardBg: string;
  };
  transitions: {
    default: string;
    fast: string;
    slow: string;
  };
  shadows: {
    default: string;
    lg: string;
    md: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };
  background?: {
    image?: string;
    gradient?: string;
    overlay?: string;
  };
  /** Named palette entries the brief refers to by name. Additive. */
  palette?: {
    mist: string;
    ink: string;
    inkSoft: string;
    pine: string;
    pineDeep: string;
    moss: string;
    juniper: string;
    honey: string;
    clay: string;
  };
  /** Frost recipes — "white glass over leaves". Additive. */
  glass?: {
    /** Content panels: white 55%, blur 26. */
    panel: string;
    panelBorder: string;
    panelShadow: string;
    panelBlur: string;
    /** Nav / chrome: white 40%, blur 14. */
    chrome: string;
    chromeBorder: string;
    chromeBlur: string;
  };
}

const frostedCanopy: Theme = {
  name: 'frosted-canopy',
  displayName: 'Frosted Canopy',
  colors: {
    // Ground is Mist; panels above it are frost glass, so the "surface" tokens
    // are translucent white rather than solid greys.
    bgPrimary: '#f4f8f3',
    bgSecondary: 'rgba(255, 255, 255, 0.62)',
    bgTertiary: 'rgba(255, 255, 255, 0.40)',
    textPrimary: '#1c2a22',
    textSecondary: '#3c4f43',
    borderColor: 'rgba(28, 42, 34, 0.12)',
    accent: '#2e7d52',
    accentHover: '#3f9468',
    success: '#63a37f',
    danger: '#bf6b4f',
    dangerHover: '#a85a40',
    warning: '#b98a3f',
    cardBg: 'rgba(255, 255, 255, 0.55)',
  },
  transitions: {
    default: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    fast: 'all 0.15s ease',
    slow: 'all 0.5s ease',
  },
  // Shadows are green-tinted and softer — glass sits on foliage, it does not
  // punch a hole in a black page.
  shadows: {
    default: '0 10px 22px -12px rgba(42, 108, 71, 0.55)',
    lg: '0 18px 40px rgba(20, 44, 30, 0.18)',
    md: '0 12px 28px -14px rgba(20, 44, 30, 0.28)',
  },
  borderRadius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '16px',
    full: '9999px',
  },
  background: {
    // canopy-light.jpg is nature.jpg pre-blurred and washed once, so each screen
    // loads one flat plate instead of re-layering a 1920px photo per surface.
    image: '/canopy-light.jpg',
    overlay: 'rgba(244, 248, 243, 0.55)',
  },
  palette: {
    mist: '#f4f8f3',
    ink: '#1c2a22',
    inkSoft: '#3c4f43',
    pine: '#2e7d52',
    pineDeep: '#1f5c3e',
    moss: '#63a37f',
    juniper: '#3e7d8c',
    honey: '#b98a3f',
    clay: '#bf6b4f',
  },
  glass: {
    panel: 'rgba(255, 255, 255, 0.55)',
    panelBorder: '1px solid rgba(255, 255, 255, 0.75)',
    panelShadow: '0 18px 40px rgba(20, 44, 30, 0.18)',
    panelBlur: 'blur(26px) saturate(1.3)',
    chrome: 'rgba(255, 255, 255, 0.40)',
    chromeBorder: '1px solid rgba(255, 255, 255, 0.60)',
    chromeBlur: 'blur(14px)',
  },
};

export const themes: Record<string, Theme> = {
  default: frostedCanopy,
  'frosted-canopy': frostedCanopy,
};

export const getCurrentTheme = (): Theme => {
  return themes.default;
};

// Kept as the app-wide theme handle. The name is historical — 58 files import
// `darkTheme`, so renaming it would be a large no-value diff. It now resolves to
// Frosted Canopy (a light theme).
export const darkTheme = themes.default;

export const darkThemeStyles = `
  :root {
    --bg-primary: ${darkTheme.colors.bgPrimary};
    --bg-secondary: ${darkTheme.colors.bgSecondary};
    --bg-tertiary: ${darkTheme.colors.bgTertiary};
    --text-primary: ${darkTheme.colors.textPrimary};
    --text-secondary: ${darkTheme.colors.textSecondary};
    --border-color: ${darkTheme.colors.borderColor};
    --accent: ${darkTheme.colors.accent};
    --accent-hover: ${darkTheme.colors.accentHover};
    --transition: ${darkTheme.transitions.default};
    --shadow: ${darkTheme.shadows.default};
    --danger: ${darkTheme.colors.danger};
  }
`;

// ---------------------------------------------------------------------------
// Action styles — pills, frost, one inner highlight.
// Every button in the brief is a 999px pill at 38px tall.
// ---------------------------------------------------------------------------

export const buttonBaseStyle = {
  height: '38px',
  padding: '0 22px',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: '8px',
  transition: darkTheme.transitions.default,
  borderRadius: darkTheme.borderRadius.full,
};

/** Primary — pine gradient, soft drop. */
export const buttonPrimaryStyle = {
  ...buttonBaseStyle,
  background: 'linear-gradient(180deg, #3f9468, #2a6c47)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 10px 22px -12px rgba(42,108,71,.7)',
};

/** Secondary — frost glass. */
export const buttonSecondaryStyle = {
  ...buttonBaseStyle,
  background: 'rgba(255, 255, 255, 0.62)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(28, 42, 34, 0.12)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.85)',
  color: '#24382c',
  fontWeight: 500,
};

/** Quiet — bare pine text, no plate. */
export const buttonQuietStyle = {
  ...buttonBaseStyle,
  padding: '0 18px',
  background: 'transparent',
  color: '#1f5c3e',
};

/** Honey — points and "you" actions only. Never a destructive action. */
export const buttonHoneyStyle = {
  ...buttonBaseStyle,
  background: 'rgba(201, 155, 74, 0.20)',
  border: '1px solid rgba(185, 138, 60, 0.45)',
  backdropFilter: 'blur(10px)',
  color: '#6f5015',
};

/** Chip — subject / tag pills. */
export const chipStyle = {
  padding: '7px 14px',
  borderRadius: darkTheme.borderRadius.full,
  background: 'rgba(46, 125, 82, 0.15)',
  border: '1px solid rgba(46, 125, 82, 0.32)',
  fontSize: '11.5px',
  fontWeight: 600,
  color: '#1f5c3e',
};

/** Chip, empty state — "+ add". */
export const chipAddStyle = {
  padding: '7px 14px',
  borderRadius: darkTheme.borderRadius.full,
  background: 'transparent',
  border: '1px dashed rgba(28, 42, 34, 0.22)',
  fontSize: '11.5px',
  color: '#3c4f43',
  cursor: 'pointer',
};

export const inputStyle = {
  padding: '12px 16px',
  background: 'rgba(255, 255, 255, 0.62)',
  backdropFilter: 'blur(12px)',
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.md,
  color: darkTheme.colors.textPrimary,
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box' as const,
  transition: darkTheme.transitions.default,
};

/** Content panel — white 55%, blur 26, 16px corners. */
export const cardStyle = {
  background: 'rgba(255, 255, 255, 0.55)',
  backdropFilter: 'blur(26px) saturate(1.3)',
  border: '1px solid rgba(255, 255, 255, 0.75)',
  borderRadius: darkTheme.borderRadius.xl,
  boxShadow: '0 18px 40px rgba(20, 44, 30, 0.18)',
  padding: '16px',
  transition: darkTheme.transitions.default,
};

/** Nav / chrome panel — lighter frost, less blur. */
export const chromeStyle = {
  background: 'rgba(255, 255, 255, 0.40)',
  backdropFilter: 'blur(14px)',
  border: '1px solid rgba(255, 255, 255, 0.60)',
  borderRadius: darkTheme.borderRadius.lg,
};

export const modalOverlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  // Dim toward deep forest, not pure black — keeps the green cast under modals.
  background: 'rgba(20, 44, 30, 0.34)',
  backdropFilter: 'blur(6px)',
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  zIndex: 2000,
  padding: '16px',
};

export const modalContentStyle = {
  background: 'rgba(255, 255, 255, 0.82)',
  backdropFilter: 'blur(26px) saturate(1.3)',
  border: '1px solid rgba(255, 255, 255, 0.75)',
  borderRadius: darkTheme.borderRadius.xl,
  maxWidth: '400px',
  width: '100%',
  padding: '24px',
  boxShadow: '0 24px 60px rgba(20, 44, 30, 0.28)',
};
