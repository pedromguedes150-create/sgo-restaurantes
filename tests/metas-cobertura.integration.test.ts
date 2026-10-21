import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  getChecklistsCoverage, getCashCoverage, getScheduleCoverage, getCancellationsCoverage, getStockCoverage, getInventoryCoverage, getTasksMetaWeight,
} from '@/lib/metas/config';
import { componentesDaMeta, descontosDaMeta, NOME_CHECKLISTS } from '@/lib/metas/componentes';
import { pontuar, diaEmBrasilia } from '@/lib/metas/pontuacao';
import { somarDias } from '@/lib/stock/validade';
import { getUnitMonthScore } from '@/lib/tasks/summary';
import { getMetaBreakdown } from '@/lib/metas/query';

/**
 * META v1.174.0 — as coberturas lidas do banco, no MÊS PASSADO (fechado, para
 * a conta não depender do dia em que o teste roda): checklists com um peso só,
 * cofre, Escala, cancelamentos, validade e inventário. E a nota e o
 * detalhamento saindo da MESMA lista.
 */

const sfx = `mcv${process.pid.toString(36)}`;
const hoje = diaEmBrasilia(new Date());
/* mês passado: 'AAAA-MM' */
const ym = (() => { const [y, m] = hoje.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); })();
const dia = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;
const diasDoMes = (() => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); })();

