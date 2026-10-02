import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getScheduleGrid, fillActualFromPlan, dayUTC } from '@/lib/schedule';
import { estenderFeriasDoRh, FERIAS_ORIGEM_RH } from '@/lib/rh/sync';
import type { SessionUser } from '@/lib/auth/session';

/**
 * FÉRIAS NA ESCALA É DERIVADA DO PERÍODO (v1.142.1).
 *
 * Relato do Pedro (print): Alessandra e Krislley de férias e a grade do mês
 * cheia de "T". Três causas, todas fechadas aqui: o FE do RH só gravava o dia
 * da sincronização; o Planejado nunca via o Realizado; "Puxar Realizado =
 * Planejado" apagava o FE; e a tabela de férias do SGO não era lida pela grade.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let adminId: string;
let ale: string;
const admin = (): SessionUser => ({ id: adminId, name: 'Admin FE', role: 'ADMIN', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

const d = (iso: string) => { const [y, m, dd] = iso.split('-').map(Number); return dayUTC(y, m, dd); };
const linha = async (mes = 10) => (await getScheduleGrid(unitId, 2026, mes)).rows.find((r) => r.collaboratorId === ale)!;

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `FE-${sfx}`, name: `FE ${sfx}` } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin FE', email: `fe-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  ale = (await prisma.collaborator.create({ data: { name: `FE-${sfx} Alessandra`, units: { create: { unitId } } } })).id;
  /* 6x1 ancorado num dia qualquer: o que importa é que o padrão diz T. */
  await prisma.employeeSchedule.create({ data: { collaboratorId: ale, unitId, scheduleType: 'SIX_ONE', anchorDate: d('2026-09-01'), startDate: d('2026-09-01'), active: true } });
});

beforeEach(async () => {
  await prisma.vacation.deleteMany({ where: { collaboratorId: ale } });
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId: ale } });
});

afterAll(async () => {
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId: ale } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: ale } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('a grade pergunta ao período de férias', () => {
  it('férias CONFIRMADA de 05 a 20/10 vira FE nos dois níveis, e só nesses dias', async () => {
    await prisma.vacation.create({ data: { collaboratorId: ale, unitId, startDate: d('2026-10-05'), endDate: d('2026-10-20'), status: 'CONFIRMED' } });
    const r = await linha();
    expect(r.days[4]).toEqual({ planned: 'FERIAS', actual: 'FERIAS' }); // dia 5
    expect(r.days[19]).toEqual({ planned: 'FERIAS', actual: 'FERIAS' }); // dia 20
    expect(r.days[3].planned).not.toBe('FERIAS'); // dia 4
    expect(r.days[20].planned).not.toBe('FERIAS'); // dia 21
    expect(r.days[3].actual).toBeNull();
  });

  it('período que atravessa o mês aparece nos dois meses; férias só SOLICITADA ao RH ainda não é férias', async () => {
    await prisma.vacation.create({ data: { collaboratorId: ale, unitId, startDate: d('2026-10-28'), endDate: d('2026-11-03'), status: 'APPROVED' } });
    expect((await linha(10)).days[30].planned).toBe('FERIAS'); // 31/10
    expect((await linha(11)).days[2].planned).toBe('FERIAS'); // 03/11
    expect((await linha(11)).days[3].planned).not.toBe('FERIAS'); // 04/11
    await prisma.vacation.deleteMany({ where: { collaboratorId: ale } });
    await prisma.vacation.create({ data: { collaboratorId: ale, unitId, startDate: d('2026-10-05'), endDate: d('2026-10-20'), status: 'REQUESTED' } });
    expect((await linha()).days[4].planned).not.toBe('FERIAS');
  });

  it('"Puxar Realizado = Planejado" não pisa no FE — nem no derivado nem no marcado à mão', async () => {
    await prisma.vacation.create({ data: { collaboratorId: ale, unitId, startDate: d('2026-10-05'), endDate: d('2026-10-06'), status: 'CONFIRMED' } });
    await prisma.scheduleActual.create({ data: { collaboratorId: ale, unitId, date: d('2026-10-15'), status: 'FERIAS', createdById: adminId } });
    const r = await fillActualFromPlan(admin(), { unitId, year: 2026, month: 10, mode: 'all' });
    expect(r.ok).toBe(true);
    const l = await linha();
    expect(l.days[4].actual).toBe('FERIAS');
    expect(l.days[14].actual).toBe('FERIAS');
    expect(l.days[0].actual).toBe(l.days[0].planned); // o resto foi copiado
    const gravado15 = await prisma.scheduleActual.findUnique({ where: { collaboratorId_date: { collaboratorId: ale, date: d('2026-10-15') } } });
    expect(gravado15?.status).toBe('FERIAS');
  });

  it('atestado dentro das férias continua atestado (afastamento documentado vence)', async () => {
    await prisma.vacation.create({ data: { collaboratorId: ale, unitId, startDate: d('2026-10-05'), endDate: d('2026-10-10'), status: 'CONFIRMED' } });
    const at = await prisma.medicalCertificate.create({ data: { collaboratorId: ale, unitId, type: 'FULL_DAY', startDate: '2026-10-07', endDate: '2026-10-07', days: 1, createdById: adminId } });
    const l = await linha();
    expect(l.days[6].actual).toBe('ATESTADO');
    expect(l.days[5].actual).toBe('FERIAS');
    await prisma.medicalCertificate.delete({ where: { id: at.id } });
  });
});

