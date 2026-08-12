'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './theme-provider';
import type { ThemeChoice } from '@/lib/theme';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Escuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor },
];

/** Alternador de tema (Claro / Escuro / Sistema). Usa apenas tokens do DS. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex items-center gap-1 rounded-pill border border-line bg-sgo-surface p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={`inline-flex h-8 items-center gap-1 rounded-pill px-2 text-[13px] font-medium leading-none outline-none transition-colors duration-sgo-2 ease-sgo-std focus-visible:shadow-sgo-focus ${
              active
                ? 'bg-sgo-brand text-on-brand'
                : 'text-ink-500 hover:text-ink-900'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="hidden px-1 sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
