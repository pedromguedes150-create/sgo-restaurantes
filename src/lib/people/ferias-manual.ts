import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { FERIAS_QUE_CONTAM } from '@/lib/schedule';
import { DIAS_DE_DIREITO, periodosAquisitivos } from '@/lib/people/periodo-aquisitivo';
import type { SessionUser } from '@/lib/auth/session';

/**
 * FÉRIAS PREENCHIDAS À MÃO (v1.154.0).
 *
 * Pedido do Pedro: "além das informações preenchidas pelo RH, quero poder
 * preencher também — algumas vêm erradas de lá, e o SGO Restaurante foi feito
 * em julho, então as informações passadas eu preciso preencher manual".
 *
 * Duas correções, as duas FORA do caminho do sync (que continua igual):
 *  1. ADMISSÃO CORRIGIDA — `Collaborator.hireDateManual`. O sync do RH segue
 *     gravando `hireDate`; o controle de férias usa a corrigida quando existe.
 *     Só Supervisão/Admin/CEO, com motivo; a do RH continua visível ao lado.
 *  2. DIAS JÁ GOZADOS POR PERÍODO — `VacationPeriodAdjust`. Para o gozo que
 *     NÃO está lançado no SGO (antes do SGO, ou que o RH não mandou). Abate o
 *     saldo e torna o período julgável mesmo se "anterior ao SGO".
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoManual =
  | { ok: true }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'MOTIVO' | 'PERIODO' | 'SALDO' | 'NAO_ENCONTRADO' };

const PODE_CORRIGIR_ADMISSAO = ['ADMIN', 'CEO', 'SUPERVISOR'];
export const podeCorrigirAdmissao = (user: SessionUser) => PODE_CORRIGIR_ADMISSAO.includes(user.role);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** A admissão que o controle de férias usa: a corrigida, senão a do RH. */
export const admissaoEfetiva = (c: { hireDate: string | null; hireDateManual?: string | null }) => c.hireDateManual || c.hireDate;

async function colaboradorNoAlcance(user: SessionUser, id: string) {
  const c = await prisma.collaborator.findUnique({
    where: { id },
    select: {
      id: true, name: true, jobTitle: true, hireDate: true, hireDateManual: true, hireDateManualNote: true, hireDateManualBy: true, hireDateManualAt: true,
      units: { select: { unitId: true, unit: { select: { name: true } } } },
      vacations: { where: { status: { in: FERIAS_QUE_CONTAM } }, select: { startDate: true, endDate: true } },
      vacationAbonos: { select: { periodoInicio: true, dias: true } },
      vacationAjustes: { orderBy: { periodoInicio: 'desc' } },
    },
  });
  if (!c) return null;
  const unitId = c.units.map((u) => u.unitId).find((u) => canAccessUnit(user, u));
  return unitId ? { c, unitId } : null;
}

export async function corrigirAdmissao(
  user: SessionUser,
  input: { collaboratorId: string; data: string | null; motivo?: string | null },
  ctx: Ctx = {},
): Promise<ResultadoManual> {
  if (!podeCorrigirAdmissao(user)) return { ok: false, reason: 'FORBIDDEN' };
  const alvo = await colaboradorNoAlcance(user, input.collaboratorId);
  if (!alvo) return { ok: false, reason: 'FORBIDDEN' };
  const data = input.data ? String(input.data) : null;
  if (data && (!ISO.test(data) || data > hojeBR())) return { ok: false, reason: 'INVALID' };
  const motivo = input.motivo?.trim() || null;
  if (data && !motivo) return { ok: false, reason: 'MOTIVO' };
  const { c, unitId } = alvo;
  await prisma.collaborator.update({
    where: { id: c.id },
    data: data
      ? { hireDateManual: data, hireDateManualNote: motivo, hireDateManualBy: user.name, hireDateManualAt: new Date() }
      : { hireDateManual: null, hireDateManualNote: null, hireDateManualBy: null, hireDateManualAt: null },
  });
  await audit({
    userId: user.id, unitId, action: data ? 'HIRE_DATE_MANUAL_SET' : 'HIRE_DATE_MANUAL_CLEAR', module: 'PEOPLE', entity: 'collaborator', entityId: c.id,
    metadata: { colaborador: c.name, admissaoRh: c.hireDate, antes: c.hireDateManual, depois: data, motivo }, ...ctx,
  });
  return { ok: true };
}

