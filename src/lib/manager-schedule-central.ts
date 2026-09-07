/**
 * Escala de gerentes — a grade do mês e o lançamento central.
 *
 * O que existia antes: cada gerente cadastrava o próprio horário e lançava as
 * próprias folgas na Minha área, e a Supervisão apenas CONSULTAVA o consolidado.
 * Quem manda na escala de gerência é a Supervisão/Administração — então o
 * lançamento passou para cá e a Minha área virou consulta.
 *
 * Separado de `manager-schedule.ts` (que segue dono do horário próprio, do
 * calendário de cobertura e do alerta de 7 dias) porque são responsabilidades
 * diferentes: lá o usuário fala de si, aqui um terceiro fala pelo gerente — e é
 * essa a metade que precisa de escopo, auditoria e aviso ao dono da agenda.
 */

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { notifyUsers } from '@/lib/notifications';
import { parseWeekdays, daysOfMonth } from '@/lib/manager-schedule';
import type { SessionUser } from '@/lib/auth/session';
import type { CelulaDoGerente, LancamentoDeGerente, LinhaDaGrade, DiaDaGrade, GradeDeGerentes } from '@/lib/manager-schedule-tipos';

/* O vocabulário da grade mora em `manager-schedule-tipos.ts`, que não importa
   nada: é o que permite a TELA usar as siglas sem arrastar o prisma e o
   web-push para o bundle do navegador. Reexportado aqui para quem lê a grade
   no servidor continuar importando de um lugar só. */
export * from '@/lib/manager-schedule-tipos';

