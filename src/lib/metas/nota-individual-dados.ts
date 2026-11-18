import { prisma } from '@/lib/db/prisma';
import { parseWeekdays } from '@/lib/manager-schedule';
import { diaEmBrasilia, diasDecorridos } from './pontuacao';
import type { FatoDoDia, FatosDaUnidade } from './nota-individual';

/**
 * NOTA INDIVIDUAL — a leitura (v1.215.0). Só LÊ: os mesmos registros que dão a
 * nota da unidade (checklists que entram na meta, lançamento de desperdício,
 * conferência de comandas, contagem do cofre, confirmação de comunicados),
 * agora abertos por DIA e por AUTOR, mais a Escala de gerentes do mês.
 */
function diasAte(yearMonth: string, ultimo: number): string[] {
  return Array.from({ length: Math.max(0, ultimo) }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, '0')}`);
}

/** Um dia devido por dia previsto; feito = houve lançamento; autor = quem lançou. */
function porCobertura(dias: string[], lancados: { dia: string; autor: string | null }[]): FatoDoDia[] {
  const autorDoDia = new Map<string, string | null>();
  for (const l of lancados) if (!autorDoDia.has(l.dia)) autorDoDia.set(l.dia, l.autor);
  return dias.map((dia) => {
    const feito = autorDoDia.has(dia);
    const autor = autorDoDia.get(dia);
    return { dia, devidos: 1, feitos: feito ? 1 : 0, porAutor: feito && autor ? { [autor]: 1 } : {} };
  });
}

export async function fatosDaUnidade(unitId: string, yearMonth: string): Promise<FatosDaUnidade> {
  const [y, m] = yearMonth.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const de = `${yearMonth}-01`;
  const ate = `${yearMonth}-${String(ultimoDia).padStart(2, '0')}`;
  const dec = diasDecorridos(yearMonth, diaEmBrasilia(new Date()));
  const decorridos = diasAte(yearMonth, dec);
  const prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const inicio = new Date(`${yearMonth}-01T03:00:00Z`);
  const fim = new Date(`${prox}-01T03:00:00Z`);
  const agora = new Date();
  const mesIni = new Date(Date.UTC(y, m - 1, 1));
  const mesFim = new Date(Date.UTC(y, m, 1));
  const vencidoAte = new Date(Math.min(mesFim.getTime(), agora.getTime()));

  const [gerentes, tarefas, desperdicio, comandas, cofre, temProg, temExc, lidos, naoLidos] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { in: ['MANAGER', 'COORDINATOR'] }, memberships: { some: { unitId } } },
      select: {
        id: true,
        managerWorkSchedule: { select: { weekdays: true } },
        managerLeaves: { where: { deletedAt: null, startDate: { lte: ate }, endDate: { gte: de } }, select: { startDate: true, endDate: true } },
      },
    }),
    prisma.taskInstance.groupBy({
      by: ['operationalDate', 'status', 'completedById'],
      where: { unitId, operationalDate: { startsWith: yearMonth }, status: { in: ['DONE', 'MISSED'] }, template: { entersMeta: true } },
      _count: { _all: true },
    }),
    prisma.wasteEntry.findMany({ where: { unitId, operationalDate: { startsWith: yearMonth } }, select: { operationalDate: true, createdById: true } }),
    prisma.commandCount.findMany({ where: { unitId, operationalDate: { startsWith: yearMonth } }, select: { operationalDate: true, createdById: true } }),
    prisma.cashVaultMovement.findMany({ where: { unitId, type: 'COUNT', createdAt: { gte: inicio, lt: fim } }, select: { createdAt: true, createdById: true }, orderBy: { createdAt: 'asc' } }),
    prisma.commandSchedule.count({ where: { unitId, active: true } }),
    prisma.commandScheduleException.count({ where: { unitId, date: { startsWith: yearMonth } } }),
    prisma.communicationRecipient.groupBy({ by: ['userId'], where: { unitId, status: 'CONFIRMED', late: false, communication: { dueAt: { gte: mesIni, lt: mesFim } } }, _count: { _all: true } }),
    prisma.communicationRecipient.groupBy({ by: ['userId'], where: { unitId, status: 'PENDING', communication: { dueAt: { gte: mesIni, lt: vencidoAte } } }, _count: { _all: true } }),
  ]);

  /* Checklists: cada instância resolvida vale igual, como na nota da unidade. */
  const porDiaDeTarefa = new Map<string, FatoDoDia>();
  for (const t of tarefas) {
    const f = porDiaDeTarefa.get(t.operationalDate) ?? { dia: t.operationalDate, feitos: 0, devidos: 0, porAutor: {} };
    f.devidos += t._count._all;
    if (t.status === 'DONE') {
      f.feitos += t._count._all;
      if (t.completedById) f.porAutor[t.completedById] = (f.porAutor[t.completedById] ?? 0) + t._count._all;
    }
    porDiaDeTarefa.set(t.operationalDate, f);
  }

  /* Comandas: com programação/exceção, só os dias previstos cobram (a mesma regra de getCommandsCoverage). */
  let diasDeComandas = decorridos;
  if (dec > 0 && (temProg > 0 || temExc > 0)) {
    const { diasDaRotina } = await import('@/lib/commands/painel');
    diasDeComandas = (await diasDaRotina(unitId, yearMonth, decorridos[decorridos.length - 1])).filter((d) => d.prevista).map((d) => d.data);
  }

  const pessoas: Record<string, { done: number; missed: number }> = {};
  for (const r of lidos) pessoas[r.userId] = { done: r._count._all, missed: 0 };
  for (const r of naoLidos) pessoas[r.userId] = { done: pessoas[r.userId]?.done ?? 0, missed: r._count._all };

  return {
    gerentes: gerentes.map((g) => ({ userId: g.id, weekdays: parseWeekdays(g.managerWorkSchedule?.weekdays), ausencias: g.managerLeaves })),
    porDia: {
      TASKS: [...porDiaDeTarefa.values()],
      WASTE: porCobertura(decorridos, desperdicio.map((w) => ({ dia: w.operationalDate, autor: w.createdById }))),
      COMMANDS: porCobertura(diasDeComandas, comandas.map((c) => ({ dia: c.operationalDate, autor: c.createdById }))),
      CASH: porCobertura(decorridos, cofre.map((c) => ({ dia: diaEmBrasilia(c.createdAt), autor: c.createdById }))),
    },
    porPessoa: { COMMUNICATION: pessoas },
  };
}
