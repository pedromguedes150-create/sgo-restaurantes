import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { payManyRequests } from '@/lib/payments/approve';
import type { SessionUser } from '@/lib/auth/session';
import type { PaymentStatus } from '@prisma/client';

/**
 * Marcar pagas em lote (v1.135.2): um comando só, mas cada item pela MESMA
 * porta da baixa individual — perfil que paga, unidade do Coordenador, só
 * aprovada, auditoria por item — e UM aviso por solicitante.
 */

const sfx = `lp${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
let unitA: string; let unitB: string; let mgrId: string; let coordId: string; let finId: string;

const coord = (): SessionUser => ({ id: coordId, name: 'Coordenadora', role: 'COORDINATOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const fin = (): SessionUser => ({ id: finId, name: 'Financeiro', role: 'FINANCE', unitIds: [], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });

async function req(unitId: string, status: PaymentStatus, amount = 100) {
  return prisma.paymentRequest.create({
    data: {
      type: 'OVERTIME', unitId, status, amount, hours: 2, hourlyRate: 50,
      workDate: new Date('2026-09-10T12:00:00Z'), collaboratorName: `LP-${sfx}`, requestedById: mgrId,
      approvedById: status === 'PENDING' ? null : coordId, approvedAt: status === 'PENDING' ? null : new Date(),
    },
  });
}

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `LPA-${sfx}`, name: `Lote Pagar A ${sfx}` } })).id;
  unitB = (await prisma.unit.create({ data: { code: `LPB-${sfx}`, name: `Lote Pagar B ${sfx}` } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}-m@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  coordId = (await prisma.user.create({ data: { name: 'Coordenadora', email: `${sfx}-c@e.com`, role: 'COORDINATOR', passwordHash: 'x' } })).id;
  finId = (await prisma.user.create({ data: { name: 'Financeiro', email: `${sfx}-f@e.com`, role: 'FINANCE', passwordHash: 'x' } })).id;
});

beforeEach(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.notification.deleteMany({ where: { userId: mgrId } });
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.notification.deleteMany({ where: { userId: mgrId } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, coordId, finId] } } });
  await prisma.$disconnect();
});

describe('Marcar pagas em lote', () => {
  it('marca as aprovadas como PAGAS com quem pagou, e pula pendente e já paga (contadas)', async () => {
    const a = await req(unitA, 'APPROVED', 100);
    const b = await req(unitA, 'APPROVED', 50);
    const pend = await req(unitA, 'PENDING');
    const jaPaga = await req(unitA, 'PAID');
    const r = await payManyRequests(coord(), [a.id, b.id, pend.id, jaPaga.id, a.id]);
    expect(r.paid).toBe(2);
    expect(r.failed.map((f) => f.id).sort()).toEqual([pend.id, jaPaga.id].sort());
    expect(r.failed.every((f) => f.reason === 'STATE')).toBe(true);
    const pa = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: a.id } });
    expect(pa.status).toBe('PAID');
    expect(pa.paidById).toBe(coordId);
    expect(pa.paidAt).not.toBeNull();
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: pend.id } })).status).toBe('PENDING');
  });

  it('o Coordenador não paga a unidade que não é dele; o Financeiro paga a rede', async () => {
    const fora = await req(unitB, 'APPROVED');
    const r1 = await payManyRequests(coord(), [fora.id]);
    expect(r1.paid).toBe(0);
    expect(r1.failed[0].reason).toBe('FORBIDDEN');
    const r2 = await payManyRequests(fin(), [fora.id]);
    expect(r2.paid).toBe(1);
  });

  it('gerente não paga nada, nem em lote', async () => {
    const a = await req(unitA, 'APPROVED');
    const r = await payManyRequests(gerente(), [a.id]);
    expect(r.paid).toBe(0);
    expect(r.failed[0].reason).toBe('FORBIDDEN');
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('APPROVED');
  });

  it('cada item fica na Auditoria; o solicitante recebe UM aviso com o total', async () => {
    const a = await req(unitA, 'APPROVED', 100);
    const b = await req(unitA, 'APPROVED', 50);
    const c = await req(unitA, 'APPROVED', 25);
    await payManyRequests(coord(), [a.id, b.id, c.id]);
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_PAID', entityId: { in: [a.id, b.id, c.id] } } })).toBe(3);
    const avisos = await prisma.notification.findMany({ where: { userId: mgrId } });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].title).toBe('3 pagamentos realizados');
    expect(avisos[0].body).toContain('175.00');
  });
});