let unitId = ''; let unitVazia = ''; let userId = ''; let colabId = ''; let productId = '';
const lotIds: string[] = [];

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `MCV-${sfx}`, name: `Cobertura ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitVazia = (await prisma.unit.create({ data: { code: `MCV-V-${sfx}`, name: `Vazia ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: `Ger ${sfx}`, email: `ger.${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  colabId = (await prisma.collaborator.create({ data: { name: `Colab ${sfx}`, active: true } })).id;
  await prisma.collaboratorUnit.create({ data: { collaboratorId: colabId, unitId } });
  productId = (await prisma.product.create({ data: { name: `Molho ${sfx}`, origin: 'LOCAL', alertDays: 30 } })).id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.stockMovement.deleteMany({ where: { unitId } });
  await prisma.stockLot.deleteMany({ where: { id: { in: lotIds } } });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.cashVaultMovement.deleteMany({ where: { unitId } });
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId: colabId } });
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: colabId } });
  await prisma.collaborator.delete({ where: { id: colabId } });
  await prisma.cancellation.deleteMany({ where: { unitId } });
  await prisma.inventorySchedule.deleteMany({ where: { unitId } });
  await prisma.taskInstance.deleteMany({ where: { unitId } });
  await prisma.taskTemplate.deleteMany({ where: { unitId } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, unitVazia] } } });
  await prisma.user.delete({ where: { id: userId } });
});

describe('Checklists do dia com UM peso', () => {
  it('3 feitas de 4 = 75%, mesmo com os pesos antigos 10 e 90 gravados nos checklists — cada instância vale igual', async () => {
    const a = await prisma.taskTemplate.create({ data: { name: `Abertura ${sfx}`, unitId, entersMeta: true, weight: 10 } });
    const b = await prisma.taskTemplate.create({ data: { name: `Fechamento ${sfx}`, unitId, entersMeta: true, weight: 90 } });
    const fora = await prisma.taskTemplate.create({ data: { name: `Fora da meta ${sfx}`, unitId, entersMeta: false, weight: 50 } });
    const inst = (templateId: string, d: number, status: 'DONE' | 'MISSED') => prisma.taskInstance.create({ data: { templateId, unitId, operationalDate: dia(d), status, dueAt: new Date(`${dia(d)}T13:00:00Z`) } });
    await Promise.all([inst(a.id, 2, 'DONE'), inst(a.id, 3, 'DONE'), inst(a.id, 4, 'MISSED'), inst(b.id, 2, 'DONE'), inst(fora.id, 2, 'MISSED')]);

    expect(await getChecklistsCoverage(unitId, ym)).toEqual({ done: 3, missed: 1 });

    const linhas = await getMetaBreakdown(unitId, ym);
    const chk = linhas.find((l) => l.name === NOME_CHECKLISTS);
    expect(chk).toMatchObject({ done: 3, resolved: 4, scorePct: 75, weight: await getTasksMetaWeight() });
    expect(chk?.tipo).toBeUndefined();
    /* o detalhe por checklist continua, informativo (peso 0, tipo DETALHE), em ordem alfabética */
    const det = linhas.filter((l) => l.tipo === 'DETALHE');
    expect(det.map((l) => [l.name, l.done, l.resolved, l.scorePct])).toEqual([[`Abertura ${sfx}`, 2, 3, 67], [`Fechamento ${sfx}`, 1, 1, 100]]);
    expect(det.every((l) => l.weight === 0)).toBe(true);
  });

  it('a nota e o detalhamento saem da MESMA lista de componentes', async () => {
    const [componentes, descontos, score] = await Promise.all([componentesDaMeta(unitId, ym), descontosDaMeta(unitId, ym), getUnitMonthScore(unitId, ym)]);
    expect(score).toEqual(pontuar(componentes, descontos.lista));
    const tasks = componentes.find((c) => c.key === 'TASKS');
    expect(tasks).toMatchObject({ done: 3, missed: 1 });
    /* 11 componentes, sempre na lista (com peso 0 ficam fora da conta, não da lista) */
    expect(componentes.map((c) => c.key)).toEqual(['TASKS', 'TRAINING', 'COMMUNICATION', 'PEOPLE_EVALUATION', 'WASTE', 'COMMANDS', 'CASH', 'SCHEDULE', 'CANCELLATIONS', 'STOCK', 'INVENTORY', 'UTENSILS']);
  });
});

describe('coberturas na mão do gerente (mês passado, fechado)', () => {
  it('Gestão de Troco: dias com CONTAGEM do cofre ÷ dias do mês — duas contagens no mesmo dia contam um dia; reposição não conta', async () => {
    const mov = (type: 'COUNT' | 'REFILL', d: number, h: string) => prisma.cashVaultMovement.create({ data: { unitId, type, deltas: {}, totalIn: 0, totalOut: 0, createdById: userId, createdByName: 'Ger', createdAt: new Date(`${dia(d)}T${h}:00Z`) } });
    await Promise.all([mov('COUNT', 3, '12:00'), mov('COUNT', 3, '21:00'), mov('COUNT', 5, '12:00'), mov('REFILL', 7, '12:00')]);
    /* 23h de Brasília do dia 9 = 02h UTC do dia 10: conta no dia 9 */
    await mov('COUNT', 10, '02:00');
    expect(await getCashCoverage(unitId, ym)).toEqual({ done: 3, missed: diasDoMes - 3 });
    expect(await getCashCoverage(unitVazia, ym)).toEqual({ done: 0, missed: diasDoMes });
  });

  it('Escala: dias com o Realizado preenchido ÷ dias do mês; unidade sem colaborador ativo não entra (0/0)', async () => {
    const [y, m] = ym.split('-').map(Number);
    const at = (d: number, status: 'WORK' | 'OFF') => prisma.scheduleActual.create({ data: { collaboratorId: colabId, unitId, date: new Date(Date.UTC(y, m - 1, d, 12)), status } });
    await Promise.all([at(1, 'WORK'), at(2, 'OFF'), at(3, 'WORK')]);
    expect(await getScheduleCoverage(unitId, ym)).toEqual({ done: 3, missed: diasDoMes - 3 });
    expect(await getScheduleCoverage(unitVazia, ym)).toEqual({ done: 0, missed: 0 });
  });

  it('Cancelamentos: justificados ÷ cancelados do mês; mês sem cancelamento fica fora', async () => {
    const canc = (d: number, status: 'PENDING' | 'JUSTIFIED', n: string) => prisma.cancellation.create({ data: { unitId, operationalDate: dia(d), couponNumber: `${n}-${sfx}`, value: 10, status } });
    await Promise.all([canc(2, 'JUSTIFIED', 'a'), canc(2, 'JUSTIFIED', 'b'), canc(4, 'PENDING', 'c')]);
    expect(await getCancellationsCoverage(unitId, ym)).toEqual({ done: 2, missed: 1 });
    expect(await getCancellationsCoverage(unitVazia, ym)).toEqual({ done: 0, missed: 0 });
  });

  it('Inventário: confirmados ÷ agendados com data passada; o agendado para o futuro ainda não cobra', async () => {
    const ag = (d: string, status: 'PENDING' | 'DONE' | 'MISSED') => prisma.inventorySchedule.create({ data: { unitId, categoryName: 'Bebidas', scheduledDate: d, status } });
    await Promise.all([ag(dia(5), 'DONE'), ag(dia(6), 'DONE'), ag(dia(7), 'PENDING'), ag(dia(8), 'MISSED')]);
    expect(await getInventoryCoverage(unitId, ym)).toEqual({ done: 2, missed: 2 });
    /* no mês CORRENTE um agendamento para daqui a 3 dias não conta */
    await ag(somarDias(hoje, 3), 'PENDING');
    expect(await getInventoryCoverage(unitId, hoje.slice(0, 7))).toEqual({ done: 0, missed: 0 });
    expect(await getInventoryCoverage(unitVazia, ym)).toEqual({ done: 0, missed: 0 });
  });

  it('Estoque: respondidas no mês (Auditoria) ÷ (respondidas + pendentes que entraram na faixa no mês); lote já respondido na faixa atual não é pendência', async () => {
    const lote = (expiresAt: string, lastReviewBand: string | null) => prisma.stockLot.create({ data: { unitId, productId, qtyReceived: 10, qtyOnHand: 10, createdByName: 'Ger', expiresAt, lastReviewBand, status: 'OPEN' } });
    /* venceu no dia 10 do mês passado e ninguém respondeu: entrou em VENCIDO no dia 11 → pendente DAQUELE mês */
    lotIds.push((await lote(dia(10), null)).id);
    /* o mesmo, mas a faixa VENCIDO já foi respondida: nada pendente */
    lotIds.push((await lote(dia(12), 'VENCIDO')).id);
    /* duas tratativas respondidas no mês passado */
    await prisma.auditLog.createMany({ data: [
      { unitId, action: 'STOCK_LOT_REVIEW', module: 'STOCK', createdAt: new Date(`${dia(15)}T14:00:00Z`) },
      { unitId, action: 'STOCK_LOT_REVIEW', module: 'STOCK', createdAt: new Date(`${dia(20)}T14:00:00Z`) },
      /* outra ação não conta */
      { unitId, action: 'STOCK_ENTRY', module: 'STOCK', createdAt: new Date(`${dia(21)}T14:00:00Z`) },
    ] });
    expect(await getStockCoverage(unitId, ym)).toEqual({ done: 2, missed: 1 });
    expect(await getStockCoverage(unitVazia, ym)).toEqual({ done: 0, missed: 0 });
  });
});
