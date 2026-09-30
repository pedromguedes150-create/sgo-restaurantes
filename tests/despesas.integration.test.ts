import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createExpense } from '@/lib/expenses/create';
import { registerRefund } from '@/lib/expenses/refund';
import { getExpenseSummary, listExpenses } from '@/lib/expenses/query';
import type { SessionUser } from '@/lib/auth/session';

/**
 * DESPESAS = dinheiro que saiu do COFRE. O que se prova: a origem é gravada
 * SAFE sem ninguém escolher; unidade e responsável saem da sessão; nasce
 * pendente; só o escritório devolve, uma vez; o gerente vê só a unidade dele.
 */

const sfx = `dp${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
let unitA: string; let unitB: string; let mgrId: string; let supId: string;

const gerente = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const supervisor = (): SessionUser => ({ id: supId, name: 'Supervisora', role: 'SUPERVISOR', unitIds: [unitA, unitB], seesAllUnits: false, needsTerms: false });
const caixa = (): SessionUser => ({ id: mgrId, name: 'Caixa', role: 'CASHIER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });

const base = () => ({ unitId: unitA, amount: 150, category: 'MAINTENANCE', description: 'Reparo torneira' });

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `DPA-${sfx}`, name: `Despesa A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `DPB-${sfx}`, name: `Despesa B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}-m@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Supervisora', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
});

beforeEach(async () => {
  await prisma.cashExpense.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.notification.deleteMany({ where: { userId: mgrId } });
});

afterAll(async () => {
  await prisma.cashExpense.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.notification.deleteMany({ where: { userId: mgrId } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId] } } });
  await prisma.$disconnect();
});

describe('Lançar', () => {
  it('nasce PENDENTE DE DEVOLUÇÃO, com origem COFRE gravada sem ninguém escolher, e responsável da sessão', async () => {
    const r = await createExpense(gerente(), base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = await prisma.cashExpense.findUniqueOrThrow({ where: { id: r.id } });
    expect(d.source).toBe('SAFE');
    expect(d.status).toBe('PENDING_REFUND');
    expect(d.createdById).toBe(mgrId);
    expect(d.createdByName).toBe('Gerente');
    expect(d.unitId).toBe(unitA);
    expect(Number(d.amount)).toBe(150);
    expect(d.receiptPath).toBeNull();
  });

  it('sem data = hoje (dia operacional da unidade); data futura é recusada; retroativa passa', async () => {
    const semData = await createExpense(gerente(), base());
    expect(semData.ok).toBe(true);
    if (semData.ok) expect((await prisma.cashExpense.findUniqueOrThrow({ where: { id: semData.id } })).expenseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const futura = await createExpense(gerente(), { ...base(), expenseDate: '2099-01-01' });
    expect(futura.ok).toBe(false);
    if (!futura.ok) expect(futura.reason).toBe('DATA_FUTURA');
    const ontem = await createExpense(gerente(), { ...base(), expenseDate: '2026-09-01' });
    expect(ontem.ok).toBe(true);
  });

  it('recusa valor zero, categoria inventada e descrição vazia', async () => {
    expect((await createExpense(gerente(), { ...base(), amount: 0 })).ok).toBe(false);
    expect((await createExpense(gerente(), { ...base(), category: 'CAIXA' })).ok).toBe(false);
    expect((await createExpense(gerente(), { ...base(), description: '   ' })).ok).toBe(false);
  });

  it('o gerente não lança em unidade que não é dele; o Caixa não lança', async () => {
    const fora = await createExpense(gerente(), { ...base(), unitId: unitB });
    expect(fora.ok).toBe(false);
    if (!fora.ok) expect(fora.reason).toBe('FORBIDDEN');
    expect((await createExpense(caixa(), base())).ok).toBe(false);
  });

  it('fica na Auditoria com a origem', async () => {
    const r = await createExpense(gerente(), base());
    if (!r.ok) throw new Error('não criou');
    const a = await prisma.auditLog.findFirst({ where: { action: 'EXPENSE_CREATE', entityId: r.id } });
    expect(a).not.toBeNull();
    expect((a?.metadata as { source?: string })?.source).toBe('SAFE');
  });
});

describe('Devolver', () => {
  it('só o escritório devolve: o gerente que retirou não dá a própria baixa', async () => {
    const r = await createExpense(gerente(), base());
    if (!r.ok) throw new Error('não criou');
    const naoPode = await registerRefund(gerente(), r.id);
    expect(naoPode.ok).toBe(false);
    if (!naoPode.ok) expect(naoPode.reason).toBe('FORBIDDEN');

    const pode = await registerRefund(supervisor(), r.id);
    expect(pode.ok).toBe(true);
    const d = await prisma.cashExpense.findUniqueOrThrow({ where: { id: r.id } });
    expect(d.status).toBe('REFUNDED');
    expect(d.refundedById).toBe(supId);
    expect(d.refundedByName).toBe('Supervisora');
    expect(d.refundedAt).not.toBeNull();
    expect(Number(d.refundedAmount)).toBe(150);
    /* O lançamento original fica como estava. */
    expect(d.createdById).toBe(mgrId);
    expect(Number(d.amount)).toBe(150);
    expect(d.description).toBe('Reparo torneira');
  });

  it('devolver duas vezes não passa; o gerente é avisado uma vez', async () => {
    const r = await createExpense(gerente(), base());
    if (!r.ok) throw new Error('não criou');
    await registerRefund(supervisor(), r.id);
    const denovo = await registerRefund(supervisor(), r.id);
    expect(denovo.ok).toBe(false);
    if (!denovo.ok) expect(denovo.reason).toBe('STATE');
    expect(await prisma.notification.count({ where: { userId: mgrId, title: 'Devolução registrada' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'EXPENSE_REFUND', entityId: r.id } })).toBe(1);
  });

  it('o escritório só devolve nas unidades do alcance', async () => {
    const r = await createExpense(supervisor(), { ...base(), unitId: unitB });
    if (!r.ok) throw new Error('não criou');
    const outra: SessionUser = { id: supId, name: 'Sup de outra', role: 'SUPERVISOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false };
    const nao = await registerRefund(outra, r.id);
    expect(nao.ok).toBe(false);
    if (!nao.ok) expect(nao.reason).toBe('FORBIDDEN');
  });
});

describe('Ver', () => {
  it('o gerente vê só a unidade dele; a supervisão vê as duas, com os cartões somando', async () => {
    await createExpense(gerente(), { ...base(), amount: 100 });
    const b = await createExpense(supervisor(), { ...base(), unitId: unitB, amount: 40 });
    if (b.ok) await registerRefund(supervisor(), b.id);

    const doGerente = await listExpenses(gerente(), { de: '2026-01-01', ate: '2099-12-31' });
    expect(doGerente.map((d) => d.unitId)).toEqual([unitA]);

    const daSup = await listExpenses(supervisor(), { de: '2026-01-01', ate: '2099-12-31' });
    expect(daSup.filter((d) => [unitA, unitB].includes(d.unitId))).toHaveLength(2);
    const resumo = await getExpenseSummary(supervisor(), { unitIds: [unitA, unitB], de: '2026-01-01', ate: '2099-12-31' });
    expect(resumo).toMatchObject({ total: 140, pendente: 100, devolvido: 40, qtdPendente: 1, qtd: 2 });
  });

  it('a unidade da URL não vence o escopo: pedir a outra unidade devolve vazio', async () => {
    await createExpense(supervisor(), { ...base(), unitId: unitB });
    const lista = await listExpenses(gerente(), { unitIds: [unitB], de: '2026-01-01', ate: '2099-12-31' });
    expect(lista).toHaveLength(0);
  });

  it('filtra por categoria e situação', async () => {
    await createExpense(gerente(), { ...base(), category: 'FOOD' });
    const r = await createExpense(gerente(), { ...base(), category: 'MAINTENANCE' });
    if (r.ok) await registerRefund(supervisor(), r.id);
    expect((await listExpenses(gerente(), { categoria: 'FOOD', de: '2026-01-01', ate: '2099-12-31' })).map((d) => d.category)).toEqual(['FOOD']);
    expect((await listExpenses(gerente(), { status: 'REFUNDED', de: '2026-01-01', ate: '2099-12-31' })).map((d) => d.category)).toEqual(['MAINTENANCE']);
  });
});
