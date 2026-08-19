import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { requestChange, resolveChangeRequest, getChangeRequests, getVaultOverview } from '@/lib/cash-vault';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Solicitação de troco POR DENOMINAÇÃO (Módulo 18).
 *
 * Antes o pedido era uma linha de texto livre: o escritório lia prosa, nada era
 * conferido, e o que chegava era digitado de novo na conferência do cofre. Estes
 * testes fixam as duas regras que sustentam o fluxo novo — a troca tem de fechar
 * 1:1, e atender o pedido aplica o movimento no cofre uma única vez.
 */

const sfx = `chg${process.pid.toString(36)}`;
let unitId: string;
let gerenteId: string;
let supId: string;

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const supervisor = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({
    data: { code: `CHG-${sfx}`, name: 'Unidade Troco Denom', timezone: 'America/Sao_Paulo', cutoffHour: 4 },
  });
  unitId = unit.id;
  const g = await prisma.user.create({ data: { name: 'Ger', email: `g${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } });
  gerenteId = g.id;
  const s = await prisma.user.create({ data: { name: 'Sup', email: `s${sfx}@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } });
  supId = s.id;
  await prisma.unitMembership.create({ data: { userId: gerenteId, unitId } });
  await prisma.unitMembership.create({ data: { userId: supId, unitId } });
});

afterAll(async () => {
  await prisma.cashChangeRequest.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.cashVaultMovement.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.cashVault.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, supId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Solicitação de troco por denominação', () => {
  it('recusa pedido sem nenhuma denominação preenchida', async () => {
    const r = await requestChange(gerente(), unitId, { note: 'preciso de troco' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('recusa valor que não é múltiplo da moeda (R$ 50,05 em moedas de 0,50)', async () => {
    const r = await requestChange(gerente(), unitId, { need: { '0.50': 50.05 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/múltiplo/i);
  });

  it('recusa troca desigual: entrega R$ 100 e pede R$ 50', async () => {
    const r = await requestChange(gerente(), unitId, { need: { '0.50': 50 }, give: { '100': 100 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/desigual/i);
  });

  it('aceita pedido só com o lado do que precisa (supervisão registra à mão)', async () => {
    const r = await requestChange(gerente(), unitId, { need: { '0.50': 30, '0.25': 20 } });
    expect(r.ok).toBe(true);
    const lista = await getChangeRequests(gerente(), unitId);
    const aberto = lista.find((x) => x.status === 'OPEN' && x.needTotal === 50);
    expect(aberto).toBeTruthy();
    expect(aberto?.autoApply).toBe(false);
    // o valor vem da SOMA do detalhe, não de um campo digitado à parte
    expect(aberto?.amount).toBe(50);
  });

  it('aceita a troca fechada e marca para aplicar sozinha', async () => {
    const r = await requestChange(gerente(), unitId, { need: { '0.50': 100 }, give: { '100': 100 }, note: 'para os potes' });
    expect(r.ok).toBe(true);
    const lista = await getChangeRequests(gerente(), unitId);
    const fechado = lista.find((x) => x.status === 'OPEN' && x.autoApply);
    expect(fechado).toBeTruthy();
    expect(fechado?.needTotal).toBe(100);
    expect(fechado?.giveTotal).toBe(100);
  });

  it('atender a troca fechada aplica o movimento no cofre uma única vez', async () => {
    const antes = await getVaultOverview(supervisor(), unitId);
    const saldoAntes = antes?.total ?? 0;
    const movsAntes = await prisma.cashVaultMovement.count({ where: { unitId } });

    const lista = await getChangeRequests(supervisor(), unitId);
    const fechado = lista.find((x) => x.status === 'OPEN' && x.autoApply)!;
    const r = await resolveChangeRequest(supervisor(), fechado.id, 'resolve', 'entregue no malote');
    expect(r.ok).toBe(true);

    const depois = await getVaultOverview(supervisor(), unitId);
    // troca 1:1 — o TOTAL do cofre não muda, muda a composição
    expect(depois?.total).toBeCloseTo(saldoAntes, 2);
    expect(depois?.balances['0.50']).toBeCloseTo(100, 2);
    expect(depois?.balances['100']).toBeCloseTo(-100, 2);
    expect(await prisma.cashVaultMovement.count({ where: { unitId } })).toBe(movsAntes + 1);
  });

  it('não atende duas vezes o mesmo pedido', async () => {
    const lista = await getChangeRequests(supervisor(), unitId);
    const atendido = lista.find((x) => x.status === 'RESOLVED')!;
    const r = await resolveChangeRequest(supervisor(), atendido.id, 'resolve', undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('atender pedido sem o lado da entrega NÃO mexe no cofre', async () => {
    const movsAntes = await prisma.cashVaultMovement.count({ where: { unitId } });
    const lista = await getChangeRequests(supervisor(), unitId);
    const semEntrega = lista.find((x) => x.status === 'OPEN' && !x.autoApply)!;
    const r = await resolveChangeRequest(supervisor(), semEntrega.id, 'resolve', undefined);
    expect(r.ok).toBe(true);
    expect(await prisma.cashVaultMovement.count({ where: { unitId } })).toBe(movsAntes);
  });

  it('gerente não atende o próprio pedido (só a supervisão)', async () => {
    await requestChange(gerente(), unitId, { need: { '1': 20 }, give: { '20': 20 } });
    const lista = await getChangeRequests(gerente(), unitId);
    const aberto = lista.find((x) => x.status === 'OPEN')!;
    const r = await resolveChangeRequest(gerente(), aberto.id, 'resolve', undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('o próprio solicitante pode cancelar, e cancelar não mexe no cofre', async () => {
    const movsAntes = await prisma.cashVaultMovement.count({ where: { unitId } });
    const lista = await getChangeRequests(gerente(), unitId);
    const aberto = lista.find((x) => x.status === 'OPEN')!;
    const r = await resolveChangeRequest(gerente(), aberto.id, 'cancel', undefined);
    expect(r.ok).toBe(true);
    expect(await prisma.cashVaultMovement.count({ where: { unitId } })).toBe(movsAntes);
  });
});
