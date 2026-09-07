import { ABAS, acessoDasAbas as acessoGenerico, type AcessoAbas } from '@/lib/permissions/abas';

/**
 * As abas da Minha área. A lista mora no registro geral (`abas.ts`) desde a
 * v1.66.0 — aqui ficam só o atalho para ela e a regra de quem manda em cada
 * operação da rota `/api/manager-area`.
 */

export type AbaMinhaArea = 'tarefas' | 'notas' | 'folgas';
export const ABAS_MINHA_AREA = ABAS.MANAGER_AREA.map((a) => ({ id: a.id as AbaMinhaArea, modulo: a.key, label: a.label }));
export type { AcessoAbas };

/**
 * Quais partes da matriz precisam liberar "Editar" para a operação passar.
 * TODAS as da lista — é um "e", não um "ou".
 *
 * Tarefas e notas são do dono: a própria aba decide.
 *
 * Folga/férias e o horário semanal deixaram de ser. Quem manda na escala de
 * gerência é a Supervisão/Administração, e a autoridade de lançar mora no
 * módulo **Escala de gerentes**: a aba `MANAGER_AREA_LEAVES` continua decidindo
 * se o gerente VÊ a própria agenda, e `MANAGER_SCHEDULE / Editar` decide quem
 * pode ALTERÁ-LA. São duas perguntas diferentes, por isso duas linhas — para
 * devolver o lançamento ao gerente basta ligar o "Editar" da Escala de gerentes
 * no perfil dele.
 *
 * `workSchedule/set` é o bloco "Meu horário de trabalho", que mora dentro da
 * mesma aba: deixá-lo aberto seria uma porta lateral para o mesmo assunto.
 * `workSchedule/setForUser` é o Controle de gerentes — tem a própria guarda
 * (ADMIN/CEO) e não é aba daqui, por isso fica de fora.
 */
export function modulosDaOperacao(entity: string, action: string): string[] {
  if (entity === 'task') return ['MANAGER_AREA_TASKS'];
  if (entity === 'note') return ['MANAGER_AREA_NOTES'];
  if (entity === 'leave') return ['MANAGER_AREA_LEAVES', 'MANAGER_SCHEDULE'];
  if (entity === 'workSchedule' && action === 'set') return ['MANAGER_AREA_LEAVES', 'MANAGER_SCHEDULE'];
  return [];
}

/**
 * Traduz a matriz de permissões para as abas da Minha área.
 *
 * A aba de folgas passa pela MESMA conta da rota (`modulosDaOperacao`) — sem
 * isso a tela mostraria "Agendar" para o gerente e o servidor recusaria o
 * clique, que é o pior dos dois mundos.
 */
export function acessoDasAbas(perms: Record<string, { canView: boolean; canEdit: boolean } | undefined>): AcessoAbas {
  const abas = acessoGenerico(perms, 'MANAGER_AREA');
  const podeLancar = modulosDaOperacao('leave', 'add').every((m) => perms[m]?.canEdit);
  return { ...abas, folgas: { canView: abas.folgas.canView, canEdit: podeLancar } };
}
