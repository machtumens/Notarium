import { useState, useEffect } from 'react';
import { Theme, themes, getCurrentTheme } from '../theme';

export const useTheme = () => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(getCurrentTheme());

  const changeTheme = (themeName: string) => {
    const newTheme = themes[themeName];
    if (newTheme) {
      localStorage.setItem('notarium_theme', themeName);
      setCurrentTheme(newTheme);

      // Apply background if theme has one
      if (newTheme.background) {
        // eslint-disable-next-line react-hooks/immutability -- intentional DOM side effect: apply theme background to document.body
        document.body.style.background = newTheme.background.image
          ? `url(${newTheme.background.image}) center/cover fixed`
          : newTheme.background.gradient || newTheme.colors.bgPrimary;

        // Add overlay if specified
        if (newTheme.background.overlay && newTheme.background.image) {
          // eslint-disable-next-line react-hooks/immutability -- intentional DOM side effect: apply theme background overlay to document.body
          document.body.style.background = `
            linear-gradient(${newTheme.background.overlay}, ${newTheme.background.overlay}),
            url(${newTheme.background.image}) center/cover fixed
          `;
        }
      } else {
        // eslint-disable-next-line react-hooks/immutability -- intentional DOM side effect: apply theme background to document.body
        document.body.style.background = newTheme.colors.bgPrimary;
      }

      // Force a re-render by updating CSS variables
      updateCSSVariables(newTheme);

      // Trigger a custom event so other components can react
      window.dispatchEvent(new CustomEvent('themeChange', { detail: newTheme }));
    }
  };

  const updateCSSVariables = (theme: Theme) => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', theme.colors.bgPrimary);
    root.style.setProperty('--bg-secondary', theme.colors.bgSecondary);
    root.style.setProperty('--bg-tertiary', theme.colors.bgTertiary);
    root.style.setProperty('--text-primary', theme.colors.textPrimary);
    root.style.setProperty('--text-secondary', theme.colors.textSecondary);
    root.style.setProperty('--border-color', theme.colors.borderColor);
    root.style.setProperty('--accent', theme.colors.accent);
    root.style.setProperty('--accent-hover', theme.colors.accentHover);
  };

  // Initialize theme on mount
  useEffect(() => {
    const theme = getCurrentTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- applies persisted theme (setState + DOM) on mount; behavior-preserving
    changeTheme(theme.name);
  }, []);

  return {
    currentTheme,
    changeTheme,
    themes,
  };
};
