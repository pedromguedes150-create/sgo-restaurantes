import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { canEditModule } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { vigenciaNaData } from './vigencia';
import { planejadoDoDia } from './planned';
import { plannedStatus } from '@/lib/schedule';
import type { SessionUser } from '@/lib/auth/session';
import type { DayStatus } from '@prisma/client';

/**
 * "Preencher automaticamente" — materializa o PLANEJADO do mês.
 *
 * Até aqui o Planejado era calculado a cada visita a partir da configuração de
 * cada colaborador. Isso tem uma consequência que só aparece meses depois:
 * mudar a folga de alguém hoje mudava a cara de um mês já encerrado (a vigência
 * protege parte disso, mas não o mês em que a mudança cai). Congelar resolve —
 * e é o modelo do SGO dos postos, onde a grade do mês nasce de um botão.
 *
 * O congelamento vive em `SchedulePlanOverride` (um dia por linha), que a grade
 * JÁ prefere ao calculado. Não precisou de tabela nova para a grade: só do
 * registro de quem preencheu e quando, para a tela saber dizer de onde veio.
 *
 * Apertar de novo REGENERA o mês a partir da configuração atual — é o conserto
 * de quem arrumou o cadastro depois. Por isso o resultado diz quantos entraram
 * e quem ficou de fora: preencher e não avisar que 12 pessoas não têm escala
 * seria o mesmo que não preencher.
 */

export interface ResumoDoPreenchimento {
  preenchidos: number;
  /** Nomes de quem ficou de fora por não ter escala cadastrada. */
  semConfiguracao: string[];
  dias: number;
  /** Primeira vez que este mês é preenchido nesta unidade. */
  primeiraVez: boolean;
}

export type PreenchimentoResult =
  | { ok: true; resumo: ResumoDoPreenchimento }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

function diaUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}
function diasNoMes(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export async function materializarPlanejado(
  user: SessionUser,
  input: { unitId: string; year: number; month: number },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<PreenchimentoResult> {
  const { unitId } = input;
  const year = Number(input.year);
  const month = Number(input.month);
  if (!unitId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, reason: 'INVALID' };
  }
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  /* Congelar o mês é ato de gestão da aba Planejado — quem só consulta a escala
     não materializa nada. */
  if (!(await canEditModule(user.role, 'SCHEDULE_TAB_PLANNED'))) return { ok: false, reason: 'FORBIDDEN' };

  const total = diasNoMes(year, month);
  const primeiro = diaUTC(year, month, 1);
  const ultimo = diaUTC(year, month, total);

  const [collabs, versoes] = await Promise.all([
    prisma.collaborator.findMany({
      where: { active: true, units: { some: { unitId } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.employeeSchedule.findMany({
      where: { unitId, active: true },
      orderBy: { startDate: 'asc' },
      include: { template: true, shift: true },
    }),
  ]);

  const porColab = new Map<string, typeof versoes>();
  for (const v of versoes) {
    const lista = porColab.get(v.collaboratorId) ?? [];
    lista.push(v);
    porColab.set(v.collaboratorId, lista);
  }

  const linhas: { collaboratorId: string; unitId: string; date: Date; status: DayStatus }[] = [];
  const semConfiguracao: string[] = [];
  let preenchidos = 0;

  for (const c of collabs) {
    const lista = porColab.get(c.id);
    if (!lista || lista.length === 0) { semConfiguracao.push(c.name); continue; }
    const maisAntiga = lista[0];
    preenchidos++;
    for (let d = 1; d <= total; d++) {
      const date = diaUTC(year, month, d);
      const v = vigenciaNaData(lista, date) ?? maisAntiga;
      /* A MESMA regra que a grade usa para calcular — inclusive a escolha entre
         o gerador novo (tipo cadastrado) e o antigo. Se aqui fosse diferente, o
         mês mudaria de cara no instante em que fosse congelado. */
      const status: DayStatus = v.template
        ? planejadoDoDia({
            workDays: v.template.workDays,
            offDays: v.template.offDays,
            anchorDate: v.anchorDate,
            startDate: v.startDate,
            weeklyOffDay: v.weeklyOffDay,
            offMode: v.offMode,
            sundayEveryWeeks: v.sundayEveryWeeks,
          }, date)
        : plannedStatus(v, date);
      linhas.push({ collaboratorId: c.id, unitId, date, status });
    }
  }

  const anterior = await prisma.schedulePlanFill.findUnique({ where: { unitId_year_month: { unitId, year, month } } });

  await prisma.$transaction([
    /* Apagar e recriar o mês inteiro: apertar o botão de novo tem de refletir a
       configuração de HOJE, inclusive para quem deixou de ter escala. */
    prisma.schedulePlanOverride.deleteMany({ where: { unitId, date: { gte: primeiro, lte: ultimo } } }),
    prisma.schedulePlanOverride.createMany({ data: linhas }),
    prisma.schedulePlanFill.upsert({
      where: { unitId_year_month: { unitId, year, month } },
      create: { unitId, year, month, filledById: user.id, filledByName: user.name, collaborators: preenchidos },
      /* `firstFilledAt` NÃO entra no update: ele responde "desde quando este mês
         existe", e reescrevê-lo apagaria essa resposta. */
      update: { filledAt: new Date(), filledById: user.id, filledByName: user.name, collaborators: preenchidos },
    }),
  ]);

  await audit({
    userId: user.id, unitId, action: 'SCHEDULE_PLAN_FILL', module: 'PEOPLE',
    entity: 'schedule_plan_fill', entityId: `${unitId}-${year}-${month}`,
    metadata: { year, month, preenchidos, semConfiguracao: semConfiguracao.length, dias: total },
    ...ctx,
  });

  return { ok: true, resumo: { preenchidos, semConfiguracao, dias: total, primeiraVez: !anterior } };
}

/** Quem preencheu este mês, e quando — nulo se ele ainda é calculado na hora. */
export async function preenchimentoDoMes(unitId: string, year: number, month: number) {
  return prisma.schedulePlanFill.findUnique({ where: { unitId_year_month: { unitId, year, month } } });
}
