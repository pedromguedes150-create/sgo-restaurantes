import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { FERIAS_QUE_CONTAM } from '@/lib/schedule';
import { MAX_DIAS_ABONO, periodosAquisitivos } from '@/lib/people/periodo-aquisitivo';
import type { SessionUser } from '@/lib/auth/session';

/**
 * ABONO PECUNIÁRIO — venda de dias de férias (v1.153.0).
 *
 * Pedido do Pedro: "o funcionário pode tirar, por exemplo, 20 dias e vender 10;
 * isso é normal". CLT art. 143: o colaborador pode converter até 1/3 do
 * período (10 dos 30 dias) em dinheiro. O registro fica preso ao PERÍODO
 * AQUISITIVO (pelo início), um por período, e abate o saldo junto com o gozo.
 *
 * Não muda nada no fluxo de férias existente (Pessoas → Férias segue igual):
 * é um registro à parte, que o cálculo do período passa a considerar.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoAbono =
  | { ok: true; id: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'DIAS' | 'PERIODO' | 'SALDO' | 'JA_EXISTE' | 'NAO_ENCONTRADO' };

const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** Quem pode desfazer: Supervisão/Admin/CEO, ou quem registrou. */
const PODE_EXCLUIR_QUALQUER = ['ADMIN', 'CEO', 'SUPERVISOR'];

export async function registrarAbono(
  user: SessionUser,
  input: { collaboratorId: string; periodoInicio: string; dias: number; observacao?: string | null },
  ctx: Ctx = {},
): Promise<ResultadoAbono> {
  const dias = Number(input.dias);
  if (!Number.isInteger(dias) || dias < 1 || dias > MAX_DIAS_ABONO) return { ok: false, reason: 'DIAS' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodoInicio ?? '')) return { ok: false, reason: 'INVALID' };

  const c = await prisma.collaborator.findUnique({
    where: { id: input.collaboratorId },
    select: { id: true, name: true, hireDate: true, hireDateManual: true, units: { select: { unitId: true } }, vacations: { where: { status: { in: FERIAS_QUE_CONTAM } }, select: { startDate: true, endDate: true } }, vacationAjustes: { select: { periodoInicio: true, diasGozados: true } } },
  });
  if (!c) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const unitId = c.units.map((u) => u.unitId).find((u) => canAccessUnit(user, u));
  if (!unitId) return { ok: false, reason: 'FORBIDDEN' };

  /* O período precisa existir pela admissão do RH e ter saldo para os dias. */
  const outros = await prisma.vacationAbono.findMany({ where: { collaboratorId: c.id }, select: { periodoInicio: true, dias: true } });
  if (outros.some((a) => a.periodoInicio === input.periodoInicio)) return { ok: false, reason: 'JA_EXISTE' };
  const periodos = periodosAquisitivos(c.hireDateManual || c.hireDate, c.vacations.map((v) => ({ inicio: isoDia(v.startDate), fim: isoDia(v.endDate) })), hojeBR(), undefined, outros, c.vacationAjustes);
  const p = periodos.find((x) => x.inicio === input.periodoInicio);
  if (!p || p.situacao === 'ANTERIOR_AO_SGO') return { ok: false, reason: 'PERIODO' };
  if (dias > p.saldo) return { ok: false, reason: 'SALDO' };

  try {
    const a = await prisma.vacationAbono.create({
      data: {
        collaboratorId: c.id, collaboratorName: c.name, unitId, periodoInicio: input.periodoInicio, dias,
        observacao: input.observacao?.trim() || null, createdById: user.id, createdByName: user.name,
      },
    });
    await audit({ userId: user.id, unitId, action: 'VACATION_ABONO_CREATE', module: 'PEOPLE', entity: 'vacation_abono', entityId: a.id, metadata: { colaborador: c.name, periodoInicio: input.periodoInicio, dias }, ...ctx });
    return { ok: true, id: a.id };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return { ok: false, reason: 'JA_EXISTE' };
    throw e;
  }
}

export async function excluirAbono(user: SessionUser, id: string, ctx: Ctx = {}): Promise<ResultadoAbono> {
  const a = await prisma.vacationAbono.findUnique({ where: { id } });
  if (!a) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (!canAccessUnit(user, a.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!PODE_EXCLUIR_QUALQUER.includes(user.role) && a.createdById !== user.id) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.vacationAbono.delete({ where: { id } });
  await audit({ userId: user.id, unitId: a.unitId, action: 'VACATION_ABONO_DELETE', module: 'PEOPLE', entity: 'vacation_abono', entityId: id, metadata: { colaborador: a.collaboratorName, periodoInicio: a.periodoInicio, dias: a.dias }, ...ctx });
  return { ok: true, id };
}

/** Abonos do alcance (opcionalmente de uma unidade), do mais recente ao mais antigo. */
export async function listarAbonos(user: SessionUser, unitId?: string | null) {
  return prisma.vacationAbono.findMany({
    where: { AND: [unitScopeWhere(user, 'unitId'), unitId ? { unitId } : {}] },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
}

export function podeExcluirAbono(user: SessionUser, a: { createdById: string | null }): boolean {
  return PODE_EXCLUIR_QUALQUER.includes(user.role) || a.createdById === user.id;
}
