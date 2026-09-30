/**
 * DESPESAS — retiradas do COFRE da unidade. A parte pura.
 *
 * REGRA FIXA: toda despesa deste módulo é dinheiro que saiu do COFRE. Não há
 * "origem" para escolher, nem aqui nem na tela nem na rota — o campo `source`
 * existe no banco só para rastreabilidade (`SAFE`, sempre) e para o dia em que
 * a operação, e não o sistema, decidir abrir outra origem. Oferecer "Caixa"
 * numa lista seria o SGO criando um procedimento que a operação não autoriza.
 *
 * Fluxo: retirada do cofre → despesa registrada (PENDENTE DE DEVOLUÇÃO) →
 * escritório vê → devolução registrada (DEVOLVIDA).
 */

export const ORIGEM_FIXA = 'SAFE' as const;

export const CATEGORIAS = [
  { value: 'MAINTENANCE', label: 'Manutenção' },
  { value: 'EMERGENCY_PURCHASE', label: 'Compra emergencial' },
  { value: 'FOOD', label: 'Alimentação' },
  { value: 'TRANSPORT', label: 'Transporte/Frete' },
  { value: 'MATERIAL', label: 'Material' },
  { value: 'OTHER', label: 'Outros' },
] as const;
export type CategoriaDespesa = (typeof CATEGORIAS)[number]['value'];
export const CATEGORIA_LABEL: Record<CategoriaDespesa, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label])) as Record<CategoriaDespesa, string>;
export const categoriaValida = (v: unknown): v is CategoriaDespesa => CATEGORIAS.some((c) => c.value === v);

export const STATUS = [
  { value: 'PENDING_REFUND', label: 'Pendente de devolução', tone: 'warning' },
  { value: 'REFUNDED', label: 'Devolvida', tone: 'success' },
  /* Preparado, sem tela: cancelar exigirá motivo e ficará no histórico. */
  { value: 'CANCELED', label: 'Cancelada', tone: 'neutral' },
] as const;
export type StatusDespesa = (typeof STATUS)[number]['value'];
export const STATUS_LABEL: Record<StatusDespesa, string> = Object.fromEntries(STATUS.map((s) => [s.value, s.label])) as Record<StatusDespesa, string>;
export const STATUS_TONE: Record<StatusDespesa, 'warning' | 'success' | 'neutral'> = Object.fromEntries(STATUS.map((s) => [s.value, s.tone])) as Record<StatusDespesa, 'warning' | 'success' | 'neutral'>;
export const statusValido = (v: unknown): v is StatusDespesa => STATUS.some((s) => s.value === v);

/** Teto de sanidade: acima disso é erro de digitação (centavos como reais), não despesa de cofre. */
export const VALOR_MAXIMO = 100000;
export const DESCRICAO_MAX = 200;

export interface DespesaResumivel { amount: number; status: StatusDespesa }

/**
 * Os três cartões da tela. "Total" é o que saiu do cofre (cancelada não conta —
 * não saiu); "Pendente" é o que ainda falta o escritório recompor.
 */
export function totais(lista: DespesaResumivel[]): { total: number; pendente: number; devolvido: number; qtdPendente: number; qtd: number } {
  const c = (n: number) => Math.round(n * 100) / 100;
  let total = 0, pendente = 0, devolvido = 0, qtdPendente = 0, qtd = 0;
  for (const d of lista) {
    if (d.status === 'CANCELED') continue;
    qtd++;
    total += d.amount;
    if (d.status === 'PENDING_REFUND') { pendente += d.amount; qtdPendente++; }
    if (d.status === 'REFUNDED') devolvido += d.amount;
  }
  return { total: c(total), pendente: c(pendente), devolvido: c(devolvido), qtdPendente, qtd };
}

/** Valor válido: número finito, positivo, até o teto, em centavos. */
export function valorValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= VALOR_MAXIMO;
}
