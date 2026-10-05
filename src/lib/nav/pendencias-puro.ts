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

/**
 * O que cada contagem significa — vira o título do selo no item do menu
 * (v1.154.0: o selo da área dizia "3" sem dizer ONDE; agora o item mostra o
 * número e, ao passar o mouse, o que ele conta).
 */
export const DESCRICAO_PENDENCIA: Record<string, [singular: string, plural: string]> = {
  TASKS: ['tarefa com prazo vencido', 'tarefas com prazo vencido'],
  PAYMENTS: ['pagamento esperando a sua aprovação', 'pagamentos esperando a sua aprovação'],
  COMMUNICATION: ['comunicado para confirmar a leitura', 'comunicados para confirmar a leitura'],
  OCCURRENCES: ['ocorrência crítica em aberto', 'ocorrências críticas em aberto'],
};

export function textoDaPendencia(key: string, n: number): string {
  const d = DESCRICAO_PENDENCIA[key];
  if (!d) return `${n} pendência(s)`;
  return `${n} ${n === 1 ? d[0] : d[1]}`;
}
