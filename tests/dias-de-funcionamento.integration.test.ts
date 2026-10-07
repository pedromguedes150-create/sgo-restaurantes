import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { generateDailyTasksForUnit } from '@/lib/tasks/generate';
import { updateUnit } from '@/lib/admin';
import { contarNaoRealizadosEmDiasFechados, limparNaoRealizadosEmDiasFechados } from '@/lib/units/nao-realizados-em-dias-fechados';
import { diaDaSemana, funcionaNoDia, normalizarDias, rotuloDosDias, diasFechados } from '@/lib/units/dias-de-funcionamento';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Dias de funcionamento da unidade (v1.157.0) — pedido do Pedro: a unidade
 * Produtos abre de segunda a sexta e o SGO dava como "não realizados" os
 * checklists de sábado e domingo.
 */
const SAB = '2027-01-02';
const DOM = '2027-01-03';
const SEG = '2027-01-04';

describe('regra pura', () => {
  it('dia da semana e funciona no dia', () => {
    expect([diaDaSemana(SAB), diaDaSemana(DOM), diaDaSemana(SEG)]).toEqual([6, 0, 1]);
    expect(funcionaNoDia([1, 2, 3, 4, 5], SAB)).toBe(false);
    expect(funcionaNoDia([1, 2, 3, 4, 5], SEG)).toBe(true);
    // sem a informação, a unidade NUNCA para de gerar em silêncio
    expect(funcionaNoDia([], SAB)).toBe(true);
    expect(funcionaNoDia(null, DOM)).toBe(true);
  });
  it('valida o que vem do corpo', () => {
    expect(normalizarDias([5, 1, 1, 3])).toEqual([1, 3, 5]);
    expect(normalizarDias([])).toBeNull();
    expect(normalizarDias([7])).toBeNull();
    expect(normalizarDias([1.5])).toBeNull();
    expect(normalizarDias('1,2')).toBeNull();
  });
  it('rótulo curto e dias fechados', () => {
    expect(rotuloDosDias([1, 2, 3, 4, 5])).toBe('Seg a Sex');
    expect(rotuloDosDias([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
    expect(rotuloDosDias([1, 3, 5])).toBe('Seg, Qua, Sex');
    expect(diasFechados([1, 2, 3, 4, 5])).toEqual([0, 6]);
  });
});

const sfx = `df${process.pid.toString(36)}`;
let unitId: string, templateId: string, adminId: string;
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `DF-${sfx}`, name: `Produtos ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  templateId = (await prisma.taskTemplate.create({ data: { unitId, name: `Abertura ${sfx}` } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm DF', email: `adm-${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.taskInstance.deleteMany({ where: { unitId } });
  await prisma.taskTemplate.deleteMany({ where: { unitId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe('geração e limpeza', () => {
  it('unidade nova funciona todos os dias (padrão) e gera no sábado', async () => {
    const u = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(u.operatingDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(await generateDailyTasksForUnit(u, SAB)).toBe(1);
  });

  it('só o Admin muda os dias, e pelo menos um dia', async () => {
    const ger: SessionUser = { id: adminId, name: 'G', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false };
    expect((await updateUnit(ger, unitId, { operatingDays: [1, 2, 3, 4, 5] })).ok).toBe(false);
    expect(await updateUnit(admin(), unitId, { operatingDays: [] })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect((await updateUnit(admin(), unitId, { operatingDays: [5, 4, 3, 2, 1] })).ok).toBe(true);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).operatingDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('de segunda a sexta: domingo não gera, segunda gera (com e sem os dias no objeto)', async () => {
    const u = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(await generateDailyTasksForUnit(u, DOM)).toBe(0);
    expect(await generateDailyTasksForUnit({ id: u.id, timezone: u.timezone, cutoffHour: u.cutoffHour }, DOM)).toBe(0);
    expect(await generateDailyTasksForUnit(u, SEG)).toBe(1);
    expect(await prisma.taskInstance.count({ where: { unitId, operationalDate: DOM } })).toBe(0);
  });

  it('remove só os "não realizados" de dias fechados; concluído e dia útil ficam', async () => {
    // o sábado gerado antes da mudança vira "não realizado"; um domingo foi trabalhado
    await prisma.taskInstance.updateMany({ where: { unitId, operationalDate: SAB }, data: { status: 'MISSED' } });
    await prisma.taskInstance.updateMany({ where: { unitId, operationalDate: SEG }, data: { status: 'MISSED' } });
    await prisma.taskInstance.create({ data: { templateId, unitId, operationalDate: '2027-01-10', dueAt: new Date('2027-01-10T23:59:00Z'), status: 'DONE', completedAt: new Date() } });

    expect(await contarNaoRealizadosEmDiasFechados(unitId)).toBe(1);
    const ger: SessionUser = { id: adminId, name: 'G', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false };
    expect(await limparNaoRealizadosEmDiasFechados(ger, unitId)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await limparNaoRealizadosEmDiasFechados(admin(), unitId)).toEqual({ ok: true, removidos: 1 });

    const restantes = await prisma.taskInstance.findMany({ where: { unitId }, select: { operationalDate: true, status: true }, orderBy: { operationalDate: 'asc' } });
    expect(restantes).toEqual([{ operationalDate: SEG, status: 'MISSED' }, { operationalDate: '2027-01-10', status: 'DONE' }]);
    const log = await prisma.auditLog.findFirst({ where: { unitId, action: 'TASKS_CLOSED_DAYS_CLEANUP' } });
    expect(log?.metadata).toMatchObject({ removidos: 1, de: SAB, ate: SAB });
  });
});