describe('o sync do RH abre e ESTENDE o período, sem adivinhar', () => {
  it('1º dia: abre hoje→hoje (CONFIRMED, origem RH_SYNC); dia seguinte: estende; dia já coberto por férias manual: não duplica', async () => {
    expect(await estenderFeriasDoRh(ale, unitId, d('2026-10-05'))).toBe('ABERTO');
    expect(await estenderFeriasDoRh(ale, unitId, d('2026-10-05'))).toBe('JA_COBERTO'); // 2º sync no mesmo dia
    expect(await estenderFeriasDoRh(ale, unitId, d('2026-10-06'))).toBe('ESTENDIDO');
    expect(await estenderFeriasDoRh(ale, unitId, d('2026-10-07'))).toBe('ESTENDIDO');
    const v = await prisma.vacation.findMany({ where: { collaboratorId: ale } });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ status: 'CONFIRMED', source: FERIAS_ORIGEM_RH });
    expect(v[0].startDate.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(v[0].endDate.toISOString().slice(0, 10)).toBe('2026-10-07');
    /* A grade reflete o período: 05, 06 e 07 = FE; 04 e 08 não. */
    const l = await linha();
    expect(l.days.slice(4, 7).map((x) => x.planned)).toEqual(['FERIAS', 'FERIAS', 'FERIAS']);
    expect(l.days[3].planned).not.toBe('FERIAS');
    expect(l.days[7].planned).not.toBe('FERIAS');
  });

  it('o RH voltou a "Ativo" por dois dias e disse "Férias" de novo: é OUTRO período, o anterior não cresce', async () => {
    await estenderFeriasDoRh(ale, unitId, d('2026-10-05'));
    await estenderFeriasDoRh(ale, unitId, d('2026-10-06'));
    expect(await estenderFeriasDoRh(ale, unitId, d('2026-10-09'))).toBe('ABERTO');
    const v = await prisma.vacation.findMany({ where: { collaboratorId: ale }, orderBy: { startDate: 'asc' } });
    expect(v.map((x) => [x.startDate.toISOString().slice(0, 10), x.endDate.toISOString().slice(0, 10)])).toEqual([['2026-10-05', '2026-10-06'], ['2026-10-09', '2026-10-09']]);
    expect((await linha()).days[6].planned).not.toBe('FERIAS'); // 07/10 não foi inventado
  });

  it('férias lançada à mão cobrindo hoje é respeitada: o sync não abre um segundo período', async () => {
    await prisma.vacation.create({ data: { collaboratorId: ale, unitId, startDate: d('2026-10-01'), endDate: d('2026-10-30'), status: 'CONFIRMED' } });
    expect(await estenderFeriasDoRh(ale, unitId, d('2026-10-10'))).toBe('JA_COBERTO');
    expect(await prisma.vacation.count({ where: { collaboratorId: ale } })).toBe(1);
  });
});
