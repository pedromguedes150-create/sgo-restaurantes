'use client';

import { useTheme } from './theme-provider';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import type { ThemeChoice } from '@/lib/theme';

/**
 * Alternador de tema (Claro / Escuro / Seguir o aparelho).
 *
 * Passou a usar o SegmentedControl do DS na Onda 8. Antes tinha trilho e
 * pílula próprios, com o ativo em `bg-brand` sólido — o mesmo padrão que saiu
 * de 21 telas nesta onda, e que no tema escuro abre em rosa. Era o único
 * radiogroup do sistema que ainda destoava.
 *
 * Perdeu os ícones (sol/lua/monitor) porque o controle do iOS é texto puro OU
 * ícone puro; com três rótulos curtos o texto é mais claro que o desenho —
 * "Sistema" com um monitorzinho não dizia a quem não conhece a convenção.
 */
const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Aparelho' },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl
      aria-label="Tema"
      size="sm"
      value={theme}
      onValueChange={(v) => setTheme(v as ThemeChoice)}
      options={OPTIONS}
    />
  );
}
