import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { parseWeekdays } from '@/lib/manager-schedule';
import type { SessionUser } from '@/lib/auth/session';
import type { GerenteCru } from '@/lib/controle-gerentes';

/**
 * Controle de gerentes — leitura do banco. Os cálculos moram no núcleo puro
 * (`controle-gerentes.ts`); aqui só se busca, e SEMPRE por unidade.
 *
 * Usa os registros de sempre: `ManagerLeave` (folga/férias) e
 * `ManagerWorkSchedule` (padrão semanal). Nenhuma tabela nova, nenhuma regra
 * nova — o lançamento continua na Escala de gerentes.
 */

/**
 * "Hoje" no fuso da operação. O servidor roda em UTC: depois das 21h de Brasília
 * `new Date().toISOString()` já estaria no dia seguinte, e "quem folga hoje"
 * responderia sobre amanhã.
 */
export function hojeNaOperacao(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Unidades que o usuário pode abrir neste controle. */
export async function unidadesDoControle(user: SessionUser) {
  return prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

/**
 * Os gerentes de CADA unidade pedida, com as ausências que tocam [de, ate].
 *
 * Um gerente vinculado a duas unidades aparece nas duas — é gerente das duas —,
 * mas cada lista é montada a partir do vínculo com AQUELA unidade: nunca há uma
 * lista "da rede" com todos misturados.
 */
export async function gerentesPorUnidade(unitIds: string[], de: string, ate: string): Promise<Map<string, GerenteCru[]>> {
  const out = new Map<string, GerenteCru[]>(unitIds.map((id) => [id, []]));
  if (unitIds.length === 0) return out;

  const usuarios = await prisma.user.findMany({
    where: { active: true, role: { in: ['MANAGER', 'COORDINATOR'] }, memberships: { some: { unitId: { in: unitIds } } } },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true,
      memberships: { where: { unitId: { in: unitIds } }, select: { unitId: true } },
      managerWorkSchedule: { select: { weekdays: true, startTime: true, endTime: true } },
      managerLeaves: {
        where: { startDate: { lte: ate }, endDate: { gte: de } },
        orderBy: { startDate: 'asc' },
        select: { kind: true, startDate: true, endDate: true, note: true },
      },
    },
  });

  for (const u of usuarios) {
    const g: GerenteCru = {
      userId: u.id,
      name: u.name,
      weekdays: u.managerWorkSchedule ? parseWeekdays(u.managerWorkSchedule.weekdays) : [],
      startTime: u.managerWorkSchedule?.startTime ?? null,
      endTime: u.managerWorkSchedule?.endTime ?? null,
      ausencias: u.managerLeaves.map((l) => ({ kind: l.kind === 'FERIAS' ? 'FERIAS' : 'FOLGA', startDate: l.startDate, endDate: l.endDate, note: l.note })),
    };
    for (const m of u.memberships) out.get(m.unitId)?.push(g);
  }
  return out;
}
