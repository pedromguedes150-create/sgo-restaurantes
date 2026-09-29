import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { approveRequest, rejectRequest, markPaid } from '@/lib/payments/approve';
import type { SessionUser } from '@/lib/auth/session';

const sfx = process.pid.toString(36);
let unitId: string;
let mgrId: string, supId: string, coordId: string, finId: string, mgr2Id: string;
/** Hora Extra escolhe o colaborador do RH (v1.126.0) — um colaborador da unidade. */
let colabId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'M', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'S', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const coord = (): SessionUser => ({ id: coordId, name: 'C', role: 'COORDINATOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const fin = (): SessionUser => ({ id: finId, name: 'F', role: 'FINANCE', unitIds: [], seesAllUnits: false, needsTerms: false });
const mgr2 = (): SessionUser => ({ id: mgr2Id, name: 'M2', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `PAY-${sfx}`, name: 'U Pay', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  await prisma.overtimeHourlyRate.create({ data: { unitId, value: 50 } }); // v1.130.0: HE exige valor/hora autorizado
  mgrId = (await prisma.user.create({ data: { name: 'M', email: `pm-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'S', email: `ps-${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  coordId = (await prisma.user.create({ data: { name: 'C', email: `pc-${sfx}@e.com`, role: 'COORDINATOR', passwordHash: 'x' } })).id;
  finId = (await prisma.user.create({ data: { name: 'F', email: `pf-${sfx}@e.com`, role: 'FINANCE', passwordHash: 'x' } })).id;
  mgr2Id = (await prisma.user.create({ data: { name: 'M2', email: `pm2-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [mgrId, supId, coordId, mgr2Id].map((userId) => ({ userId, unitId })) });
  colabId = (await prisma.collaborator.create({ data: { name: `Colab ${sfx}`, units: { create: { unitId } } } })).id;
});

afterAll(async () => {
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.collaborator.delete({ where: { id: colabId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId, coordId, finId, mgr2Id] } } }).catch(() => {});
  await prisma.$disconnect();
});

async function newOvertime() {
  const r = await createPaymentRequest(mgr(), { type: 'OVERTIME', unitId, amount: 100, collaboratorId: colabId, workDate: '2026-09-20', workStartTime: '18:00', workEndTime: '20:00', hourlyRate: 50, reason: 'y' });
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

  it('delegação: quem recebe a delegação aprova no lugar do supervisor durante o período', async () => {
    /* v1.133.0: o Coordenador já aprova HE por regra própria, então a delegação
       é demonstrada com um segundo gerente — que só aprova delegado. */
    const id = await newOvertime();
    expect((await approveRequest(mgr2(), id)).ok).toBe(false);
    await prisma.approvalDelegation.create({
      data: { fromUserId: supId, toUserId: mgr2Id, startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 3600_000) },
    });
    expect((await approveRequest(mgr2(), id)).ok).toBe(true);
    const fresh = await prisma.paymentRequest.findUnique({ where: { id } });
    expect(fresh?.approvedById).toBe(mgr2Id);
  });

  it('coordenador aprova Hora Extra da unidade SEM delegação (v1.133.0)', async () => {
    const id = await newOvertime();
    expect((await approveRequest(coord(), id)).ok).toBe(true);
    expect((await prisma.paymentRequest.findUnique({ where: { id } }))?.approvedById).toBe(coordId);
  });

  it('nega solicitação fora do escopo', async () => {
    const outsider: SessionUser = { id: mgrId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await createPaymentRequest(outsider, { type: 'OVERTIME', unitId, amount: 10 });
    expect(r.ok).toBe(false);
  });

  it('ninguém aprova a própria solicitação (segregação de funções)', async () => {
    const created = await createPaymentRequest(sup(), { type: 'OVERTIME', unitId, amount: 50, collaboratorId: colabId, workDate: '2026-09-20', workStartTime: '18:00', workEndTime: '19:00', hourlyRate: 50, reason: 'z' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const denied = await approveRequest(sup(), created.id);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('FORBIDDEN');
  });
});
