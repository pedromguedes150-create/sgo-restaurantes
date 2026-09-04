import type { Perm } from '@/lib/permissions';

/**
 * As abas da Minha área como SUBMENUS da matriz de perfis.
 *
 * Esta é a regra única, lida pela tela e pelo servidor. Se cada lado tivesse a
 * sua, a aba poderia sumir na tela e continuar aceitando gravação pela rota —
 * ou o contrário, o que é pior: o botão aparece e o servidor recusa.
 */

export type AbaMinhaArea = 'tarefas' | 'notas' | 'folgas';

export const ABAS_MINHA_AREA: { id: AbaMinhaArea; modulo: string; label: string }[] = [
  { id: 'tarefas', modulo: 'MANAGER_AREA_TASKS', label: 'Minhas tarefas' },
  { id: 'notas', modulo: 'MANAGER_AREA_NOTES', label: 'Bloco de notas' },
  { id: 'folgas', modulo: 'MANAGER_AREA_LEAVES', label: 'Folgas / férias' },
];

/** O que a tela recebe: por aba, se aparece e se aceita escrever. */
export type AcessoAbas = Record<AbaMinhaArea, Perm>;

const LIBERADO: Perm = { canView: true, canEdit: true };

/** Traduz a matriz de permissões para as abas. */
export function acessoDasAbas(perms: Record<string, Perm | undefined>): AcessoAbas {
  const out = {} as AcessoAbas;
  for (const a of ABAS_MINHA_AREA) out[a.id] = perms[a.modulo] ?? LIBERADO;
  return out;
}

/**
 * Qual submenu manda em cada operação de `/api/manager-area`.
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
