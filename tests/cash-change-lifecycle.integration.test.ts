import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  requestChange, sendChangeRequest, confirmChangeReceipt,
  getOfficeChangeRequests, getSentChangeHistory, getVaultOverview, countVault,
} from '@/lib/cash-vault';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Ciclo completo do troco: SOLICITADO → ENVIADO → RECEBIDO.
 *
 * A regra que estes testes existem para proteger: **o cofre só muda na
 * confirmação do recebimento**. Enquanto o dinheiro está a caminho, ele não
 * pode aparecer no saldo — senão o gerente confere a gaveta contra um número
 * que ainda não chegou.
 *
 * E a segunda: recebido diferente do enviado é dinheiro perdido no transporte.
 * Tem de ficar registrado, não somido numa média.
 */

const sfx = `cic${process.pid.toString(36)}`;
let unitId: string;
let gerenteId: string;
let supId: string;
/** Encadeia o pedido entre os testes de envio e confirmação. */
let idEmTransito = '';

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const escritorio = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `CIC-${sfx}`, name: 'Unidade Ciclo', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  gerenteId = (await prisma.user.create({ data: { name: 'Ger', email: `g${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `s${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: gerenteId, unitId }, { userId: supId, unitId }] });
  // cofre com notas grandes para a unidade ter o que entregar
  await countVault(escritorio(), unitId, { '100': 1000 }, 'saldo inicial');
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

async function pedir(need: Record<string, number>, give: Record<string, number>) {
  const r = await requestChange(gerente(), unitId, { need, give, note: 'para os potes' });
  expect(r.ok).toBe(true);
  const req = await prisma.cashChangeRequest.findFirst({ where: { unitId, status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  return req!.id;
}

describe('Ciclo do troco: solicitação → envio → confirmação', () => {
  it('o gerente NÃO pode enviar — envio é do escritório', async () => {
    const id = await pedir({ '0.50': 100 }, { '100': 100 });
    const r = await sendChangeRequest(gerente(), id, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('o envio NÃO mexe no cofre — o dinheiro ainda está a caminho', async () => {
    const antes = await getVaultOverview(escritorio(), unitId);
    const movsAntes = await prisma.cashVaultMovement.count({ where: { unitId } });

    idEmTransito = await pedir({ '0.50': 100 }, { '100': 100 });
    const id = idEmTransito;
    const r = await sendChangeRequest(escritorio(), id, {});
    expect(r.ok).toBe(true);

    const depois = await getVaultOverview(escritorio(), unitId);
    expect(depois?.total).toBeCloseTo(antes?.total ?? 0, 2);
    expect(await prisma.cashVaultMovement.count({ where: { unitId } })).toBe(movsAntes);

    const req = await prisma.cashChangeRequest.findUnique({ where: { id } });
    expect(req?.status).toBe('SENT');
    expect(req?.sentByName).toBe('Sup');
  });

  it('a confirmação do gerente é que aplica no cofre', async () => {
    const antes = await getVaultOverview(escritorio(), unitId);
    const r = await confirmChangeReceipt(gerente(), idEmTransito, {});
    expect(r.ok).toBe(true);

    const depois = await getVaultOverview(escritorio(), unitId);
    // troca 1:1 — total igual, composição trocada
    expect(depois?.total).toBeCloseTo(antes?.total ?? 0, 2);
    expect((depois?.balances['0.50'] ?? 0) - (antes?.balances['0.50'] ?? 0)).toBeCloseTo(100, 2);
    expect((depois?.balances['100'] ?? 0) - (antes?.balances['100'] ?? 0)).toBeCloseTo(-100, 2);

    const dep = await prisma.cashChangeRequest.findUnique({ where: { id: idEmTransito } });
    expect(dep?.status).toBe('RECEIVED');
    expect(dep?.receivedByName).toBe('Ger');
  });

  it('o escritório pode enviar MENOS do que foi pedido, e fica registrado', async () => {
    const id = await pedir({ '0.50': 100 }, { '100': 100 });
    const r = await sendChangeRequest(escritorio(), id, { sent: { '0.50': 40 }, note: 'só tinha isso' });
    expect(r.ok).toBe(true);
    const req = await prisma.cashChangeRequest.findUnique({ where: { id } });
    expect((req?.sentJson as Record<string, number>)['0.50']).toBe(40);
    expect((req?.needJson as Record<string, number>)['0.50']).toBe(100); // o pedido original é preservado
  });

  it('RECEBIDO DIFERENTE DO ENVIADO é registrado com a diferença', async () => {
    const req = await prisma.cashChangeRequest.findFirst({ where: { unitId, status: 'SENT' }, orderBy: { sentAt: 'desc' } });
    const r = await confirmChangeReceipt(gerente(), req!.id, { received: { '0.50': 30 }, note: 'faltou um pacote' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.divergence).toBeCloseTo(-10, 2); // enviou 40, chegou 30

    const dep = await prisma.cashChangeRequest.findUnique({ where: { id: req!.id } });
    expect((dep?.receivedJson as Record<string, number>)['0.50']).toBe(30);
    expect((dep?.sentJson as Record<string, number>)['0.50']).toBe(40);
  });

  it('o cofre recebe o que CHEGOU, não o que foi enviado', async () => {
    /* A confirmação anterior recebeu 30 de moedas contra 100 entregues em notas:
       o cofre tem de refletir os 30 que entraram, não os 40 que saíram do
       escritório. Aplicar o enviado inflaria o saldo com dinheiro inexistente. */
    const movs = await prisma.cashVaultMovement.findMany({ where: { unitId }, orderBy: { createdAt: 'desc' }, take: 1 });
    const deltas = movs[0].deltas as Record<string, number>;
    expect(deltas['0.50']).toBeCloseTo(30, 2);
    expect(deltas['100']).toBeCloseTo(-100, 2);
  });

  it('não confirma duas vezes o mesmo envio', async () => {
    const dep = await prisma.cashChangeRequest.findFirst({ where: { unitId, status: 'RECEIVED' } });
    const r = await confirmChangeReceipt(gerente(), dep!.id, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('não confirma o que ainda não foi enviado', async () => {
    const id = await pedir({ '1': 100 }, { '100': 100 });
    const r = await confirmChangeReceipt(gerente(), id, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('a fila do escritório mostra os pedidos abertos e os enviados', async () => {
    const fila = await getOfficeChangeRequests(escritorio());
    expect(fila.some((x) => x.status === 'OPEN')).toBe(true);
    expect(fila.every((x) => x.status === 'OPEN' || x.status === 'SENT')).toBe(true);
    expect(fila[0].unitName).toBeTruthy();
  });

  it('o gerente NÃO enxerga a fila do escritório', async () => {
    expect(await getOfficeChangeRequests(gerente())).toEqual([]);
  });

  it('a relação de troco enviado traz o que já saiu, com quem enviou', async () => {
    const rel = await getSentChangeHistory(escritorio(), { unitId });
    expect(rel.length).toBeGreaterThan(0);
    expect(rel.every((x) => x.sentAt !== null)).toBe(true);
    expect(rel[0].sentByName).toBe('Sup');
  });
});
