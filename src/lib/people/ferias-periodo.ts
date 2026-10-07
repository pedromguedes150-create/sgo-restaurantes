import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { FERIAS_ORIGEM_RH } from '@/lib/rh/sync';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { registrarAbono } from '@/lib/people/abono';
import { periodosAquisitivos, MAX_DIAS_ABONO } from '@/lib/people/periodo-aquisitivo';
import { FERIAS_QUE_CONTAM } from '@/lib/schedule';

/**
 * PERÍODO DE FÉRIAS LANÇADO À MÃO (v1.159.0) — "de 01/10 a 30/10".
 *
 * Pedido do Pedro: a API do RH só diz que o colaborador ESTÁ de férias, sem o
 * início nem o fim. Hoje a sincronização abre um período a partir do dia em que
 * viu o status e o ESTENDE a cada dia (v1.142.1) — e ninguém tinha onde dizer
 * "até quando". Aqui o gerente/supervisão lança o período real.
 *
 * Nada de regra nova: o período entra na MESMA tabela (`Vacation`, status
 * CONFIRMED, origem 'SGO') que a Escala, o Controle de Férias, o Perfil 360 e o
 * abono já leem. Logo: FE na Escala em todos os dias do período, "gozados no SGO"
 * no período aquisitivo, "em gozo" / "programada" na Situação — tudo de graça.
 *
 * Decisões:
 *  - Período da sincronização do RH (origem RH_SYNC) que cruza o lançado é um
 *    CHUTE do SGO (começou no dia do sync, cresce um dia por vez): o lançado
 *    manual o SUBSTITUI, sem perguntar. A pessoa continua "coberta" hoje, então
 *    o próximo sync não abre outro (`estenderFeriasDoRh` → JA_COBERTO).
 *  - Férias SOLICITADA ao RH (REQUESTED) que cruza o lançado vira CONFIRMADA com
 *    as datas lançadas — é a confirmação do que o gerente pediu.
 *  - Outro período CONFIRMADO/APROVADO lançado aqui que cruza → recusa SOBREPOE
 *    (a tela mostra qual; edite ou exclua aquele).
 *  - Editar um período aberto pelo RH troca a origem para 'SGO': senão o sync
 *    voltaria a esticar o fim que a pessoa acabou de fixar.
 *  - Depois do fim lançado, se o RH CONTINUAR dizendo "Férias", o sync abre um
 *    período novo a partir daquele dia — é o RH desatualizado; a tela avisa.
 */
export const MAX_DIAS_PERIODO = 90;
export const ORIGEM_SGO = 'SGO';

/** Venda de dias feita junto do lançamento (v1.159.1): o que aconteceu com ela. */
export type ResultadoAbonoJunto = { ok: true; dias: number; periodoInicio: string } | { ok: false; reason: string };

export type ResultadoFerias =
  | { ok: true; id: string; substituiuRh: number; confirmouSolicitada: boolean; abono?: ResultadoAbonoJunto }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NAO_ENCONTRADO' | 'SOBREPOE'; detalhe?: string };

type Ctx = { ip?: string | null; userAgent?: string | null };
const RE = /^\d{4}-\d{2}-\d{2}$/;
const br = (iso: string) => iso.split('-').reverse().join('/');
export const isoDia = (d: Date) => d.toISOString().slice(0, 10);

