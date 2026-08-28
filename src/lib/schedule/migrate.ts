import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { diaAnterior, soData } from './vigencia';
import { inferirCicloDoLegado, ancoraDo12x36, type TipoLegado } from './legacy';
import type { SessionUser } from '@/lib/auth/session';

export interface ResultadoDaMigracao {
  migradas: number;
  /** Escalas cujo Planejado passa a sair diferente (os 12x36). */
  corrigidas: number;
  /** Não traduzidas — a máscara não é "trabalha X, folga Y". */
  puladas: { colaborador: string; motivo: string }[];
  /** Tipos de escala criados por não existir um com aquele ciclo. */
  tiposCriados: string[];
}

/** O tipo com aquele ciclo, criando um se não houver. */
async function tipoDoCiclo(workDays: number, offDays: number, criados: string[]): Promise<string> {
  const existente = await prisma.scheduleTemplate.findFirst({
    where: { workDays, offDays, active: true },
    orderBy: { order: 'asc' },
  });
  if (existente) return existente.id;

  const nome = `${workDays}x${offDays}`;
  /* Pode haver um inativo com o mesmo nome: reaproveita em vez de esbarrar no
     nome único e abortar a migração inteira. */
  const porNome = await prisma.scheduleTemplate.findFirst({ where: { name: nome } });
  if (porNome) {
    await prisma.scheduleTemplate.update({ where: { id: porNome.id }, data: { active: true } });
    return porNome.id;
  }

  const ultimo = await prisma.scheduleTemplate.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
  const novo = await prisma.scheduleTemplate.create({
    data: { name: nome, workDays, offDays, order: (ultimo?.order ?? -1) + 1 },
    select: { id: true, name: true },
  });
  criados.push(novo.name);
  return novo.id;
}

/**
 * Traz as escalas antigas para o gerador novo — **preservando o passado**.
 *
 * A escala legada é fechada na véspera da data de corte e uma vigência nova
 * abre a partir dela. Reescrever a vigência inteira também "funcionaria", mas
 * mudaria o Planejado de meses que a operação já conferiu — e para o 12x36 essa
 * mudança seria grande. Corrigir daqui para frente é o que se pode fazer sem
 * mexer no que já foi olhado.
 *
 * Para 6x1 e 5x2 nada muda visualmente: o dia da folga é deduzido da âncora que
 * a escala já usava. O 12x36 é o caso em que a mudança É o objetivo.
 */
export async function migrarEscalasLegadas(
  user: SessionUser,
  input: { unitId?: string; aPartirDe: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ ok: true; resultado: ResultadoDaMigracao } | { ok: false; reason: 'FORBIDDEN' | 'INVALID'; message?: string }> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.aPartirDe ?? '')) {
    return { ok: false, reason: 'INVALID', message: 'Informe a partir de quando o formato novo passa a valer.' };
  }
  const [y, m, d] = input.aPartirDe.split('-').map(Number);
  const corte = new Date(Date.UTC(y, m - 1, d));

  const legadas = await prisma.employeeSchedule.findMany({
    where: { templateId: null, endDate: null, active: true, ...(input.unitId ? { unitId: input.unitId } : {}) },
    include: { collaborator: { select: { name: true } } },
  });

  const res: ResultadoDaMigracao = { migradas: 0, corrigidas: 0, puladas: [], tiposCriados: [] };

  for (const v of legadas) {
    const inf = inferirCicloDoLegado(v.scheduleType as TipoLegado, v.customMask, v.anchorDate);
    if (!inf) {
      res.puladas.push({
        colaborador: v.collaborator?.name ?? v.collaboratorId,
        motivo: 'o padrão personalizado não é "trabalha X, folga Y" — precisa ser refeito à mão',
      });
      continue;
    }

    /* A vigência legada começa DEPOIS do corte? Então não há passado a
       preservar: ela ainda nem valeu, e migrar por cima é o certo. */
    const comecaDepois = soData(v.startDate) >= soData(corte);

    const templateId = await tipoDoCiclo(inf.workDays, inf.offDays, res.tiposCriados);
    const doze = v.scheduleType === 'TWELVE36_ODD' || v.scheduleType === 'TWELVE36_EVEN';
    const ancora = doze
      ? ancoraDo12x36(v.scheduleType as 'TWELVE36_ODD' | 'TWELVE36_EVEN', comecaDepois ? v.startDate : corte)
      : v.anchorDate;

    const dados = {
      templateId,
      weeklyOffDay: inf.weeklyOffDay,
      offMode: (inf.weeklyOffDay === null ? 'CYCLE_ONLY' : 'FIXED_WEEKLY') as 'CYCLE_ONLY' | 'FIXED_WEEKLY',
      sundayEveryWeeks: null,
      anchorDate: ancora,
    };

    await prisma.$transaction(async (tx) => {
      if (comecaDepois) {
        await tx.employeeSchedule.update({ where: { id: v.id }, data: dados });
        return;
      }
      /* Fecha a legada na véspera e abre a nova a partir do corte. */
      await tx.employeeSchedule.update({ where: { id: v.id }, data: { endDate: diaAnterior(corte) } });
      await tx.employeeSchedule.create({
        data: {
          collaboratorId: v.collaboratorId,
          unitId: v.unitId,
          scheduleType: v.scheduleType,
          customMask: v.customMask,
          shiftId: v.shiftId,
          startTime: v.startTime,
          breakTime: v.breakTime,
          endTime: v.endTime,
          startDate: corte,
          endDate: null,
          active: true,
          ...dados,
        },
      });
    });

    res.migradas++;
    if (!inf.mesmoResultado) res.corrigidas++;
  }

  await audit({
    userId: user.id, unitId: input.unitId, action: 'SCHEDULE_MIGRATE_LEGACY', module: 'SCHEDULE',
    entity: 'employee_schedule', metadata: { ...res, aPartirDe: input.aPartirDe }, ...ctx,
  });

  return { ok: true, resultado: res };
}

/** Quantas escalas ainda estão no formato antigo (para a tela avisar). */
export async function contarEscalasLegadas(unitId?: string): Promise<number> {
  return prisma.employeeSchedule.count({
    where: { templateId: null, endDate: null, active: true, ...(unitId ? { unitId } : {}) },
  });
}
