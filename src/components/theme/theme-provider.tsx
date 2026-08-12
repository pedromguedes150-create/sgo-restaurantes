'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  type ThemeChoice,
} from '@/lib/theme';

interface ThemeContextValue {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Reflete a escolha no <html>: explícita → data-theme; 'system' → sem atributo. */
function applyTheme(theme: ThemeChoice) {
  const el = document.documentElement;
  if (theme === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', theme);
}

/**
 * `initial` vem do servidor (cookie), então o 1º render do cliente já bate com o
 * <html> renderizado no servidor — sem flash e sem mismatch de hidratação.
 */
export function ThemeProvider({
  initial,
  children,
}: {
  initial: ThemeChoice;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeChoice>(initial);

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    applyTheme(t);
    document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }, []);

  // Mantém o atributo coerente com o estado (no-op quando já bate com o servidor).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return ctx;
}
