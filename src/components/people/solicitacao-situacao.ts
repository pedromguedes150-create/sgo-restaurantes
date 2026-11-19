import type { StatusTone } from '@/components/ui/status-badge';
import { faixaDaSituacao, type Faixa, type LinhaDaSolicitacao } from '@/lib/rh/solicitacoes-regras';

export const TOM_DA_FAIXA: Record<Faixa, StatusTone> = { ANDAMENTO: 'medium', AGUARDANDO_RESPOSTA: 'critical', CONCLUIDA: 'success', CANCELADA: 'neutral' };

/**
 * O que o gerente lê na coluna Situação: o envio enquanto não chegou ao RH,
 * depois a situação que o RH devolve. Módulo sem "use client" de propósito: a
 * lista (cliente) e a página de detalhe (servidor) usam a mesma leitura.
 */
export function situacaoParaTela(l: Pick<LinhaDaSolicitacao, 'envio' | 'rhSituacao' | 'situacaoRotulo'>): { label: string; tone: StatusTone } {
  if (l.envio === 'COM_PROBLEMA') return { label: 'Envio em revisão pelo Administrador', tone: 'critical' };
  if (l.envio !== 'ENVIADO') return { label: 'Enviando ao RH', tone: 'neutral' };
  return { label: l.situacaoRotulo, tone: TOM_DA_FAIXA[faixaDaSituacao(l.rhSituacao)] };
}
