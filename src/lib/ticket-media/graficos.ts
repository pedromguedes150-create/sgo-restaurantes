/**
 * GRÁFICOS DO TICKET MÉDIO (v1.209.0) — só APRESENTAÇÃO dos números que
 * `getPainel` já calculou. Nenhuma conta de ticket/receita mora aqui: a fatia é
 * a receita (ou os cupons) da unidade ÷ o total das importadas.
 *
 * Pedido do Daniel (16/11/2026): "um gráfico mais refinado para a gestão, tipo
 * um gráfico pizza". Arquivo puro.
 */

export interface LinhaParaGrafico {
  unitId: string;
  name: string;
  coupons: number;
  receita: number;
  ticket: number | null;
  variacaoTicket: number | null;
  importado: boolean;
}

export interface FatiaDeParticipacao {
  unitId: string | null;
  name: string;
  valor: number;
  /** Participação no total, 0–100 com uma casa. */
  pct: number;
  /** Índice da cor na paleta (estável: a mesma unidade tem a mesma cor nas duas roscas). */
  cor: number;
}

/** Fatias além deste número viram "Outras" — rosca com dez fatias finas não se lê. */
export const MAX_FATIAS = 7;

const umaCasa = (n: number) => Math.round(n * 10) / 10;

/**
 * Participação de cada unidade num total (receita ou cupons). Só as importadas
 * com valor > 0; da maior para a menor; o excedente é somado em "Outras".
 * `ordemDasCores` fixa a cor por unidade (a ordem da receita), para as duas
 * roscas falarem a mesma língua.
 */
export function participacao(linhas: LinhaParaGrafico[], campo: 'receita' | 'coupons', ordemDasCores: string[]): FatiaDeParticipacao[] {
  const com = linhas.filter((l) => l.importado && l[campo] > 0).sort((a, b) => b[campo] - a[campo] || a.name.localeCompare(b.name, 'pt-BR'));
  const total = com.reduce((s, l) => s + l[campo], 0);
  if (total <= 0) return [];
  const corDe = (id: string) => { const i = ordemDasCores.indexOf(id); return i < 0 || i >= MAX_FATIAS ? MAX_FATIAS : i; };
  const principais = com.filter((l) => corDe(l.unitId) < MAX_FATIAS);
  const resto = com.filter((l) => corDe(l.unitId) >= MAX_FATIAS);
  const fatias: FatiaDeParticipacao[] = principais.map((l) => ({ unitId: l.unitId, name: l.name, valor: l[campo], pct: umaCasa((l[campo] / total) * 100), cor: corDe(l.unitId) }));
  if (resto.length > 0) {
    const v = resto.reduce((s, l) => s + l[campo], 0);
    fatias.push({ unitId: null, name: `Outras (${resto.length})`, valor: v, pct: umaCasa((v / total) * 100), cor: MAX_FATIAS });
  }
  return fatias;
}

/** A ordem que fixa as cores: unidades importadas, da maior receita para a menor. */
export function ordemPorReceita(linhas: LinhaParaGrafico[]): string[] {
  return linhas.filter((l) => l.importado && l.receita > 0)
    .sort((a, b) => b.receita - a.receita || a.name.localeCompare(b.name, 'pt-BR'))
    .map((l) => l.unitId);
}

export interface BarraDoTicket {
  unitId: string;
  name: string;
  ticket: number;
  /** Largura da barra, 0–100, relativa ao maior ticket. */
  largura: number;
  /** Diferença para o consolidado, em % (positivo = acima). Nulo sem consolidado. */
  vsConsolidado: number | null;
  variacaoTicket: number | null;
}

/** Ticket por unidade, do maior para o menor, com a distância para o consolidado. */
export function rankingDoTicket(linhas: LinhaParaGrafico[], consolidado: number | null): { barras: BarraDoTicket[]; marcaDoConsolidado: number | null } {
  const com = linhas.filter((l) => l.importado && l.ticket != null).sort((a, b) => b.ticket! - a.ticket!);
  const maior = com.length ? Math.max(...com.map((l) => l.ticket!), consolidado ?? 0) : 0;
  return {
    barras: com.map((l) => ({
      unitId: l.unitId, name: l.name, ticket: l.ticket!,
      largura: maior > 0 ? umaCasa((l.ticket! / maior) * 100) : 0,
      vsConsolidado: consolidado ? umaCasa(((l.ticket! - consolidado) / consolidado) * 100) : null,
      variacaoTicket: l.variacaoTicket,
    })),
    marcaDoConsolidado: consolidado && maior > 0 ? umaCasa((consolidado / maior) * 100) : null,
  };
}
