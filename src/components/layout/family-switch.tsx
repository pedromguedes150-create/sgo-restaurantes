'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { ActionMenu } from '@/components/ui/ds/action-menu';

/**
 * Troca entre os módulos IRMÃOS de uma família (ex.: Suprimentos → Notas,
 * Inventário, Pedidos).
 *
 * Por que NÃO é um trilho de abas: cinco dessas páginas — Notas, Pessoas,
 * Inventário, Pedidos e Supervisão — já têm trilho próprio. Uma barra da
 * família em cima recriaria os DOIS TRILHOS EMPILHADOS que acabamos de tirar de
 * Ocorrências e de Notas. Um botão ao lado do título troca de irmão sem
 * acrescentar trilho nenhum, e fica igual nas quinze páginas — com ou sem abas
 * próprias.
 *
 * Reusa o ActionMenu: mesmo gesto, mesmo teclado, mesmo desenho do resto.
 */
export function FamilySwitch({
  familyTitle,
  siblings,
}: {
  familyTitle: string;
  /** Já filtrados por permissão no servidor, e sem a página atual. */
  siblings: { href: string; tab: string }[];
}) {
  const router = useRouter();
  if (siblings.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <span className="sgo-type-13 text-ink-500">{familyTitle}</span>
      <ChevronDown className="h-3.5 w-3.5 text-ink-400" aria-hidden />
      <ActionMenu
        label={`Ir para outra seção de ${familyTitle}`}
        items={siblings.map((s) => ({ label: s.tab, onSelect: () => router.push(s.href) }))}
      />
    </span>
  );
}
