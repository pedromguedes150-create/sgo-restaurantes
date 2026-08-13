'use client';

import { useRouter } from 'next/navigation';
import { SegmentedControl } from './segmented-control';

/**
 * SegmentedControl ligado ao roteador (Onda 3): as "abas" que na verdade são
 * navegação (?view=, ?status=) ganham o mesmo controle das abas de estado, em
 * vez de virarem uma fileira de pílulas-link com estilo próprio em cada tela.
 *
 * O destino vem em `href` DENTRO de cada opção — e não como função — porque
 * Server Components não podem passar funções para Client Components.
 */
export interface NavSegment { value: string; label: string; href: string; badge?: number }

export function SegmentedNav({
  options, value, size = 'sm', ...rest
}: {
  options: NavSegment[];
  value: string;
  size?: 'sm' | 'md';
  'aria-label': string;
}) {
  const router = useRouter();
  return (
    <SegmentedControl
      aria-label={rest['aria-label']}
      options={options.map(({ value: v, label, badge }) => ({ value: v, label, badge }))}
      value={value}
      size={size}
      onValueChange={(v) => {
        const target = options.find((o) => o.value === v);
        if (target) router.push(target.href);
      }}
    />
  );
}
