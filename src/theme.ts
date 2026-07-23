// Theme type definition
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
  };
  background?: {
    image?: string;
    gradient?: string;
    overlay?: string;
  };
}

// Default theme with nature background
const defaultTheme: Theme = {
  name: 'default',
  displayName: 'Notarium',
  colors: {
    bgPrimary: '#0a0f1a',
    bgSecondary: '#111827',
    bgTertiary: '#1e293b',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    borderColor: '#334155',
    accent: '#3b82f6',
    accentHover: '#60a5fa',
    success: '#4ade80',
    danger: '#ef4444',
    dangerHover: '#dc2626',
    warning: '#f59e0b',
  },
  transitions: {
    default: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    fast: 'all 0.15s ease',
    slow: 'all 0.5s ease',
  },
  shadows: {
    default: '0 4px 6px -1px rgba(59, 130, 246, 0.2)',
    lg: '0 20px 25px -5px rgba(59, 130, 246, 0.3)',
    md: '0 10px 15px -3px rgba(59, 130, 246, 0.15)',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  background: {
    image: '/nature.jpg',
    overlay: 'rgba(10, 15, 26, 0.85)',
  },
};

// Export single theme
export const themes: Record<string, Theme> = {
  default: defaultTheme,
};

// Always use the default theme
export const getCurrentTheme = (): Theme => {
  return themes.default;
};

// Export default theme
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

export const buttonBaseStyle = {
  padding: '8px 16px',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500',
  transition: darkTheme.transitions.default,
  borderRadius: darkTheme.borderRadius.md,
};

export const buttonPrimaryStyle = {
  ...buttonBaseStyle,
  background: `linear-gradient(135deg, ${darkTheme.colors.accent}, ${darkTheme.colors.accentHover})`,
  boxShadow: darkTheme.shadows.default,
};

export const buttonSecondaryStyle = {
  ...buttonBaseStyle,
  background: 'transparent',
  border: `1px solid ${darkTheme.colors.borderColor}`,
};

export const inputStyle = {
  padding: '12px 16px',
  background: darkTheme.colors.bgSecondary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.md,
  color: darkTheme.colors.textPrimary,
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box' as const,
  transition: darkTheme.transitions.default,
};

export const cardStyle = {
  background: darkTheme.colors.bgSecondary,
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.lg,
  padding: '16px',
  transition: darkTheme.transitions.default,
};

export const modalOverlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(4px)',
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  zIndex: 2000,
  padding: '16px',
};

export const modalContentStyle = {
  background: 'rgba(10, 10, 10, 0.95)',
  backdropFilter: 'blur(10px)',
  border: `1px solid ${darkTheme.colors.borderColor}`,
  borderRadius: darkTheme.borderRadius.xl,
  maxWidth: '400px',
  width: '100%',
  padding: '24px',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
};
