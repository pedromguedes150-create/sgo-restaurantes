import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { rejectManyRequests, approveRequest } from '@/lib/payments/approve';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Reprovar em lote (04/09): um motivo para todas, cada item pela mesma porta
 * da reprovação individual, cada solicitante avisado.
 */

const sfx = `lr${process.pid.toString(36)}`;
let unitId: string; let mgrId: string; let supId: string;
const mgr = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Supervisora', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `LR-${sfx}`, name: 'U Lote', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}-m@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Supervisora', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: mgrId, unitId }, { userId: supId, unitId }] });
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: mgrId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [mgrId, supId] } } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId] } } }).catch(() => {});
  await prisma.$disconnect();
});

async function pendente(nome: string) {
  const r = await createPaymentRequest(mgr(), { type: 'OVERTIME', unitId, amount: 50, collaboratorName: nome, hours: 1, reason: 'x' });
  if (!r.ok) throw new Error('setup');
  return r.id;
}

describe('Reprovar em lote', () => {
  it('reprova todas com o mesmo motivo e avisa o solicitante de cada uma', async () => {
    const ids = [await pendente('A'), await pendente('B'), await pendente('C')];
    const antes = await prisma.notification.count({ where: { userId: mgrId, title: { contains: 'rejeitada' } } });
    const r = await rejectManyRequests(sup(), ids, 'Lançamento duplicado');
    expect(r).toEqual({ rejected: 3, failed: [] });
    const rows = await prisma.paymentRequest.findMany({ where: { id: { in: ids } }, select: { status: true, rejectionReason: true, approvedById: true } });
    expect(rows.every((x) => x.status === 'REJECTED' && x.rejectionReason === 'Lançamento duplicado' && x.approvedById === supId)).toBe(true);
    expect(await prisma.notification.count({ where: { userId: mgrId, title: { contains: 'rejeitada' } } })).toBe(antes + 3);
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_REJECT', entityId: { in: ids } } })).toBe(3);
  });

  it('sem motivo não reprova nada', async () => {
    const id = await pendente('D');
    const r = await rejectManyRequests(sup(), [id], '   ');
    expect(r.rejected).toBe(0);
    expect(r.failed).toEqual([{ id, reason: 'INVALID' }]);
    expect((await prisma.paymentRequest.findUnique({ where: { id }, select: { status: true } }))?.status).toBe('PENDING');
  });

  it('o que já foi resolvido volta discriminado, o resto passa', async () => {
    const ok = await pendente('E'); const jaAprovada = await pendente('F');
    expect((await approveRequest(sup(), jaAprovada)).ok).toBe(true);
    const r = await rejectManyRequests(sup(), [ok, jaAprovada, 'nao-existe'], 'Fora do período');
    expect(r.rejected).toBe(1);
    expect(r.failed).toEqual(expect.arrayContaining([{ id: jaAprovada, reason: 'STATE' }, { id: 'nao-existe', reason: 'NOT_FOUND' }]));
  });

  it('o gerente não reprova o que não pode aprovar', async () => {
    const id = await pendente('G');
    const r = await rejectManyRequests(mgr(), [id], 'motivo');
    expect(r).toEqual({ rejected: 0, failed: [{ id, reason: 'FORBIDDEN' }] });
  });
});
