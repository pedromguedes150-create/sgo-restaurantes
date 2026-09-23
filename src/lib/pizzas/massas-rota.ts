import type { ReasonMap } from '@/lib/api/reason';
import type { MotivoRecusaMassas } from '@/lib/pizzas/massas';

/**
 * O que as DUAS rotas de massas (link público e gestão) compartilham: o mapa
 * de recusas e o vocabulário de ações. Um mapa só, para o mesmo motivo nunca
 * virar duas mensagens diferentes conforme a porta.
 */

export const RECUSAS_MASSAS: ReasonMap & Record<MotivoRecusaMassas, { msg: string; status: number }> = {
  TOKEN: { msg: 'Link inválido ou desativado', status: 404 },
  FORBIDDEN: { msg: 'Sem permissão para esta unidade', status: 403 },
  NOT_FOUND: { msg: 'Lançamento não encontrado', status: 404 },
  DATA: { msg: 'Data inválida ou no futuro', status: 400 },
  DIA_FECHADO: { msg: 'Esse dia já fechou. Só o dia de hoje pode ser alterado por aqui — peça ao gerente para corrigir.', status: 403 },
  QUANTIDADE: { msg: 'Informe uma quantidade válida (número inteiro)', status: 400 },
  VALIDADE: { msg: 'Informe a data de validade', status: 400 },
  MOTIVO: { msg: 'Escolha o motivo do desperdício', status: 400 },
  LOTE: { msg: 'Lote não encontrado', status: 400 },
  SEM_JUSTIFICATIVA: { msg: 'O estoque não bateu. Escreva o que houve para fechar o dia.', status: 422 },
  SEM_MOTIVO_ALTERACAO: { msg: 'Alteração de dia anterior exige o motivo da alteração', status: 422 },
};

export const ACOES_MASSAS = [
  'recebimento', 'corrigirRecebimento', 'excluirRecebimento',
  'desperdicio', 'corrigirDesperdicio', 'excluirDesperdicio',
  'contagem',
] as const;

export type AcaoDeMassas = (typeof ACOES_MASSAS)[number];

export function acaoDeMassas(v: unknown): AcaoDeMassas | null {
  return typeof v === 'string' && (ACOES_MASSAS as readonly string[]).includes(v) ? (v as AcaoDeMassas) : null;
}
