import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * AFASTADO no RH vira AF na Escala (v1.166.0). Pedido do Pedro: "afastado
 * geralmente não vai preencher a grade de funcionário; aposentado não altera,
 * está trabalhando normal". O RH só manda o status, sem datas — o período nasce
 * no dia em que o sync o vê e cresce enquanto o status persistir.
 */
const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const RH_NAME = `AFASTAMENTO TESTE ${sfx}`;
let lista: Record<string, unknown>[] = [];

vi.mock('@/lib/rh/client', () => ({
  rhConfigured: () => true,
  RhApiError: class RhApiError extends Error {},
  rh: { colaboradoresDaUnidade: async () => ({ data: lista }) },
}));

import { prisma } from '@/lib/db/prisma';
import { getScheduleGrid, fillActualFromPlan, dayUTC } from '@/lib/schedule';
import { estenderAfastamentoDoRh, syncCollaboratorsForUnit } from '@/lib/rh/sync';
import type { SessionUser } from '@/lib/auth/session';

let unitId: string; let adminId: string;
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const d = (iso: string) => { const [y, m, dd] = iso.split('-').map(Number); return dayUTC(y, m, dd); };
const pessoa = (matricula: string, nome: string, status: string) => ({ matricula: `T${sfx}-${matricula}`, nome, status, unidade: RH_NAME, cargo: 'Balconista', admissao: null, cpf: null });
const colab = (m: string) => prisma.collaborator.findFirstOrThrow({ where: { externalId: `T${sfx}-${m}` } });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `AF-${sfx}`, name: `AF ${sfx}`, rhUnitName: RH_NAME } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `af-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
});
beforeEach(async () => { await prisma.rhAfastamento.deleteMany({ where: { unitId } }); });
afterAll(async () => {
  const ids = (await prisma.collaborator.findMany({ where: { externalId: { startsWith: `T${sfx}-` } }, select: { id: true } })).map((c) => c.id);
  await prisma.rhAfastamento.deleteMany({ where: { collaboratorId: { in: ids } } });
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId: { in: ids } } });
  await prisma.employeeSchedule.deleteMany({ where: { collaboratorId: { in: ids } } });
  await prisma.trainingRecord.deleteMany({ where: { collaboratorId: { in: ids } } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: ids } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
});

describe('status do RH na sincronização', () => {
  it('Afastado abre período e segue ATIVO no SGO; Aposentado trabalha normal (sem período)', async () => {
    lista = [pessoa('1', 'ELISANGELA AFASTADA', 'Afastado'), pessoa('2', 'GERALDA APOSENTADA', 'Aposentado')];
    expect(await syncCollaboratorsForUnit(admin(), unitId)).toMatchObject({ ok: true, created: 2 });
    const ela = await colab('1'); const ger = await colab('2');
    expect([ela.active, ger.active]).toEqual([true, true]);
    expect(await prisma.rhAfastamento.count({ where: { collaboratorId: ela.id } })).toBe(1);
    expect(await prisma.rhAfastamento.count({ where: { collaboratorId: ger.id } })).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { unitId, action: 'RH_SYNC_COLLABORATORS' }, orderBy: { createdAt: 'desc' } });
    expect(log?.metadata).toMatchObject({ afastamentosAbertos: 1 });
  });

  it('o período cresce a cada leitura; buraco de sync até 3 dias estende; além disso abre outro', async () => {
    const ela = await colab('1');
    expect(await estenderAfastamentoDoRh(ela.id, unitId, d('2026-10-01'), 'Afastado')).toBe('ABERTO');
    expect(await estenderAfastamentoDoRh(ela.id, unitId, d('2026-10-02'), 'Afastado')).toBe('ESTENDIDO');
    expect(await estenderAfastamentoDoRh(ela.id, unitId, d('2026-10-02'), 'Afastado')).toBe('JA_COBERTO');
    expect(await estenderAfastamentoDoRh(ela.id, unitId, d('2026-10-05'), 'Afastado')).toBe('ESTENDIDO');
    expect(await estenderAfastamentoDoRh(ela.id, unitId, d('2026-10-15'), 'Afastado')).toBe('ABERTO');
    expect(await prisma.rhAfastamento.count({ where: { collaboratorId: ela.id } })).toBe(2);
  });
});

describe('a Escala pergunta ao período de afastamento', () => {
  it('AF nos dois níveis só nos dias do período; fora dele vale o padrão', async () => {
    const ela = await colab('1');
    await prisma.employeeSchedule.create({ data: { collaboratorId: ela.id, unitId, scheduleType: 'SIX_ONE', anchorDate: d('2026-09-01'), startDate: d('2026-09-01'), active: true } });
    await prisma.rhAfastamento.create({ data: { collaboratorId: ela.id, unitId, startDate: d('2026-10-05'), endDate: d('2026-10-10'), rhStatus: 'Afastado' } });
    const r = (await getScheduleGrid(unitId, 2026, 10)).rows.find((x) => x.collaboratorId === ela.id)!;
    expect(r.days[4]).toEqual({ planned: 'AFASTADO', actual: 'AFASTADO' });
    expect(r.days[9]).toEqual({ planned: 'AFASTADO', actual: 'AFASTADO' });
    expect(r.days[3].planned).not.toBe('AFASTADO');
    expect(r.days[10].planned).not.toBe('AFASTADO');
  });

  it('férias vence afastamento; atestado dentro do afastamento continua atestado; "Puxar Realizado" não pisa', async () => {
    const ela = await colab('1');
    await prisma.rhAfastamento.create({ data: { collaboratorId: ela.id, unitId, startDate: d('2026-10-05'), endDate: d('2026-10-10'), rhStatus: 'Afastado' } });
    await prisma.vacation.create({ data: { collaboratorId: ela.id, unitId, startDate: d('2026-10-05'), endDate: d('2026-10-05'), status: 'CONFIRMED' } });
    await prisma.scheduleActual.create({ data: { collaboratorId: ela.id, unitId, date: d('2026-10-07'), status: 'ATESTADO', createdById: adminId } });
    expect((await fillActualFromPlan(admin(), { unitId, year: 2026, month: 10, mode: 'all' })).ok).toBe(true);
    const r = (await getScheduleGrid(unitId, 2026, 10)).rows.find((x) => x.collaboratorId === ela.id)!;
    expect(r.days[4].planned).toBe('FERIAS');
    expect(r.days[6].actual).toBe('ATESTADO');
    expect(r.days[8].actual).toBe('AFASTADO');
    await prisma.vacation.deleteMany({ where: { collaboratorId: ela.id } });
  });
});