export async function informarGozo(
  user: SessionUser,
  input: { collaboratorId: string; periodoInicio: string; diasGozados: number; observacao?: string | null },
  ctx: Ctx = {},
): Promise<ResultadoManual> {
  const dias = Number(input.diasGozados);
  if (!Number.isInteger(dias) || dias < 0 || dias > DIAS_DE_DIREITO || !ISO.test(input.periodoInicio ?? '')) return { ok: false, reason: 'INVALID' };
  const alvo = await colaboradorNoAlcance(user, input.collaboratorId);
  if (!alvo) return { ok: false, reason: 'FORBIDDEN' };
  const { c, unitId } = alvo;

  const periodos = periodosAquisitivos(admissaoEfetiva(c), [], hojeBR(), undefined, c.vacationAbonos);
  const p = periodos.find((x) => x.inicio === input.periodoInicio);
  if (!p) return { ok: false, reason: 'PERIODO' };
  if (dias + p.diasVendidos > DIAS_DE_DIREITO) return { ok: false, reason: 'SALDO' };

  const antes = c.vacationAjustes.find((a) => a.periodoInicio === input.periodoInicio) ?? null;
  if (dias === 0) {
    if (antes) await prisma.vacationPeriodAdjust.delete({ where: { id: antes.id } });
  } else {
    await prisma.vacationPeriodAdjust.upsert({
      where: { collaboratorId_periodoInicio: { collaboratorId: c.id, periodoInicio: input.periodoInicio } },
      create: { collaboratorId: c.id, collaboratorName: c.name, unitId, periodoInicio: input.periodoInicio, diasGozados: dias, observacao: input.observacao?.trim() || null, createdById: user.id, createdByName: user.name },
      update: { diasGozados: dias, observacao: input.observacao?.trim() || null, createdById: user.id, createdByName: user.name },
    });
  }
  await audit({
    userId: user.id, unitId, action: 'VACATION_PERIOD_ADJUST', module: 'PEOPLE', entity: 'collaborator', entityId: c.id,
    metadata: { colaborador: c.name, periodoInicio: input.periodoInicio, antes: antes?.diasGozados ?? 0, depois: dias, observacao: input.observacao ?? null }, ...ctx,
  });
  return { ok: true };
}

/** Tudo o que a aba "Ajustes manuais" precisa de UM colaborador. */
export async function getFeriasDoColaborador(user: SessionUser, id: string) {
  const alvo = await colaboradorNoAlcance(user, id);
  if (!alvo) return null;
  const { c } = alvo;
  const gozos = c.vacations.map((v) => ({ inicio: isoDia(v.startDate), fim: isoDia(v.endDate) }));
  const periodos = periodosAquisitivos(admissaoEfetiva(c), gozos, hojeBR(), undefined, c.vacationAbonos, c.vacationAjustes);
  return {
    id: c.id, nome: c.name, funcao: c.jobTitle, unidade: c.units[0]?.unit.name ?? '',
    admissaoRh: c.hireDate, admissaoManual: c.hireDateManual,
    admissaoManualNota: c.hireDateManualNote, admissaoManualPor: c.hireDateManualBy, admissaoManualEm: c.hireDateManualAt ? isoDia(c.hireDateManualAt) : null,
    periodos: [...periodos].reverse(),
    ajustes: Object.fromEntries(c.vacationAjustes.map((a) => [a.periodoInicio, { dias: a.diasGozados, observacao: a.observacao, por: a.createdByName, em: isoDia(a.updatedAt) }])),
    /* Registros presos a um período que não existe mais (a admissão mudou depois):
       não entram na conta, e a tela precisa dizer isso em vez de sumir com eles. */
    orfaos: [
      ...c.vacationAbonos.filter((a) => !periodos.some((p) => p.inicio === a.periodoInicio)).map((a) => ({ tipo: 'Venda (abono)', periodoInicio: a.periodoInicio, dias: a.dias })),
      ...c.vacationAjustes.filter((a) => !periodos.some((p) => p.inicio === a.periodoInicio)).map((a) => ({ tipo: 'Gozo informado', periodoInicio: a.periodoInicio, dias: a.diasGozados })),
    ],
  };
}

/** Lista leve do alcance para o seletor (nome, função, unidade). */
export async function colaboradoresParaAjuste(user: SessionUser, unitId?: string | null) {
  return prisma.collaborator.findMany({
    where: { active: true, units: { some: { AND: [unitScopeWhere(user, 'unitId'), unitId ? { unitId } : {}] } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, jobTitle: true, hireDate: true, hireDateManual: true },
  });
}
