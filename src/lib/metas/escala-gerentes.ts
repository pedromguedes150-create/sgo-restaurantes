import { prisma } from '@/lib/db/prisma';
import { daysOfMonth } from '@/lib/manager-schedule';

/**
 * Indicador da META "Escala de gerentes — folgas do mês cadastradas" (v1.170.0).
 *
 * Pedido do Pedro: "gerente que não tiver com as folgas já cadastrada no
 * sistema irá descontar 5%". Conta, por unidade, quantos gerentes/coordenadores
 * ativos NÃO têm nenhuma folga nem férias (ativa, não excluída) tocando o mês.
 * A lista de nomes vai para o detalhamento: desconto sem nome é desconto que
 * ninguém consegue corrigir.
 */
export interface ManagerLeaveMetaStats {
  gerentes: number;
  semFolga: number;
  nomesSemFolga: string[];
  /** v1.214.0 — os mesmos, por id: é por aqui que o desconto vira individual na nota da pessoa. */
  idsSemFolga: string[];
}

export async function getManagerLeaveMetaStats(unitId: string, yearMonth: string): Promise<ManagerLeaveMetaStats> {
  const [y, m] = yearMonth.split('-').map(Number);
  const dias = daysOfMonth(y, m);
  if (dias.length === 0) return { gerentes: 0, semFolga: 0, nomesSemFolga: [], idsSemFolga: [] };
  const de = dias[0].iso;
  const ate = dias[dias.length - 1].iso;

  const gerentes = await prisma.user.findMany({
    where: { active: true, role: { in: ['MANAGER', 'COORDINATOR'] }, memberships: { some: { unitId } } },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      managerLeaves: { where: { deletedAt: null, startDate: { lte: ate }, endDate: { gte: de } }, select: { id: true }, take: 1 },
    },
  });
  const sem = gerentes.filter((g) => g.managerLeaves.length === 0);
  const nomesSemFolga = sem.map((g) => g.name);
  return { gerentes: gerentes.length, semFolga: nomesSemFolga.length, nomesSemFolga, idsSemFolga: sem.map((g) => g.id) };
}
