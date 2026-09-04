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

/* ───────────────────────── Limpar o mês ───────────────────────── */

export interface ResumoDoMes {
  /** Dias de Planejado congelado (o que o "Preencher automaticamente" gravou). */
  congelados: number;
  /** Marcações de presença lançadas no Realizado. */
  realizados: number;
  /** Avisos ao RH deste mês que ainda não foram enviados. */
  avisosPendentes: number;
}

/** Quanto existe no mês — a tela precisa dizer o tamanho do estrago ANTES de apagar. */
export async function resumoDoMes(unitId: string, year: number, month: number): Promise<ResumoDoMes> {
  const total = diasNoMes(year, month);
  const primeiro = diaUTC(year, month, 1);
  const ultimo = diaUTC(year, month, total);
  const mesISO = `${year}-${String(month).padStart(2, '0')}`;

  const [congelados, realizados, avisosPendentes] = await Promise.all([
    prisma.schedulePlanOverride.count({ where: { unitId, date: { gte: primeiro, lte: ultimo } } }),
    prisma.scheduleActual.count({ where: { unitId, date: { gte: primeiro, lte: ultimo } } }),
    prisma.rhScheduleNotice.count({ where: { unitId, sent: false, date: { startsWith: mesISO } } }),
  ]);
  return { congelados, realizados, avisosPendentes };
}

/**
 * Limpa a escala de UM MÊS de UMA unidade: o Planejado congelado e o Realizado.
 *
 * O que NÃO é tocado, de propósito: a configuração de escala dos colaboradores.
 * Ela é o cadastro, não o mês — apagar junto obrigaria a recadastrar a unidade
 * inteira para consertar um mês. Sem o congelado, a grade volta a ser calculada
 * a partir desse cadastro, então a tela não fica vazia.
 *
 * Os avisos ao RH ainda NÃO ENVIADOS do mês saem junto: sem isso, remarcar a
 * mesma falta criaria um segundo aviso para o mesmo dia. Os já enviados ficam —
 * eles registram o que a unidade informou, e reescrever isso seria mentir sobre
 * o que foi comunicado.
 *
 * A confirmação é ESCRITA e conferida aqui: quem chamar tem de mandar o nome da
 * unidade. Uma janela de "tem certeza?" some com um Enter distraído; digitar o
 * nome exige ler qual unidade está prestes a ser limpa.
 */
export type LimpezaResult =
  | { ok: true; apagados: ResumoDoMes }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; message?: string };

export async function limparMesDaEscala(
  user: SessionUser,
  input: { unitId: string; year: number; month: number; confirmacao: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<LimpezaResult> {
  const { unitId } = input;
  const year = Number(input.year);
  const month = Number(input.month);
  if (!unitId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, reason: 'INVALID', message: 'Mês inválido.' };
  }
  /* Apagar o mês inteiro de uma unidade é ação de Administrador — a mesma régua
     da limpeza em lote das divergências de comandas. */
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN', message: 'Só o Administrador pode limpar o mês.' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const unidade = await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } });
  if (!unidade) return { ok: false, reason: 'NOT_FOUND' };

  const digitado = String(input.confirmacao ?? '').trim().toLocaleLowerCase('pt-BR');
  if (digitado !== unidade.name.trim().toLocaleLowerCase('pt-BR')) {
    return { ok: false, reason: 'INVALID', message: `Para confirmar, digite o nome da unidade exatamente: ${unidade.name}` };
  }

  const apagados = await resumoDoMes(unitId, year, month);
  const total = diasNoMes(year, month);
  const primeiro = diaUTC(year, month, 1);
  const ultimo = diaUTC(year, month, total);
  const mesISO = `${year}-${String(month).padStart(2, '0')}`;

  await prisma.$transaction([
    prisma.schedulePlanOverride.deleteMany({ where: { unitId, date: { gte: primeiro, lte: ultimo } } }),
    prisma.scheduleActual.deleteMany({ where: { unitId, date: { gte: primeiro, lte: ultimo } } }),
    prisma.rhScheduleNotice.deleteMany({ where: { unitId, sent: false, date: { startsWith: mesISO } } }),
    prisma.schedulePlanFill.deleteMany({ where: { unitId, year, month } }),
  ]);

  await audit({
    userId: user.id, unitId, action: 'SCHEDULE_MONTH_CLEAR', module: 'PEOPLE',
    entity: 'schedule_month', entityId: `${unitId}-${year}-${month}`,
    metadata: { year, month, ...apagados, unidade: unidade.name },
    ...ctx,
  });

  return { ok: true, apagados };
}
