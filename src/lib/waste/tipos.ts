/**
 * Os tipos de desperdício da rede — a lista fechada, e os totais que ela forma.
 *
 * Até a v1.79.0 as categorias eram livres: cada unidade cadastrava as suas em
 * Configurações. O efeito é que **não havia consolidado possível** — somar
 * "Salão" de uma unidade com "Buffet almoço" de outra é somar coisas que
 * ninguém garantiu serem iguais. O pedido do Alan fecha a lista para que a
 * comparação entre unidades signifique alguma coisa.
 *
 * Este arquivo é a ÚNICA fonte: a folha de lançamento, o painel consolidado e o
 * dashboard leem daqui. O `code` é o que viaja para o banco e **não pode mudar**
 * — é por ele que os lançamentos antigos continuam encontrando o seu tipo.
 */

export type GrupoDeDesperdicio = 'SOBRA_LIMPA' | 'SOBRA_PRODUCAO';
export type TurnoDoDesperdicio = 'ALMOCO' | 'JANTAR';

export interface TipoDeDesperdicio {
  code: string;
  name: string;
  grupo: GrupoDeDesperdicio;
  turno: TurnoDoDesperdicio;
  /** Ordem na folha e nas colunas do consolidado. */
  order: number;
}

/**
 * Os seis, na ordem em que o Alan os escreveu. Desde a v1.121.0 (pedido do
 * Pedro) a FOLHA mostra só quatro — "Refeitório" foi INATIVADO no banco, não
 * apagado: os lançamentos antigos continuam contando aqui e no consolidado, e
 * os dois códigos ficam na lista para o histórico seguir encontrando o tipo.
 */
export const TIPOS_DE_DESPERDICIO: TipoDeDesperdicio[] = [
  { code: 'SS_ALMOCO', name: 'Sobra Limpa (Self-Service) — Almoço', grupo: 'SOBRA_LIMPA', turno: 'ALMOCO', order: 10 },
  { code: 'SS_JANTAR', name: 'Sobra Limpa (Self-Service) — Jantar', grupo: 'SOBRA_LIMPA', turno: 'JANTAR', order: 20 },
  { code: 'REF_ALMOCO', name: 'Refeitório almoço (histórico)', grupo: 'SOBRA_LIMPA', turno: 'ALMOCO', order: 30 },
  { code: 'REF_JANTAR', name: 'Refeitório jantar (histórico)', grupo: 'SOBRA_LIMPA', turno: 'JANTAR', order: 40 },
  { code: 'PROD_ALMOCO', name: 'Sobra de Produção — Almoço', grupo: 'SOBRA_PRODUCAO', turno: 'ALMOCO', order: 50 },
  { code: 'PROD_JANTAR', name: 'Sobra de Produção — Jantar', grupo: 'SOBRA_PRODUCAO', turno: 'JANTAR', order: 60 },
];

/** Rótulo do turno para agrupar a folha (Almoço em cima, Jantar embaixo). */
export const TURNO_LABEL: Record<TurnoDoDesperdicio, string> = { ALMOCO: 'Almoço', JANTAR: 'Jantar' };

export interface GrupoDef {
  id: GrupoDeDesperdicio;
  /** O rótulo do subtotal, como a rede chama. */
  label: string;
  codes: string[];
}

export const GRUPOS: GrupoDef[] = [
  { id: 'SOBRA_LIMPA', label: 'Total Sobra Limpa (kg)', codes: ['SS_ALMOCO', 'SS_JANTAR', 'REF_ALMOCO', 'REF_JANTAR'] },
  { id: 'SOBRA_PRODUCAO', label: 'Total Sobra de Produção (kg)', codes: ['PROD_ALMOCO', 'PROD_JANTAR'] },
];

export const LABEL_TOTAL_GERAL = 'Total Geral do dia (kg)';
/** O mesmo total, sem "do dia" — para o cartão do mês no consolidado. */
export const LABEL_TOTAL_GERAL_MES = 'Total Geral (kg)';

const POR_CODIGO = new Map(TIPOS_DE_DESPERDICIO.map((t) => [t.code, t]));

export function tipoPorCodigo(code: string): TipoDeDesperdicio | null {
  return POR_CODIGO.get(code) ?? null;
}

/** Um código é um dos seis fixos? Lançamento em categoria antiga não entra nos totais. */
export function ehTipoFixo(code: string): boolean {
  return POR_CODIGO.has(code);
}

export interface TotaisDoDia {
  /** Peso de cada um dos seis, por código. Faltando = 0. */
  porCodigo: Record<string, number>;
  sobraLimpa: number;
  sobraProducao: number;
  geral: number;
}

/**
 * Os três totais a partir dos pesos lançados.
 *
 * O total geral é a soma dos DOIS grupos, e não a soma de tudo que veio no
 * lançamento: se sobrar uma categoria antiga no meio (unidade que lançou antes
 * da virada), ela não pode inflar o número que a rede compara.
 */
export function totaisDoDia(porCodigoBruto: Record<string, number>): TotaisDoDia {
  const porCodigo: Record<string, number> = {};
  for (const t of TIPOS_DE_DESPERDICIO) porCodigo[t.code] = Number(porCodigoBruto[t.code] ?? 0) || 0;

  const soma = (codes: string[]) => codes.reduce((acc, c) => acc + (porCodigo[c] ?? 0), 0);
  const sobraLimpa = soma(GRUPOS[0].codes);
  const sobraProducao = soma(GRUPOS[1].codes);

  return { porCodigo, sobraLimpa, sobraProducao, geral: sobraLimpa + sobraProducao };
}

/**
 * Variação percentual entre dois períodos.
 *
 * `null` quando não há base de comparação (período anterior zerado): dizer
 * "+100%" ou "+∞" a partir do zero é inventar uma tendência que o dado não
 * sustenta — e num painel de desperdício isso vira cobrança em cima de número
 * que não existe.
 */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / anterior) * 100;
}
