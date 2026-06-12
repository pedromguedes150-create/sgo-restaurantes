import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { approveRequest, rejectRequest, markPaid } from '@/lib/payments/approve';
import type { SessionUser } from '@/lib/auth/session';

const sfx = process.pid.toString(36);
let unitId: string;
let mgrId: string, supId: string, coordId: string, finId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'M', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false });
const sup = (): SessionUser => ({ id: supId, name: 'S', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false });
const coord = (): SessionUser => ({ id: coordId, name: 'C', role: 'COORDINATOR', unitIds: [unitId], seesAllUnits: false });
const fin = (): SessionUser => ({ id: finId, name: 'F', role: 'FINANCE', unitIds: [], seesAllUnits: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `PAY-${sfx}`, name: 'U Pay', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  mgrId = (await prisma.user.create({ data: { name: 'M', email: `pm-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'S', email: `ps-${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  coordId = (await prisma.user.create({ data: { name: 'C', email: `pc-${sfx}@e.com`, role: 'COORDINATOR', passwordHash: 'x' } })).id;
  finId = (await prisma.user.create({ data: { name: 'F', email: `pf-${sfx}@e.com`, role: 'FINANCE', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [mgrId, supId, coordId].map((userId) => ({ userId, unitId })) });
});

afterAll(async () => {
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId, coordId, finId] } } }).catch(() => {});
  await prisma.$disconnect();
});

async function newOvertime() {
  const r = await createPaymentRequest(mgr(), { type: 'OVERTIME', unitId, amount: 100, collaboratorName: 'X', hours: 2, reason: 'y' });
  if (!r.ok) throw new Error('create failed');
  return r.id;
}

describe('Pagamentos (Módulo 7)', () => {
  it('fluxo solicitar → aprovar → pagar', async () => {
    const id = await newOvertime();
    // gerente não aprova
    const denied = await approveRequest(mgr(), id);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('FORBIDDEN');
    // supervisor aprova
    expect((await approveRequest(sup(), id)).ok).toBe(true);
    // financeiro paga
    expect((await markPaid(fin(), id)).ok).toBe(true);
    const fresh = await prisma.paymentRequest.findUnique({ where: { id } });
    expect(fresh?.status).toBe('PAID');
  });

  it('rejeição exige motivo e marca REJECTED', async () => {
    const id = await newOvertime();
    expect((await rejectRequest(sup(), id, '')).ok).toBe(false);
    expect((await rejectRequest(sup(), id, 'fora do orçamento')).ok).toBe(true);
    const fresh = await prisma.paymentRequest.findUnique({ where: { id } });
    expect(fresh?.status).toBe('REJECTED');
  });

  it('delegação: coordenador aprova no lugar do supervisor durante o período', async () => {
    const id = await newOvertime();
    // sem delegação, coordenador não pode
    expect((await approveRequest(coord(), id)).ok).toBe(false);
    // cria delegação supervisor -> coordenador
    await prisma.approvalDelegation.create({
      data: { fromUserId: supId, toUserId: coordId, startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 3600_000) },
    });
    expect((await approveRequest(coord(), id)).ok).toBe(true);
    const fresh = await prisma.paymentRequest.findUnique({ where: { id } });
    expect(fresh?.approvedById).toBe(coordId);
  });

  it('nega solicitação fora do escopo', async () => {
    const outsider: SessionUser = { id: mgrId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false };
    const r = await createPaymentRequest(outsider, { type: 'OVERTIME', unitId, amount: 10 });
    expect(r.ok).toBe(false);
  });

  it('ninguém aprova a própria solicitação (segregação de funções)', async () => {
    const created = await createPaymentRequest(sup(), { type: 'OVERTIME', unitId, amount: 50, collaboratorName: 'Y', hours: 1, reason: 'z' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const denied = await approveRequest(sup(), created.id);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('FORBIDDEN');
  });
});
