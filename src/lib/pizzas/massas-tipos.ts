/**
 * Vocabulário do Controle de Massas — módulo PURO.
 *
 * O link público ('use client'), a rota e o painel de servidor leem daqui.
 * Nada de prisma/notifications: alcançar módulo de servidor a partir do
 * cliente quebra o `next build` (guard check-client-imports).
 */

import { FORMATO_DATA } from '@/lib/pizzas/tipos';

export { FORMATO_DATA };

/** Os motivos de desperdício, na ordem em que aparecem no botão. */
export const MOTIVOS_DESPERDICIO = [
  { valor: 'EXPIRED', rotulo: 'Massa vencida' },
  { valor: 'BURNED', rotulo: 'Pizza queimada' },
  { valor: 'WRONG_INGREDIENT', rotulo: 'Ingrediente errado' },
  { valor: 'DAMAGED', rotulo: 'Massa danificada' },
  { valor: 'PRODUCTION_ERROR', rotulo: 'Erro de produção' },
  { valor: 'OTHER', rotulo: 'Outro' },
] as const;

export type MotivoDesperdicio = (typeof MOTIVOS_DESPERDICIO)[number]['valor'];

const ROTULO_MOTIVO: Record<MotivoDesperdicio, string> = Object.fromEntries(
  MOTIVOS_DESPERDICIO.map((m) => [m.valor, m.rotulo]),
) as Record<MotivoDesperdicio, string>;

export function rotuloDoMotivo(m: MotivoDesperdicio): string {
  return ROTULO_MOTIVO[m];
}

export function ehMotivo(v: unknown): v is MotivoDesperdicio {
  return typeof v === 'string' && v in ROTULO_MOTIVO;
}

/**
 * PERDA POR VALIDADE × PERDA DE PRODUÇÃO — a separação que o relatório mostra.
 * Só a massa vencida é validade; tudo o mais é produção (a pizza queimada não
 * chegou a virar venda, mas a massa dela saiu da câmara).
 */
export type TipoDePerda = 'VALIDADE' | 'PRODUCAO';

export function tipoDePerda(m: MotivoDesperdicio): TipoDePerda {
  return m === 'EXPIRED' ? 'VALIDADE' : 'PRODUCAO';
}

/** Quantidade de massas: inteiro POSITIVO até 10.000 (zero não é lançamento). */
export function quantidadeDeMassas(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10_000;
}

/** Contagem física: aceita ZERO — câmara vazia é uma contagem legítima. */
export function contagemValida(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000;
}

/** Dias entre `hoje` e a validade ('YYYY-MM-DD' nas duas). Negativo = vencido. */
export function diasRestantes(hoje: string, validade: string): number {
  const a = Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10));
  const b = Date.UTC(+validade.slice(0, 4), +validade.slice(5, 7) - 1, +validade.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Faixa de alerta da validade. A janela é fixa de propósito: "vence em breve"
 * tem de querer dizer o mesmo em qualquer dia.
 */
export const DIAS_ALERTA_VALIDADE = 2;

export type FaixaDeValidade = 'VENCIDO' | 'VENCE_HOJE' | 'PROXIMO' | 'OK';

export function faixaDeValidade(dias: number): FaixaDeValidade {
  if (dias < 0) return 'VENCIDO';
  if (dias === 0) return 'VENCE_HOJE';
  if (dias <= DIAS_ALERTA_VALIDADE) return 'PROXIMO';
  return 'OK';
}

export function rotuloDaFaixa(f: FaixaDeValidade, dias: number): string {
  switch (f) {
    case 'VENCIDO': return dias === -1 ? 'Venceu ontem' : `Venceu há ${-dias} dias`;
    case 'VENCE_HOJE': return 'Vence hoje';
    case 'PROXIMO': return dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`;
    default: return `${dias} dias`;
  }
}

/** Situação do fechamento de estoque de um dia. */
export type SituacaoDoDia = 'SEM_CONTAGEM' | 'CONFERIDO' | 'DIVERGENTE' | 'RETROATIVO';

export const ROTULO_SITUACAO: Record<SituacaoDoDia, string> = {
  SEM_CONTAGEM: 'Sem fechamento',
  CONFERIDO: 'Estoque conferido',
  DIVERGENTE: 'Divergência de estoque',
  RETROATIVO: 'Divergência gerada por alteração retroativa',
};

/** Tamanho máximo dos textos livres (motivo da alteração, justificativa, observação). */
export const MAX_TEXTO = 500;

export function textoLimpo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, MAX_TEXTO);
  return t.length ? t : null;
}
