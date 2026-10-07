import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { editarPeriodoDeFerias, excluirPeriodoDeFerias, lancarPeriodoDeFerias, listarPeriodosDeFerias, ORIGEM_SGO } from '@/lib/people/ferias-periodo';
import { estenderFeriasDoRh, FERIAS_ORIGEM_RH } from '@/lib/rh/sync';
import { getScheduleGrid } from '@/lib/schedule';
import { registrarAbono } from '@/lib/people/abono';
import { getFeriasDoColaborador } from '@/lib/people/ferias-manual';
import { periodosAquisitivos } from '@/lib/people/periodo-aquisitivo';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Período de férias lançado à mão (v1.159.0). Cenário do Pedro: a API do RH só
 * diz que o Krissley ESTÁ de férias; a unidade sabe que é de 01/10 a 20/10 e que
 * ele vendeu os outros 10 dias. O lançado vira FE na Escala SÓ nesses dias (o
 * resto do mês segue o padrão), conta como gozado no período aquisitivo e não
 * briga com a sincronização do RH.
 */
const sfx = `fp${process.pid.toString(36)}`;
const d = (iso: string) => new Date(iso + 'T00:00:00Z');
let unitA: string, unitB: string, gerId: string, finId: string, colab: string, colabB: string;
const gerente = (): SessionUser => ({ id: gerId, name: 'Ger', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const gerenteB = (): SessionUser => ({ id: gerId, name: 'Ger B', role: 'MANAGER', unitIds: [unitB], seesAllUnits: false, needsTerms: false });
const financeiro = (): SessionUser => ({ id: finId, name: 'Fin', role: 'FINANCE', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `A-${sfx}`, name: `FP A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `B-${sfx}`, name: `FP B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerId = (await prisma.user.create({ data: { name: 'Ger', email: `g-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  finId = (await prisma.user.create({ data: { name: 'Fin', email: `f-${sfx}@example.com`, role: 'FINANCE', passwordHash: 'x' } })).id;
  colab = (await prisma.collaborator.create({ data: { name: `Krissley ${sfx}`, hireDate: '2023-06-03', source: 'RH', units: { create: [{ unitId: unitA }] } } })).id;
  colabB = (await prisma.collaborator.create({ data: { name: `Outro ${sfx}`, hireDate: '2024-01-10', units: { create: [{ unitId: unitB }] } } })).id;
  await prisma.employeeSchedule.create({ data: { collaboratorId: colab, unitId: unitA, scheduleType: 'SIX_ONE', anchorDate: d('2026-09-01'), startDate: d('2026-09-01'), active: true } });
});

afterAll(async () => {
  await prisma.vacationAbono.deleteMany({ where: { collaboratorId: { in: [colab, colabB] } } });
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: [colab, colabB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerId, finId] } } });
  await prisma.$disconnect();
});

describe('lançar período', () => {
  it('quem pode e o que é válido', async () => {
    expect(await lancarPeriodoDeFerias(financeiro(), { collaboratorId: colab, startDate: '2026-10-01', endDate: '2026-10-20' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await lancarPeriodoDeFerias(gerenteB(), { collaboratorId: colab, startDate: '2026-10-01', endDate: '2026-10-20' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await lancarPeriodoDeFerias(gerente(), { collaboratorId: colab, startDate: '2026-10-20', endDate: '2026-10-01' })).toEqual({ ok: false, reason: 'INVALID' });
    expect(await lancarPeriodoDeFerias(gerente(), { collaboratorId: colab, startDate: '2026-10-01', endDate: '2027-01-15' })).toEqual({ ok: false, reason: 'INVALID' });
    expect(await lancarPeriodoDeFerias(gerente(), { collaboratorId: 'nao-existe', startDate: '2026-10-01', endDate: '2026-10-20' })).toEqual({ ok: false, reason: 'NAO_ENCONTRADO' });
  });

  it('Krissley 01/10–20/10 SUBSTITUI o período que o sync do RH abriu e vira FE só nesses dias', async () => {
    // o sync viu "Férias" em 05/10 e vinha esticando até 07/10
    await prisma.vacation.create({ data: { collaboratorId: colab, unitId: unitA, startDate: d('2026-10-05'), endDate: d('2026-10-07'), status: 'CONFIRMED', source: FERIAS_ORIGEM_RH } });
    const r = await lancarPeriodoDeFerias(gerente(), { collaboratorId: colab, startDate: '2026-10-01', endDate: '2026-10-20', note: 'aviso de férias' });
    expect(r).toMatchObject({ ok: true, substituiuRh: 1, confirmouSolicitada: false });
    const vs = await prisma.vacation.findMany({ where: { collaboratorId: colab } });
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ status: 'CONFIRMED', source: ORIGEM_SGO, startDate: d('2026-10-01'), endDate: d('2026-10-20') });

    const row = (await getScheduleGrid(unitA, 2026, 10)).rows.find((x) => x.collaboratorId === colab)!;
    expect(row.days[0]).toEqual({ planned: 'FERIAS', actual: 'FERIAS' }); // 01/10
    expect(row.days[19]).toEqual({ planned: 'FERIAS', actual: 'FERIAS' }); // 20/10
    expect(row.days[20].planned).not.toBe('FERIAS'); // 21/10 volta ao padrão 6x1
    expect(row.days[20].planned).not.toBeNull();
    expect(row.days[30].planned).not.toBe('FERIAS'); // 31/10
    const log = await prisma.auditLog.findFirst({ where: { unitId: unitA, action: 'VACATION_MANUAL_CREATE' } });
    expect(log?.metadata).toMatchObject({ start: '2026-10-01', end: '2026-10-20', dias: 20, substituiuRh: ['2026-10-05..2026-10-07'] });
  });

  it('a comunicação com o RH segue: coberto hoje → o sync não abre outro período', async () => {
    expect(await estenderFeriasDoRh(colab, unitA, d('2026-10-10'))).toBe('JA_COBERTO');
    expect(await prisma.vacation.count({ where: { collaboratorId: colab } })).toBe(1);
  });

  it('20 gozados + 10 vendidos = período aquisitivo QUITADO', async () => {
    expect((await registrarAbono(gerente(), { collaboratorId: colab, periodoInicio: '2025-06-03', dias: 10 })).ok).toBe(true);
    // regra de sempre (v1.153.0): férias em andamento contam ATÉ HOJE — o período só quita em 20/10
    const ficha = await getFeriasDoColaborador(gerente(), colab);
    const p = ficha!.periodos.find((x) => x.inicio === '2025-06-03')!;
    expect(p.diasVendidos).toBe(10);
    expect(p.diasGozados + p.saldo).toBe(20);
    // em 21/10 (função pura, mesma conta da tela): 20 gozados + 10 vendidos = QUITADO
    const depois = periodosAquisitivos('2023-06-03', [{ inicio: '2026-10-01', fim: '2026-10-20' }], '2026-10-21', undefined, [{ periodoInicio: '2025-06-03', dias: 10 }]);
    expect(depois.find((x) => x.inicio === '2025-06-03')).toMatchObject({ diasGozados: 20, diasVendidos: 10, saldo: 0, situacao: 'QUITADO' });
  });

  it('cruzar outro período lançado aqui é recusado com o período em questão', async () => {
    const r = await lancarPeriodoDeFerias(gerente(), { collaboratorId: colab, startDate: '2026-10-15', endDate: '2026-10-25' });
    expect(r).toEqual({ ok: false, reason: 'SOBREPOE', detalhe: '01/10/2026 a 20/10/2026' });
  });

  it('férias SOLICITADA ao RH que cruza o lançado vira CONFIRMADA com as datas lançadas (sem duplicar)', async () => {
    const pedida = await prisma.vacation.create({ data: { collaboratorId: colab, unitId: unitA, startDate: d('2026-12-01'), endDate: d('2026-12-10'), status: 'REQUESTED' } });
    const r = await lancarPeriodoDeFerias(gerente(), { collaboratorId: colab, startDate: '2026-12-01', endDate: '2026-12-12' });
    expect(r).toMatchObject({ ok: true, id: pedida.id, confirmouSolicitada: true });
    expect(await prisma.vacation.findUniqueOrThrow({ where: { id: pedida.id } })).toMatchObject({ status: 'CONFIRMED', endDate: d('2026-12-12') });
    expect(await prisma.vacation.count({ where: { collaboratorId: colab } })).toBe(2);
  });

  it('a lista do alcance mostra origem, dias e situação', async () => {
    const lista = await listarPeriodosDeFerias(gerente(), unitA, 12, new Date('2026-10-10T12:00:00Z'));
    const out = lista.find((p) => p.inicio === '2026-10-01')!;
    expect(out).toMatchObject({ colaborador: `Krissley ${sfx}`, dias: 20, origem: 'SGO', emGozo: true, futura: false });
    expect(lista.find((p) => p.inicio === '2026-12-01')).toMatchObject({ futura: true, origem: 'SGO' });
    expect(await listarPeriodosDeFerias(gerenteB(), unitB)).toEqual([]);
  });
});

describe('editar e excluir', () => {
  it('editar o período aberto pelo RH fixa o fim: o sync deixa de esticá-lo', async () => {
    const rh = await prisma.vacation.create({ data: { collaboratorId: colabB, unitId: unitB, startDate: d('2026-11-03'), endDate: d('2026-11-05'), status: 'CONFIRMED', source: FERIAS_ORIGEM_RH } });
    expect(await editarPeriodoDeFerias(gerente(), rh.id, { startDate: '2026-11-01', endDate: '2026-11-15' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect((await editarPeriodoDeFerias(gerenteB(), rh.id, { startDate: '2026-11-01', endDate: '2026-11-15', note: 'confirmado com o RH' })).ok).toBe(true);
    expect(await prisma.vacation.findUniqueOrThrow({ where: { id: rh.id } })).toMatchObject({ source: ORIGEM_SGO, startDate: d('2026-11-01'), endDate: d('2026-11-15'), changeNote: 'confirmado com o RH' });
    // RH continua dizendo "Férias" em 16/11: o período fixado NÃO cresce; o sync abre outro, visível, a partir de 16/11
    expect(await estenderFeriasDoRh(colabB, unitB, d('2026-11-16'))).toBe('ABERTO');
    expect((await prisma.vacation.findUniqueOrThrow({ where: { id: rh.id } })).endDate).toEqual(d('2026-11-15'));
    expect(await prisma.vacation.count({ where: { collaboratorId: colabB } })).toBe(2);
  });

  it('excluir só no alcance, com auditoria', async () => {
    const novo = await prisma.vacation.findFirstOrThrow({ where: { collaboratorId: colabB, source: FERIAS_ORIGEM_RH } });
    expect(await excluirPeriodoDeFerias(gerente(), novo.id)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await excluirPeriodoDeFerias(gerenteB(), novo.id)).toEqual({ ok: true });
    expect(await prisma.vacation.count({ where: { collaboratorId: colabB } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { unitId: unitB, action: 'VACATION_MANUAL_DELETE' } })).toBe(1);
  });
});
