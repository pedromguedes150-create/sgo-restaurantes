import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { approveRequest, rejectRequest, markPaid, canApprove } from '@/lib/payments/approve';
import { getToApprove, getToApproveCount, getToPay, getPaymentCounts } from '@/lib/payments/query';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O COORDENADOR opera a central (v1.133.0): aprova Freelancer e Hora Extra
 * das suas unidades (o Supervisor continua podendo), vê a fila "Para Aprovar"
 * e marca pago. Gerente continua sem aprovar e sem pagar; Supervisor não paga.
 * Avulso segue a regra do tipo cadastrado — Coordenador não aprova o que é do Admin.
 */
const sfx = `co${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
let unitId: string; let outraUnitId: string;
let mgrId: string, supId: string, coordId: string, coordOutraId: string, adminId: string;
let colabId: string; let miscAdminId: string; let miscSupId: string;

const u = (id: string, role: SessionUser['role'], units: string[]): SessionUser => ({ id, name: role, role, unitIds: units, seesAllUnits: role === 'ADMIN', needsTerms: false });
const mgr = () => u(mgrId, 'MANAGER', [unitId]);
const sup = () => u(supId, 'SUPERVISOR', [unitId]);
const coord = () => u(coordId, 'COORDINATOR', [unitId]);
const coordOutra = () => u(coordOutraId, 'COORDINATOR', [outraUnitId]);
const admin = () => u(adminId, 'ADMIN', []);

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `CO-${sfx}`, name: `U Coord ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnitId = (await prisma.unit.create({ data: { code: `CO2-${sfx}`, name: `U Outra ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  await prisma.overtimeHourlyRate.create({ data: { unitId, value: 50 } });
  const mk = async (role: SessionUser['role'], tag: string) => (await prisma.user.create({ data: { name: `${role} ${sfx}`, email: `${tag}-${sfx}@e.com`, role, passwordHash: 'x' } })).id;
  mgrId = await mk('MANAGER', 'm'); supId = await mk('SUPERVISOR', 's'); coordId = await mk('COORDINATOR', 'c'); coordOutraId = await mk('COORDINATOR', 'c2'); adminId = await mk('ADMIN', 'a');
  await prisma.unitMembership.createMany({ data: [{ userId: mgrId, unitId }, { userId: supId, unitId }, { userId: coordId, unitId }, { userId: coordOutraId, unitId: outraUnitId }] });
  colabId = (await prisma.collaborator.create({ data: { name: `Colab ${sfx}`, units: { create: { unitId } } } })).id;
  miscAdminId = (await prisma.miscPaymentType.create({ data: { name: `Avulso Admin ${sfx}`, approverRole: 'ADMIN' } })).id;
  miscSupId = (await prisma.miscPaymentType.create({ data: { name: `Avulso Sup ${sfx}`, approverRole: 'SUPERVISOR' } })).id;
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitId, outraUnitId] } } });
  await prisma.miscPaymentType.deleteMany({ where: { id: { in: [miscAdminId, miscSupId] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnitId] } } }).catch(() => {});
  await prisma.collaborator.delete({ where: { id: colabId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId, coordId, coordOutraId, adminId] } } }).catch(() => {});
  await prisma.$disconnect();
});

async function novaHE() {
  const r = await createPaymentRequest(mgr(), { type: 'OVERTIME', unitId, amount: 100, collaboratorId: colabId, workDate: '2026-09-21', workStartTime: '18:00', workEndTime: '20:00', hourlyRate: 50, reason: 'evento' });
  if (!r.ok) throw new Error(`create HE: ${r.reason} ${r.detail ?? ''}`);
  return r.id;
}
async function novoAvulso(miscTypeId: string) {
  const r = await createPaymentRequest(mgr(), { type: 'MISC', unitId, amount: 80, miscTypeId, beneficiary: 'Fulano', description: 'x' });
  if (!r.ok) throw new Error(`create MISC: ${r.reason} ${r.detail ?? ''}`);
  return r.id;
}

describe('Coordenador aprova e paga', () => {
  it('HE do Supervisor: Coordenador da unidade aprova; Gerente não; Coordenador de OUTRA unidade não', async () => {
    const id = await novaHE();
    expect(await canApprove(coord(), id)).toBe(true);
    expect(await canApprove(mgr(), id)).toBe(false);
    expect((await approveRequest(coordOutra(), id)).ok).toBe(false);
    expect((await approveRequest(mgr(), id)).ok).toBe(false);
    expect((await approveRequest(coord(), id)).ok).toBe(true);
    const fresh = await prisma.paymentRequest.findUnique({ where: { id }, select: { status: true, approvedById: true, approverRole: true } });
    expect(fresh?.status).toBe('APPROVED');
    expect(fresh?.approvedById).toBe(coordId);
    expect(fresh?.approverRole).toBe('SUPERVISOR'); // o gravado não muda: a leitura é que aceita o Coordenador
  });

  it('o Supervisor continua aprovando e reprovando', async () => {
    const a = await novaHE(); const b = await novaHE();
    expect((await approveRequest(sup(), a)).ok).toBe(true);
    expect((await rejectRequest(sup(), b, 'errado')).ok).toBe(true);
    expect((await rejectRequest(coord(), await novaHE(), 'errado também')).ok).toBe(true);
  });

  it('a fila "Para Aprovar" e o crachá do Coordenador incluem a HE; o Gerente não vê nada', async () => {
    const id = await novaHE();
    const fila = await getToApprove(coord());
    expect(fila.some((r) => r.id === id)).toBe(true);
    expect(await getToApproveCount(coord())).toBeGreaterThanOrEqual(1);
    expect((await getToApprove(mgr())).some((r) => r.id === id)).toBe(false);
    expect((await getToApprove(coordOutra())).some((r) => r.id === id)).toBe(false);
  });

  it('Avulso segue a regra do TIPO: Coordenador não aprova nem o do Admin nem o do Supervisor', async () => {
    const doAdmin = await novoAvulso(miscAdminId);
    const doSup = await novoAvulso(miscSupId);
    expect((await approveRequest(coord(), doAdmin)).ok).toBe(false);
    expect((await approveRequest(coord(), doSup)).ok).toBe(false);
    const fila = await getToApprove(coord());
    expect(fila.some((r) => r.id === doAdmin || r.id === doSup)).toBe(false);
    expect((await approveRequest(admin(), doAdmin)).ok).toBe(true);
    expect((await approveRequest(sup(), doSup)).ok).toBe(true);
  });

  it('marcar pago: Coordenador sim (fila e ação); Supervisor e Gerente não', async () => {
    const id = await novaHE();
    expect((await approveRequest(sup(), id)).ok).toBe(true);
    expect((await getToPay(coord())).some((r) => r.id === id)).toBe(true);
    expect((await getPaymentCounts(coord())).toPay).toBeGreaterThanOrEqual(1);
    expect(await getToPay(sup())).toEqual([]);
    expect((await markPaid(sup(), id)).ok).toBe(false);
    expect((await markPaid(mgr(), id)).ok).toBe(false);
    expect((await markPaid(coordOutra(), id)).ok).toBe(false); // escopo por unidade continua
    expect((await markPaid(coord(), id)).ok).toBe(true);
    const fresh = await prisma.paymentRequest.findUnique({ where: { id }, select: { status: true, paidById: true } });
    expect(fresh?.status).toBe('PAID');
    expect(fresh?.paidById).toBe(coordId);
  });

  it('quem lança não aprova o próprio, mesmo sendo Coordenador', async () => {
    const r = await createPaymentRequest(coord(), { type: 'OVERTIME', unitId, amount: 100, collaboratorId: colabId, workDate: '2026-09-22', workStartTime: '18:00', workEndTime: '20:00', hourlyRate: 50, reason: 'evento' });
    if (!r.ok) throw new Error('create');
    expect((await approveRequest(coord(), r.id)).ok).toBe(false);
    expect((await approveRequest(sup(), r.id)).ok).toBe(true);
  });
});
