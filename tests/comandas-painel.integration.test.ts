import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getPainelDeComandas, resultadoOperacional } from '@/lib/commands/painel';
import { getCommandsCoverage } from '@/lib/metas/config';
import { addReplacement, confirmarRecebimentoReposicao } from '@/lib/commands/lifecycle';
import { getActiveSequence } from '@/lib/commands/active';
import { submitCount } from '@/lib/commands/count';
import type { SessionUser } from '@/lib/auth/session';

/**
 * v1.202.0 — recebimento físico da reposição, painel (rotina × resultado) e a
 * cobertura de Metas sobre os dias previstos.
 */

const sfx = `pn${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let admId: string;
let gerId: string;
let caixaId: string;

const adm = (): SessionUser => ({ id: admId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const ger = (): SessionUser => ({ id: gerId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const caixa = (): SessionUser => ({ id: caixaId, name: 'Cx', role: 'CASHIER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const fora = (): SessionUser => ({ id: gerId, name: 'Ger', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `PN-${sfx}`, name: 'U Painel', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  admId = (await prisma.user.create({ data: { name: 'A', email: `a-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  gerId = (await prisma.user.create({ data: { name: 'G', email: `g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  caixaId = (await prisma.user.create({ data: { name: 'C', email: `c-${sfx}@t.local`, role: 'CASHIER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: gerId, unitId }, { userId: caixaId, unitId }] });
  await prisma.commandSequence.create({ data: { unitId, name: 'Salão', rangeStart: 1, rangeEnd: 10, order: 0 } });
});
afterAll(async () => {
  await prisma.commandReplacement.deleteMany({ where: { unitId } });
  await prisma.commandDivergence.deleteMany({ where: { unitId } });
  await prisma.commandCount.deleteMany({ where: { unitId } });
  await prisma.commandSchedule.deleteMany({ where: { unitId } });
  await prisma.commandScheduleException.deleteMany({ where: { unitId } });
  await prisma.commandSequence.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unitMembership.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [admId, gerId, caixaId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('recebimento físico da reposição', () => {
  it('nasce aguardando: fora da conta e sem virar faltante', async () => {
    expect((await addReplacement(adm(), unitId, 500, 'comanda nova')).ok).toBe(true);
    const seq = await getActiveSequence(unitId, { ignorarProgramacao: true });
    expect(seq.all.has(500)).toBe(false);
    expect(seq.replacementsPending).toEqual([500]);
    const r = await submitCount(ger(), { unitId, allPresent: true, operationalDate: '2026-11-02' });
    expect(r.ok && r.absent).toEqual([]); // 500 não é faltante
  });

  it('gerente e caixa confirmam; de fora da unidade não; idempotente', async () => {
    expect((await confirmarRecebimentoReposicao(fora(), unitId, 500, undefined)).ok).toBe(false);
    expect((await confirmarRecebimentoReposicao(caixa(), unitId, 500, 'chegou na caixa')).ok).toBe(true);
    const antes = await prisma.commandReplacement.findUnique({ where: { unitId_number: { unitId, number: 500 } } });
    expect(antes?.receivedByName).toBe('Cx');
    expect((await confirmarRecebimentoReposicao(ger(), unitId, 500, 'de novo')).ok).toBe(true);
    const depois = await prisma.commandReplacement.findUnique({ where: { unitId_number: { unitId, number: 500 } } });
    expect(depois?.receivedById).toBe(caixaId); // não reescreve quem recebeu
    const seq = await getActiveSequence(unitId, { ignorarProgramacao: true });
    expect(seq.active.has(500)).toBe(true);
    expect(seq.replacementsPending).toEqual([]);
  });

  it('número sem reposição cadastrada: não encontrado', async () => {
    const r = await confirmarRecebimentoReposicao(ger(), unitId, 777, undefined);
    expect(r.ok).toBe(false);
  });
});

describe('painel e Metas', () => {
  it('sem programação, a cobertura de Metas é a de sempre (dias com contagem ÷ decorridos)', async () => {
    const ym = '2026-10'; // mês passado inteiro: 31 dias decorridos
    await prisma.commandCount.createMany({ data: ['2026-10-01', '2026-10-02', '2026-10-03'].map((operationalDate) => ({ unitId, operationalDate, allPresent: true, absentCount: 0 })) });
    const c = await getCommandsCoverage(unitId, ym);
    expect(c).toEqual({ done: 3, missed: 28 });
  });

  it('com programação, só os dias previstos cobram', async () => {
    /* 2026-10: 5 quartas (07, 14, 21, 28 e... 4 quartas: 7, 14, 21, 28). Programa só quartas. */
    await prisma.commandSchedule.create({ data: { unitId, name: 'Quarta', type: 'COMPLETA', weekdays: [3] } });
    await prisma.commandCount.deleteMany({ where: { unitId } });
    await prisma.commandCount.createMany({ data: ['2026-10-07', '2026-10-14', '2026-10-02'].map((operationalDate) => ({ unitId, operationalDate, allPresent: true, absentCount: 0 })) });
    const c = await getCommandsCoverage(unitId, '2026-10');
    /* 4 quartas previstas, 2 feitas; o dia 02 (sexta, não previsto) não rende nada */
    expect(c).toEqual({ done: 2, missed: 2 });
    /* feriado numa quarta sem conferência: sai da conta */
    await prisma.commandScheduleException.create({ data: { unitId, date: '2026-10-28', name: 'Feriado', skip: true } });
    expect(await getCommandsCoverage(unitId, '2026-10')).toEqual({ done: 2, missed: 1 });
  });

  it('o painel traz rotina e resultado por unidade, só das unidades do usuário', async () => {
    const linhas = await getPainelDeComandas(adm(), '2026-10', unitId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].rotina).toMatchObject({ previstas: 3, realizadas: 2, atrasadas: 1 });
    expect(linhas[0].reposicoesPendentes).toBe(0);
    expect((await getPainelDeComandas(fora(), '2026-10', unitId))).toHaveLength(0);
  });

  it('resultado operacional conta abertas, a validar, recuperadas e perdas do mês', async () => {
    const agora = new Date();
    const ym = agora.toISOString().slice(0, 7);
    await prisma.commandDivergence.create({ data: { unitId, number: 1, status: 'OPEN', createdById: gerId } });
    await prisma.commandDivergence.create({ data: { unitId, number: 2, status: 'INVESTIGATING', needsValidation: true, createdById: gerId } });
    await prisma.commandDivergence.create({ data: { unitId, number: 3, status: 'CLOSED', outcome: 'RECOVERED', createdById: gerId, resolvedAt: agora } });
    await prisma.commandDivergence.create({ data: { unitId, number: 4, status: 'CLOSED', outcome: 'LOST', createdById: gerId, resolvedAt: agora } });
    const r = await resultadoOperacional(unitId, ym);
    expect(r).toMatchObject({ abertas: 1, aguardandoValidacao: 1, recuperadas: 1, perdasDefinitivas: 1 });
  });
});