export function diasDoPeriodo(startDate: string, endDate: string): number {
  return Math.round((Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86_400_000) + 1;
}

function datasValidas(startDate: string, endDate: string): boolean {
  if (!RE.test(startDate) || !RE.test(endDate) || endDate < startDate) return false;
  const dias = diasDoPeriodo(startDate, endDate);
  return dias >= 1 && dias <= MAX_DIAS_PERIODO;
}

function podeLancar(user: SessionUser): boolean {
  return user.role !== 'FINANCE' && user.role !== 'CASHIER' && user.role !== 'SEPARATOR';
}

/** Períodos de OUTRA origem que cruzam [start, end] (ignora o próprio `exceto`). */
async function cruzamentos(collaboratorId: string, start: Date, end: Date, exceto?: string) {
  return prisma.vacation.findMany({
    where: { collaboratorId, startDate: { lte: end }, endDate: { gte: start }, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { id: true, status: true, source: true, startDate: true, endDate: true },
  });
}

export async function lancarPeriodoDeFerias(
  user: SessionUser,
  input: { collaboratorId: string; startDate: string; endDate: string; note?: string | null; unitId?: string | null; diasVendidos?: number | null; periodoInicio?: string | null },
  ctx: Ctx = {},
): Promise<ResultadoFerias> {
  if (!podeLancar(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!datasValidas(input.startDate, input.endDate)) return { ok: false, reason: 'INVALID' };
  const vendidos = Number(input.diasVendidos ?? 0);
  if (!Number.isInteger(vendidos) || vendidos < 0 || vendidos > MAX_DIAS_ABONO) return { ok: false, reason: 'INVALID', detalhe: `dias vendidos de 0 a ${MAX_DIAS_ABONO}` };
  const collab = await prisma.collaborator.findUnique({
    where: { id: input.collaboratorId },
    select: { name: true, units: { select: { unitId: true } } },
  });
  if (!collab) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const unit = collab.units.find((u) => (input.unitId ? u.unitId === input.unitId : true) && canAccessUnit(user, u.unitId))
    ?? collab.units.find((u) => canAccessUnit(user, u.unitId));
  if (!unit) return { ok: false, reason: 'FORBIDDEN' };

  const start = new Date(input.startDate + 'T00:00:00Z');
  const end = new Date(input.endDate + 'T00:00:00Z');
  const cruza = await cruzamentos(input.collaboratorId, start, end);
  const doRh = cruza.filter((c) => c.source === FERIAS_ORIGEM_RH);
  const solicitadas = cruza.filter((c) => c.source !== FERIAS_ORIGEM_RH && c.status === 'REQUESTED');
  const firmes = cruza.filter((c) => c.source !== FERIAS_ORIGEM_RH && c.status !== 'REQUESTED');
  if (firmes.length) {
    const f = firmes[0];
    return { ok: false, reason: 'SOBREPOE', detalhe: `${br(isoDia(f.startDate))} a ${br(isoDia(f.endDate))}` };
  }
  const note = input.note?.trim() || null;

  const id = await prisma.$transaction(async (tx) => {
    if (doRh.length) await tx.vacation.deleteMany({ where: { id: { in: doRh.map((x) => x.id) } } });
    if (solicitadas.length) {
      const [primeira, ...resto] = solicitadas;
      if (resto.length) await tx.vacation.deleteMany({ where: { id: { in: resto.map((x) => x.id) } } });
      await tx.vacation.update({ where: { id: primeira.id }, data: { startDate: start, endDate: end, status: 'CONFIRMED', source: ORIGEM_SGO, changeNote: note ?? 'Confirmada à mão (período informado pela unidade)' } });
      return primeira.id;
    }
    const v = await tx.vacation.create({
      data: { collaboratorId: input.collaboratorId, unitId: unit.unitId, startDate: start, endDate: end, status: 'CONFIRMED', source: ORIGEM_SGO, changeNote: note ?? 'Período lançado à mão' },
    });
    return v.id;
  });

  await audit({
    userId: user.id, unitId: unit.unitId, action: 'VACATION_MANUAL_CREATE', module: 'PEOPLE', entity: 'vacation', entityId: id,
    metadata: { name: collab.name, start: input.startDate, end: input.endDate, dias: diasDoPeriodo(input.startDate, input.endDate), note, substituiuRh: doRh.map((x) => `${isoDia(x.startDate)}..${isoDia(x.endDate)}`), confirmouSolicitada: solicitadas.length > 0 },
    ...ctx,
  });
  /* VENDA DE DIAS junto do lançamento (v1.159.1, pedido do Pedro: "para fazer sentido
     com a operação"): "saiu de 01/10 a 20/10 e vendeu os outros 10". A venda é o
     MESMO abono da aba Abono (: 1/3 do direito, dentro do saldo, um
     por período aquisitivo), gravado DEPOIS do período — se recusada, as férias
     ficam lançadas e a tela diz por que a venda não entrou. Sem período informado,
     vai para o período aquisitivo mais antigo que ainda tem saldo para vender. */
  let abono: ResultadoAbonoJunto | undefined;
  if (vendidos > 0) {
    const periodoInicio = input.periodoInicio || (await periodoParaVender(input.collaboratorId));
    if (!periodoInicio) abono = { ok: false, reason: 'PERIODO' };
    else {
      const r = await registrarAbono(user, { collaboratorId: input.collaboratorId, periodoInicio, dias: vendidos, observacao: `Vendidos junto das férias de ${br(input.startDate)} a ${br(input.endDate)}` }, ctx);
      abono = r.ok ? { ok: true, dias: vendidos, periodoInicio } : { ok: false, reason: r.reason };
    }
  }
  return { ok: true, id, substituiuRh: doRh.length, confirmouSolicitada: solicitadas.length > 0, ...(abono ? { abono } : {}) };
}

/** Período aquisitivo mais antigo em que ainda dá para vender dias (mesma régua da aba Abono). */
async function periodoParaVender(collaboratorId: string): Promise<string | null> {
  const c = await prisma.collaborator.findUnique({
    where: { id: collaboratorId },
    select: { hireDate: true, hireDateManual: true, vacations: { where: { status: { in: FERIAS_QUE_CONTAM } }, select: { startDate: true, endDate: true } }, vacationAbonos: { select: { periodoInicio: true, dias: true } }, vacationAjustes: { select: { periodoInicio: true, diasGozados: true } } },
  });
  if (!c) return null;
  const periodos = periodosAquisitivos(c.hireDateManual || c.hireDate, c.vacations.map((v) => ({ inicio: isoDia(v.startDate), fim: isoDia(v.endDate) })), hojeNaOperacao(), undefined, c.vacationAbonos, c.vacationAjustes);
  return periodos.find((p) => p.situacao !== 'ANTERIOR_AO_SGO' && p.situacao !== 'QUITADO' && p.saldo > 0 && p.diasVendidos === 0)?.inicio ?? null;
}

export async function editarPeriodoDeFerias(
  user: SessionUser,
  id: string,
  input: { startDate: string; endDate: string; note?: string | null },
  ctx: Ctx = {},
): Promise<ResultadoFerias> {
  if (!podeLancar(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!datasValidas(input.startDate, input.endDate)) return { ok: false, reason: 'INVALID' };
  const v = await prisma.vacation.findUnique({ where: { id }, include: { collaborator: { select: { name: true } } } });
  if (!v) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (!canAccessUnit(user, v.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const start = new Date(input.startDate + 'T00:00:00Z');
  const end = new Date(input.endDate + 'T00:00:00Z');
  const cruza = await cruzamentos(v.collaboratorId, start, end, id);
  const doRh = cruza.filter((c) => c.source === FERIAS_ORIGEM_RH);
  const firmes = cruza.filter((c) => c.source !== FERIAS_ORIGEM_RH);
  if (firmes.length) {
    const f = firmes[0];
    return { ok: false, reason: 'SOBREPOE', detalhe: `${br(isoDia(f.startDate))} a ${br(isoDia(f.endDate))}` };
  }
  const note = input.note === undefined ? v.changeNote : (input.note?.trim() || null);
  await prisma.$transaction(async (tx) => {
    if (doRh.length) await tx.vacation.deleteMany({ where: { id: { in: doRh.map((x) => x.id) } } });
    await tx.vacation.update({
      where: { id },
      // origem vira SGO: o sync do RH só estica período de origem RH_SYNC — fixar o fim tem de valer
      data: { startDate: start, endDate: end, source: ORIGEM_SGO, changeNote: note, ...(v.status === 'REQUESTED' ? {} : { status: 'CONFIRMED' as const }) },
    });
  });
  await audit({
    userId: user.id, unitId: v.unitId, action: 'VACATION_MANUAL_EDIT', module: 'PEOPLE', entity: 'vacation', entityId: id,
    metadata: { name: v.collaborator.name, antes: { start: isoDia(v.startDate), end: isoDia(v.endDate), source: v.source }, depois: { start: input.startDate, end: input.endDate, source: ORIGEM_SGO }, substituiuRh: doRh.length },
    ...ctx,
  });
  return { ok: true, id, substituiuRh: doRh.length, confirmouSolicitada: false };
}

export async function excluirPeriodoDeFerias(user: SessionUser, id: string, ctx: Ctx = {}): Promise<{ ok: true } | { ok: false; reason: 'FORBIDDEN' | 'NAO_ENCONTRADO' }> {
  if (!podeLancar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const v = await prisma.vacation.findUnique({ where: { id }, include: { collaborator: { select: { name: true } } } });
  if (!v) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (!canAccessUnit(user, v.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.vacation.delete({ where: { id } });
  await audit({
    userId: user.id, unitId: v.unitId, action: 'VACATION_MANUAL_DELETE', module: 'PEOPLE', entity: 'vacation', entityId: id,
    metadata: { name: v.collaborator.name, start: isoDia(v.startDate), end: isoDia(v.endDate), status: v.status, source: v.source },
    ...ctx,
  });
  return { ok: true };
}

export type OrigemDoPeriodo = 'RH' | 'SGO' | 'SOLICITADA';
export interface PeriodoListado {
  id: string; collaboratorId: string; colaborador: string; unitId: string; unidade: string;
  inicio: string; fim: string; dias: number; origem: OrigemDoPeriodo; status: string; nota: string | null;
  emGozo: boolean; futura: boolean;
}

/** Períodos do alcance (unidade opcional) que terminaram há até `meses` meses, mais os futuros. */
export async function listarPeriodosDeFerias(user: SessionUser, unitId?: string | null, meses = 12, now: Date = new Date()): Promise<PeriodoListado[]> {
  const hoje = hojeNaOperacao(now);
  const desde = new Date(now.getTime());
  desde.setUTCMonth(desde.getUTCMonth() - meses);
  const rows = await prisma.vacation.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(unitId ? { unitId } : {}), endDate: { gte: desde } },
    orderBy: [{ startDate: 'desc' }],
    include: { collaborator: { select: { name: true } }, unit: { select: { name: true } } },
    take: 500,
  });
  return rows.map((v) => {
    const inicio = isoDia(v.startDate), fim = isoDia(v.endDate);
    return {
      id: v.id, collaboratorId: v.collaboratorId, colaborador: v.collaborator.name, unitId: v.unitId, unidade: v.unit.name,
      inicio, fim, dias: diasDoPeriodo(inicio, fim),
      origem: v.source === FERIAS_ORIGEM_RH ? 'RH' : v.status === 'REQUESTED' ? 'SOLICITADA' : 'SGO',
      status: v.status, nota: v.changeNote,
      emGozo: inicio <= hoje && fim >= hoje, futura: inicio > hoje,
    };
  });
}
