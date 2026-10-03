'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';
import type { ThemeChoice } from '@/lib/theme';

/**
 * Alternância de tema da barra (kit de layout, 2-moldura/ThemeToggle.tsx):
 * um botão redondo que percorre claro → escuro → aparelho. O ícone mostra a
 * PREFERÊNCIA (monitor no automático), não o tema resolvido. O seletor de
 * três opções de Meu Perfil → Aparência continua existindo.
 */
const PROXIMO: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' };
const ROTULO: Record<ThemeChoice, string> = { light: 'Tema claro', dark: 'Tema escuro', system: 'Tema do aparelho' };
const ICONE: Record<ThemeChoice, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = { light: Sun, dark: Moon, system: Monitor };

export function ThemeNavToggle() {
  const { theme, setTheme } = useTheme();
  const Icone = ICONE[theme];
  return (
    <button type="button" className="sgo-naviconbtn" data-theme={theme} onClick={() => setTheme(PROXIMO[theme])} aria-label={`${ROTULO[theme]} — clique para ${ROTULO[PROXIMO[theme]].toLowerCase()}`} title={`${ROTULO[theme]} · clique para ${ROTULO[PROXIMO[theme]].toLowerCase()}`}>
      <Icone style={{ width: 18, height: 18 }} />
    </button>
  );
}
