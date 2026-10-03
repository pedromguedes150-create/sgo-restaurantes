import type { AreaMontada } from '@/lib/nav/areas';

/**
 * Parte PURA dos selos de pendência (sem Prisma): a barra é componente
 * cliente e não pode importar `pendencias.ts`, que carrega o banco.
 */
export type Pendencias = Record<string, number>;

/** Soma por área: a chave do selo é o id da área, o valor é a soma dos módulos dela. */
export function badgesPorArea(areas: AreaMontada[], pendencias: Pendencias): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of areas) {
    let soma = 0;
    for (const c of a.colunas) for (const i of c.itens) soma += pendencias[i.key] ?? 0;
    if (soma > 0) out[a.id] = soma;
  }
  return out;
}