/** Unidades que o usuário pode abrir neste módulo. */
export async function unidadesDaEscalaDeGerentes(user: SessionUser) {
  return prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

/**
 * A grade do mês: uma linha por gerente da unidade, uma coluna por dia.
 *
 * Ordem de decisão da célula, e ela importa: **férias e folga lançadas vencem o
 * padrão semanal**. Se alguém está de férias num dia que o padrão diz que ele
 * trabalha, o dia é férias — o contrário faria a grade afirmar uma cobertura que
 * não existe, que é justamente o erro que deixa a unidade sem gerente sem
 * ninguém notar.
 *
 * Quem não tem horário cadastrado NÃO conta como cobertura: a linha inteira sai
 * como `SEM_HORARIO`. Chutar "trabalha de segunda a sábado" para ele encheria a
 * grade de presença inventada.
 */
export async function getGradeDeGerentes(
  user: SessionUser,
  unitId: string,
  year: number,
  month: number,
): Promise<GradeDeGerentes | null> {
  if (!canAccessUnit(user, unitId)) return null;
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, name: true } });
  if (!unit) return null;

  const dias = daysOfMonth(year, month);
  const monthStart = dias[0]?.iso ?? `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = dias[dias.length - 1]?.iso ?? monthStart;

  const gerentes = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ['MANAGER', 'COORDINATOR'] },
      memberships: { some: { unitId } },
    },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true,
      managerWorkSchedule: true,
      managerLeaves: {
        where: { startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
        orderBy: { startDate: 'asc' },
        select: { id: true, kind: true, startDate: true, endDate: true, note: true, createdById: true },
      },
    },
  });

  /* Quem lançou: um nome por id, numa consulta só. */
  const autores = [...new Set(
    gerentes.flatMap((g) => g.managerLeaves.map((l) => l.createdById)).filter((x): x is string => Boolean(x)),
  )];
  const nomeDoAutor = new Map<string, string>();
  if (autores.length > 0) {
    const us = await prisma.user.findMany({ where: { id: { in: autores } }, select: { id: true, name: true } });
    for (const u of us) nomeDoAutor.set(u.id, u.name);
  }

  const linhas: LinhaDaGrade[] = gerentes.map((g) => {
    const weekdays = parseWeekdays(g.managerWorkSchedule?.weekdays);
    const temHorario = Boolean(g.managerWorkSchedule) && weekdays.length > 0;
    const celulas = dias.map((d): CelulaDoGerente => {
      const leave = g.managerLeaves.find((l) => l.startDate <= d.iso && l.endDate >= d.iso);
      if (leave) return leave.kind === 'FERIAS' ? 'FERIAS' : 'FOLGA';
      if (!temHorario) return 'SEM_HORARIO';
      return weekdays.includes(d.weekday) ? 'TRABALHA' : 'FORA_DO_PADRAO';
    });
    return {
      userId: g.id,
      name: g.name,
      temHorario,
      weekdays,
      startTime: g.managerWorkSchedule?.startTime ?? null,
      endTime: g.managerWorkSchedule?.endTime ?? null,
      note: g.managerWorkSchedule?.note ?? null,
      dias: celulas,
      diasTrabalhados: celulas.filter((c) => c === 'TRABALHA').length,
      diasDeFolga: celulas.filter((c) => c === 'FOLGA').length,
      diasDeFerias: celulas.filter((c) => c === 'FERIAS').length,
    };
  });

  const algumComHorario = linhas.some((l) => l.temHorario);
  const diasOut: DiaDaGrade[] = dias.map((d, i) => ({
    day: d.day,
    weekday: d.weekday,
    iso: d.iso,
    /* Só acusa buraco quando existe ao menos um horário cadastrado: numa unidade
       em que ninguém preencheu o horário o mês inteiro sairia vermelho, e o
       alerta que aparece sempre deixa de ser lido. */
    semGerente: algumComHorario && !linhas.some((l) => l.dias[i] === 'TRABALHA'),
  }));

  const lancamentos: LancamentoDeGerente[] = gerentes
    .flatMap((g) => g.managerLeaves.map((l) => ({
      id: l.id,
      userId: g.id,
      managerName: g.name,
      kind: l.kind as 'FOLGA' | 'FERIAS',
      startDate: l.startDate,
      endDate: l.endDate,
      note: l.note,
      lancadoPor: l.createdById ? nomeDoAutor.get(l.createdById) ?? null : null,
    })))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.managerName.localeCompare(b.managerName, 'pt-BR'));

  return {
    unitId: unit.id,
    unitName: unit.name,
    year, month,
    dias: diasOut,
    linhas,
    lancamentos,
    diasSemGerente: diasOut.filter((d) => d.semGerente).length,
    semHorarioCount: linhas.filter((l) => !l.temHorario).length,
  };
}

/**
 * O gerente-alvo está numa unidade que o autor enxerga?
 *
 * Sem esta checagem a Supervisão de uma região poderia lançar férias para o
 * gerente de outra: a rota confere o perfil, e perfil não é escopo.
 */
async function alvoNoEscopo(actor: SessionUser, targetUserId: string): Promise<{ id: string; name: string } | null> {
  if (!targetUserId) return null;
  return prisma.user.findFirst({
    where: {
      id: targetUserId,
      role: { in: ['MANAGER', 'COORDINATOR'] },
      memberships: { some: { ...unitScopeWhere(actor, 'unitId') } },
    },
    select: { id: true, name: true },
  });
}

const fmtBR = (iso: string) => iso.split('-').reverse().join('/');

/** Grava o horário semanal de um gerente. Quem lança é a Supervisão/Admin. */
export async function definirHorarioDoGerente(
  actor: SessionUser,
  targetUserId: string,
  input: { weekdays: number[]; startTime?: string | null; endTime?: string | null; note?: string | null },
) {
  const alvo = await alvoNoEscopo(actor, targetUserId);
  if (!alvo) return { ok: false as const, reason: 'FORBIDDEN' as const };

  const weekdays = parseWeekdays(input.weekdays);
  const time = (t?: string | null) => (t && /^\d{2}:\d{2}$/.test(t) ? t : null);
  const data = { weekdays, startTime: time(input.startTime), endTime: time(input.endTime), note: input.note?.trim() || null };
  await prisma.managerWorkSchedule.upsert({
    where: { userId: alvo.id },
    create: { userId: alvo.id, ...data },
    update: data,
  });

  const { audit } = await import('@/lib/audit');
  await audit({
    userId: actor.id, action: 'MANAGER_SCHEDULE_SET', module: 'PEOPLE',
    entity: 'manager_work_schedule', entityId: alvo.id,
    metadata: { manager: alvo.name, weekdays, startTime: data.startTime, endTime: data.endTime },
  });
  return { ok: true as const };
}

/** Lança folga ou férias PARA um gerente e avisa o próprio. */
export async function lancarFolgaDoGerente(
  actor: SessionUser,
  targetUserId: string,
  input: { kind: string; startDate: string; endDate: string; note?: string },
) {
  const alvo = await alvoNoEscopo(actor, targetUserId);
  if (!alvo) return { ok: false as const, reason: 'FORBIDDEN' as const };

  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(input.startDate) || !re.test(input.endDate) || input.endDate < input.startDate) {
    return { ok: false as const, reason: 'INVALID' as const };
  }
  const kind = input.kind === 'FERIAS' ? 'FERIAS' : 'FOLGA';

  /* Período que encosta em outro do mesmo gerente é quase sempre erro de
     digitação — e a sobreposição calaria um dos dois na grade sem avisar. */
  const conflito = await prisma.managerLeave.findFirst({
    where: { userId: alvo.id, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } },
    select: { id: true },
  });
  if (conflito) return { ok: false as const, reason: 'OVERLAP' as const };

  const l = await prisma.managerLeave.create({
    data: {
      userId: alvo.id, kind, startDate: input.startDate, endDate: input.endDate,
      note: input.note?.trim() || null, createdById: actor.id,
    },
  });

  const { audit } = await import('@/lib/audit');
  await audit({
    userId: actor.id, action: 'MANAGER_LEAVE_ADD', module: 'PEOPLE',
    entity: 'manager_leave', entityId: l.id,
    metadata: { manager: alvo.name, kind, startDate: input.startDate, endDate: input.endDate },
  });

  /* O gerente precisa saber: é a agenda dele que mudou, e ele não pode mais
     lançar sozinho para conferir. */
  await notifyUsers([alvo.id], {
    title: kind === 'FERIAS' ? '🌴 Férias lançadas para você' : '📅 Folga lançada para você',
    body: input.startDate === input.endDate
      ? `Dia ${fmtBR(input.startDate)}, lançado por ${actor.name}.`
      : `De ${fmtBR(input.startDate)} a ${fmtBR(input.endDate)}, lançado por ${actor.name}.`,
    link: '/minha-area',
    module: 'PEOPLE',
  }).catch(() => {});

  return { ok: true as const, id: l.id };
}

/** Apaga um lançamento de folga/férias de gerente. */
export async function apagarFolgaDoGerente(actor: SessionUser, id: string) {
  const l = await prisma.managerLeave.findUnique({
    where: { id },
    select: { id: true, userId: true, kind: true, startDate: true, endDate: true },
  });
  if (!l) return { ok: false as const, reason: 'INVALID' as const };
  const alvo = await alvoNoEscopo(actor, l.userId);
  if (!alvo) return { ok: false as const, reason: 'FORBIDDEN' as const };

  await prisma.managerLeave.delete({ where: { id } });
  const { audit } = await import('@/lib/audit');
  await audit({
    userId: actor.id, action: 'MANAGER_LEAVE_DELETE', module: 'PEOPLE',
    entity: 'manager_leave', entityId: id,
    metadata: { manager: alvo.name, kind: l.kind, startDate: l.startDate, endDate: l.endDate },
  });
  return { ok: true as const };
}
