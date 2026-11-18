import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { fatosDaUnidade } from '@/lib/metas/nota-individual-dados';
import { componentePorPlantao, individuaisDoGerente } from '@/lib/metas/nota-individual';

/**
 * Nota individual (v1.215.0): os fatos do mês lidos do banco — por dia e por
 * autor — e a Escala de gerentes. Mês FECHADO (setembro/2026: dia 1 é terça),
 * para todos os dias contarem como decorridos.
 */
const sfx = `ni${process.pid.toString(36)}`;
const ym = '2026-09';
let unit: string; let ana: string; let bia: string; let caixa: string; let comm: string;

beforeAll(async () => {
  unit = (await prisma.unit.create({ data: { code: `NI-${sfx}`, name: `Nota Ind ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  ana = (await prisma.user.create({ data: { name: `Ana ${sfx}`, email: `ana-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  bia = (await prisma.user.create({ data: { name: `Bia ${sfx}`, email: `bia-${sfx}@example.com`, role: 'COORDINATOR', passwordHash: 'x' } })).id;
  caixa = (await prisma.user.create({ data: { name: `Cx ${sfx}`, email: `cx-${sfx}@example.com`, role: 'CASHIER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: ana, unitId: unit }, { userId: bia, unitId: unit }, { userId: caixa, unitId: unit }] });
  /* Ana: seg–sex. Bia: sem horário, folga no dia 2. */
  await prisma.managerWorkSchedule.create({ data: { userId: ana, weekdays: [1, 2, 3, 4, 5] } });
  await prisma.managerLeave.create({ data: { userId: bia, startDate: `${ym}-02`, endDate: `${ym}-02`, createdById: bia } });

  const tpl = await prisma.taskTemplate.create({ data: { unitId: unit, name: `T ${sfx}`, limitTime: '10:00' } });
  const fora = await prisma.taskTemplate.create({ data: { unitId: unit, name: `Fora ${sfx}`, limitTime: '10:00', entersMeta: false } });
  const t = (templateId: string, dia: string, status: 'DONE' | 'MISSED' | 'LATE', por?: string) => ({ templateId, unitId: unit, operationalDate: `${ym}-${dia}`, dueAt: new Date(), status, completedById: por ?? null });
  await prisma.taskInstance.createMany({ data: [
    t(tpl.id, '01', 'DONE', ana),
    t(tpl.id, '05', 'MISSED'), // sábado: só a Bia está de plantão
    t(tpl.id, '07', 'DONE', caixa),
    t(tpl.id, '08', 'LATE', ana), // fora do prazo não entra na conta da meta
    t(fora.id, '01', 'MISSED'), // checklist que não entra na meta
  ] });
  await prisma.wasteEntry.create({ data: { unitId: unit, operationalDate: `${ym}-01`, createdById: ana } });
  await prisma.commandCount.create({ data: { unitId: unit, operationalDate: `${ym}-02`, createdById: caixa } });
  await prisma.cashVaultMovement.create({ data: { unitId: unit, type: 'COUNT', deltas: {}, totalIn: 0, totalOut: 0, createdById: bia, createdByName: 'Bia', createdAt: new Date(`${ym}-03T15:00:00Z`) } });

  comm = (await prisma.communication.create({ data: { title: `C ${sfx}`, body: 'x', dueAt: new Date(`${ym}-10T12:00:00Z`) } })).id;
  await prisma.communicationRecipient.createMany({ data: [
    { communicationId: comm, userId: ana, unitId: unit, status: 'CONFIRMED', late: false },
    { communicationId: comm, userId: bia, unitId: unit, status: 'PENDING' },
  ] });
});
afterAll(async () => {
  await prisma.communication.deleteMany({ where: { id: comm } });
  await prisma.cashVaultMovement.deleteMany({ where: { unitId: unit } });
  await prisma.commandCount.deleteMany({ where: { unitId: unit } });
  await prisma.wasteEntry.deleteMany({ where: { unitId: unit } });
  await prisma.taskInstance.deleteMany({ where: { unitId: unit } });
  await prisma.taskTemplate.deleteMany({ where: { unitId: unit } });
  await prisma.managerLeave.deleteMany({ where: { userId: { in: [ana, bia] } } });
  await prisma.managerWorkSchedule.deleteMany({ where: { userId: { in: [ana, bia] } } });
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [ana, bia, caixa] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ana, bia, caixa] } } });
  await prisma.unit.deleteMany({ where: { id: unit } });
});

describe('fatosDaUnidade', () => {
  it('gerentes da unidade com horário e ausências; o caixa não é gerente', async () => {
    const f = await fatosDaUnidade(unit, ym);
    expect(f.gerentes.map((g) => g.userId).sort()).toEqual([ana, bia].sort());
    expect(f.gerentes.find((g) => g.userId === ana)!.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(f.gerentes.find((g) => g.userId === bia)).toMatchObject({ weekdays: [], ausencias: [{ startDate: `${ym}-02`, endDate: `${ym}-02` }] });
  });

  it('checklists por dia e autor: só o que entra na meta, só realizado × não realizado', async () => {
    const f = await fatosDaUnidade(unit, ym);
    const dias = f.porDia.TASKS.sort((a, b) => a.dia.localeCompare(b.dia));
    expect(dias.map((d) => [d.dia.slice(8), d.feitos, d.devidos])).toEqual([['01', 1, 1], ['05', 0, 1], ['07', 1, 1]]);
    expect(dias[0].porAutor).toEqual({ [ana]: 1 });
    /* Ana: dias 1 e 7 (o sábado 5 não é dela) → 100%. Bia: dias 1, 5 e 7 → 67%, sem nada feito por ela → reduzido a 0. */
    expect(componentePorPlantao(dias, ana, f.gerentes)).toMatchObject({ diasDePlantao: 2, pctNosDias: 100, scorePct: 100 });
    expect(componentePorPlantao(dias, bia, f.gerentes)).toMatchObject({ diasDePlantao: 3, pctNosDias: 67, participacaoPct: 0, scorePct: 0 });
  });

  it('desperdício, comandas e cofre: um dia devido por dia do mês, com o autor do lançamento', async () => {
    const f = await fatosDaUnidade(unit, ym);
    expect(f.porDia.WASTE).toHaveLength(30);
    expect(f.porDia.WASTE.filter((d) => d.feitos === 1).map((d) => d.dia)).toEqual([`${ym}-01`]);
    expect(f.porDia.WASTE[0].porAutor).toEqual({ [ana]: 1 });
    expect(f.porDia.COMMANDS.find((d) => d.dia === `${ym}-02`)).toMatchObject({ feitos: 1, porAutor: { [caixa]: 1 } });
    expect(f.porDia.CASH.find((d) => d.dia === `${ym}-03`)).toMatchObject({ feitos: 1, porAutor: { [bia]: 1 } });
    /* Ana tem 22 dias úteis em setembro/2026 e lançou 1 desperdício. */
    expect(componentePorPlantao(f.porDia.WASTE, ana, f.gerentes)).toMatchObject({ diasDePlantao: 22, done: 1, missed: 21 });
  });

  it('comunicados são da pessoa: confirmado no prazo × vencido sem confirmar', async () => {
    const f = await fatosDaUnidade(unit, ym);
    const a = individuaisDoGerente(f, ana)!;
    const b = individuaisDoGerente(f, bia)!;
    expect(a.COMMUNICATION).toMatchObject({ done: 1, missed: 0, scorePct: 100 });
    expect(b.COMMUNICATION).toMatchObject({ done: 0, missed: 1, scorePct: 0 });
    expect(individuaisDoGerente(f, caixa)).toBeNull();
  });
});
