import { ABAS, acessoDasAbas as acessoGenerico, type AcessoAbas } from '@/lib/permissions/abas';

/**
 * As abas da Minha área. A lista mora no registro geral (`abas.ts`) desde a
 * v1.66.0 — aqui ficam só o atalho para ela e a regra de qual aba manda em cada
 * operação da rota `/api/manager-area`.
 */

export type AbaMinhaArea = 'tarefas' | 'notas' | 'folgas';
export const ABAS_MINHA_AREA = ABAS.MANAGER_AREA.map((a) => ({ id: a.id as AbaMinhaArea, modulo: a.key, label: a.label }));
export type { AcessoAbas };

/** Traduz a matriz de permissões para as abas. */
export function acessoDasAbas(perms: Record<string, { canView: boolean; canEdit: boolean } | undefined>): AcessoAbas {
  return acessoGenerico(perms, 'MANAGER_AREA');
}

/**
 * Qual aba manda em cada operação de `/api/manager-area`.
 *
 * `workSchedule/set` é o bloco "Meu horário de trabalho", que mora DENTRO da
 * aba de folgas: fechar a aba e deixar a gravação do horário aberta deixaria
 * uma porta lateral para o mesmo assunto. Já `workSchedule/setForUser` é o
 * Controle de gerentes — ele tem a própria guarda (ADMIN/CEO) e não é aba
 * daqui, por isso fica de fora.
 */
export function moduloDaOperacao(entity: string, action: string): string | null {
  if (entity === 'task') return 'MANAGER_AREA_TASKS';
  if (entity === 'note') return 'MANAGER_AREA_NOTES';
  if (entity === 'leave') return 'MANAGER_AREA_LEAVES';
  if (entity === 'workSchedule' && action === 'set') return 'MANAGER_AREA_LEAVES';
  return null;
}
