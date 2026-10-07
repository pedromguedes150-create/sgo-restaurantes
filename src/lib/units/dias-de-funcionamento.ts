/**
 * DIAS DE FUNCIONAMENTO DA UNIDADE (v1.157.0) — PURO (sem banco), usado pela
 * geração de checklists, pela limpeza dos "não realizados" e pela tela.
 *
 * Pedido do Pedro: a unidade Produtos abre de segunda a sexta, e o SGO gerava os
 * checklists de sábado e domingo — que viravam "não realizados" e derrubavam a
 * meta. A regra nº 5 (calendário de operação, fins de semana incluídos) continua
 * valendo: o padrão é a semana inteira; quem não abre num dia é que DECLARA isso
 * no cadastro da unidade.
 *
 * Dia da semana: 0 = domingo … 6 = sábado (o mesmo de `Date.getUTCDay`).
 */

export const TODOS_OS_DIAS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
export const NOMES_DOS_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
export const SIGLAS_DOS_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/** Dia da semana de uma data operacional 'AAAA-MM-DD' (conta em UTC sobre y/m/d puros). */
export function diaDaSemana(dataOperacional: string): number {
  const [y, m, d] = dataOperacional.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * A unidade funciona nesta data? Lista vazia ou ausente = funciona todo dia —
 * uma unidade sem a informação nunca pode PARAR de gerar checklist em silêncio.
 */
export function funcionaNoDia(dias: readonly number[] | null | undefined, dataOperacional: string): boolean {
  if (!dias || dias.length === 0) return true;
  return dias.includes(diaDaSemana(dataOperacional));
}

/** Valida o que veio do corpo: inteiros 0..6, sem repetição, pelo menos UM dia. */
export function normalizarDias(entrada: unknown): number[] | null {
  if (!Array.isArray(entrada)) return null;
  const dias = new Set<number>();
  for (const v of entrada) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 6) return null;
    dias.add(v);
  }
  if (dias.size === 0) return null;
  return Array.from(dias).sort((a, b) => a - b);
}

/** Dias da semana em que a unidade NÃO funciona. */
export function diasFechados(dias: readonly number[] | null | undefined): number[] {
  if (!dias || dias.length === 0) return [];
  return TODOS_OS_DIAS.filter((d) => !dias.includes(d));
}

/**
 * Texto curto para a tela: "Todos os dias", "Seg a Sex", "Seg a Sáb",
 * ou a lista ("Seg, Qua, Sex") quando os dias não são seguidos.
 */
export function rotuloDosDias(dias: readonly number[] | null | undefined): string {
  if (!dias || dias.length === 0 || dias.length === 7) return 'Todos os dias';
  const ord = [...dias].sort((a, b) => a - b);
  const seguidos = ord.every((d, i) => i === 0 || d === ord[i - 1] + 1);
  if (seguidos && ord.length >= 3) return `${SIGLAS_DOS_DIAS[ord[0]]} a ${SIGLAS_DOS_DIAS[ord[ord.length - 1]]}`;
  return ord.map((d) => SIGLAS_DOS_DIAS[d]).join(', ');
}
