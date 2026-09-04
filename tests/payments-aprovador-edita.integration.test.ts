import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { approverEditRequest, approveRequest } from '@/lib/payments/approve';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Pedidos de 04/09 em Pagamentos:
 *  1. o freelancer já nasce ALOCADO — setor e dia são obrigatórios no lançamento,
 *     e o setor tem de ser da unidade;
 *  2. quem aprova pode CORRIGIR a solicitação antes de aprovar (dia, horário,
 *     setor, VT, valor), com antes/depois na auditoria.
 */

const sfx = `pe${process.pid.toString(36)}`;
let unitId: string; let outraUnitId: string;
let setorId: string; let setorOutraId: string; let setor2Id: string;
let mgrId: string; let supId: string; let freelaId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Supervisora', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `PE-${sfx}`, name: 'U Edita', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnitId = (await prisma.unit.create({ data: { code: `PE2-${sfx}`, name: 'U Outra', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  setorId = (await prisma.sector.create({ data: { unitId, name: 'Churrasco' } })).id;
  setor2Id = (await prisma.sector.create({ data: { unitId, name: 'Lavagem' } })).id;
  setorOutraId = (await prisma.sector.create({ data: { unitId: outraUnitId, name: 'Bar' } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}-m@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Supervisora', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: mgrId, unitId }, { userId: supId, unitId }] });
  freelaId = (await prisma.freelancer.create({ data: { name: 'Freela', defaultValue: 100, pixKey: '1', units: { create: { unitId } } } })).id;
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitId, outraUnitId] } } }).catch(() => {});
  await prisma.freelancer.delete({ where: { id: freelaId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [mgrId, supId] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnitId] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId] } } }).catch(() => {});
  await prisma.$disconnect();
});

const base = () => ({ type: 'FREELANCER' as const, unitId, amount: 100, freelancerId: freelaId, workDate: '2026-09-04' });

describe('Freelancer nasce alocado', () => {
  it('sem setor não lança', async () => {
    const r = await createPaymentRequest(mgr(), { ...base() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/setor/i);
  });

  it('sem dia não lança', async () => {
    const r = await createPaymentRequest(mgr(), { ...base(), workDate: undefined, workSectorId: setorId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/dia/i);
  });

  it('setor de outra unidade não vale', async () => {
    const r = await createPaymentRequest(mgr(), { ...base(), workSectorId: setorOutraId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/unidade/i);
  });

  it('com dia e setor, grava já alocado (o Mapa lê daqui)', async () => {
    const r = await createPaymentRequest(mgr(), { ...base(), workSectorId: setorId, workStartTime: '10:00', workEndTime: '14:00' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const saved = await prisma.paymentRequest.findUnique({ where: { id: r.id }, select: { workSectorId: true, workDate: true } });
    expect(saved?.workSectorId).toBe(setorId);
    expect(saved?.workDate?.toISOString().slice(0, 10)).toBe('2026-09-04');
  });
});

describe('Aprovador corrige antes de aprovar', () => {
  async function pendente() {
    const r = await createPaymentRequest(mgr(), { ...base(), amount: 100, workSectorId: setorId, workStartTime: '10:00', workEndTime: '14:00', transportValue: 40 });
    if (!r.ok) throw new Error('setup');
    return r.id;
  }

  it('a supervisora troca setor, horário e VT; o valor manual muda e a divergência é refeita', async () => {
    const id = await pendente();
    const r = await approverEditRequest(sup(), id, { workSectorId: setor2Id, workStartTime: '09:00', workEndTime: '15:00', transportValue: 20, amount: 130 });
    expect(r).toEqual({ ok: true });
    const s = await prisma.paymentRequest.findUnique({ where: { id }, select: { workSectorId: true, workStartTime: true, workEndTime: true, transportValue: true, amount: true, divergent: true, status: true } });
    expect(s?.workSectorId).toBe(setor2Id);
    expect(s?.workStartTime).toBe('09:00');
    expect(s?.workEndTime).toBe('15:00');
    expect(Number(s?.transportValue)).toBe(20);
    expect(Number(s?.amount)).toBe(130);
    expect(s?.divergent).toBe(true); // padrão do freelancer é 100
    expect(s?.status).toBe('PENDING'); // corrigir não aprova
    const log = await prisma.auditLog.findFirst({ where: { action: 'PAYMENT_APPROVER_EDIT', entityId: id } });
    expect(log).not.toBeNull();
    const meta = log?.metadata as { antes: Record<string, unknown>; depois: Record<string, unknown> };
    expect(meta.antes.workSectorId).toBe(setorId);
    expect(meta.depois.workSectorId).toBe(setor2Id);
  });

  it('o próprio solicitante não corrige — a porta é a mesma da aprovação', async () => {
    const id = await pendente();
    const r = await approverEditRequest(mgr(), id, { amount: 1 });
    expect(r).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('setor de outra unidade é recusado na correção também', async () => {
    const id = await pendente();
    const r = await approverEditRequest(sup(), id, { workSectorId: setorOutraId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('depois de aprovada não se corrige mais', async () => {
    const id = await pendente();
    expect((await approveRequest(sup(), id)).ok).toBe(true);
    const r = await approverEditRequest(sup(), id, { amount: 999 });
    expect(r).toEqual({ ok: false, reason: 'STATE' });
  });

  it('nada mudou = nada gravado (sem linha de auditoria)', async () => {
    const id = await pendente();
    const antes = await prisma.auditLog.count({ where: { action: 'PAYMENT_APPROVER_EDIT', entityId: id } });
    const r = await approverEditRequest(sup(), id, { workSectorId: setorId, transportValue: 40 });
    expect(r).toEqual({ ok: true });
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_APPROVER_EDIT', entityId: id } })).toBe(antes);
  });
});
