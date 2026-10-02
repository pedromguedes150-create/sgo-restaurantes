import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { motivoHE } from './helpers/motivo-he';
import { createPaymentRequest } from '@/lib/payments/create';
import { approverEditRequest } from '@/lib/payments/approve';
import { getUnitRequests, getMyRequests, getPaymentCounts } from '@/lib/payments/query';
import { addOvertimeRate, toggleOvertimeRate, activeOvertimeRatesByUnit, overtimeRateAllowed } from '@/lib/overtime/rates';
import type { SessionUser } from '@/lib/auth/session';

/**
 * HORA EXTRA por PERÍODO + valor/hora AUTORIZADO por unidade (v1.130.0):
 *  1. o gerente não digita valor: início, fim e um valor/hora da lista da unidade;
 *     horas, subtotal e total são calculados no servidor;
 *  2. o valor/hora fica GRAVADO na solicitação — desativar depois não muda o passado;
 *  3. o aprovador corrige o período e o valor/hora pela mesma conta;
 *  4. "Solicitações da unidade" mostra tudo da unidade, de qualquer solicitante,
 *     e NUNCA de outra unidade — mesmo pedindo pelo id.
 */

const sfx = `he${process.pid.toString(36)}`;
let unitId: string; let outraUnitId: string;
let mgrId: string; let mgr2Id: string; let supId: string; let adminId: string; let colabId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const mgr2 = (): SessionUser => ({ id: mgr2Id, name: 'Gerente 2', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Supervisora', role: 'SUPERVISOR', unitIds: [unitId, outraUnitId], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  motivoId = await motivoHE();
  unitId = (await prisma.unit.create({ data: { code: `HE-${sfx}`, name: 'U Hora Extra', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnitId = (await prisma.unit.create({ data: { code: `HE2-${sfx}`, name: 'U Outra', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}-m@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  mgr2Id = (await prisma.user.create({ data: { name: 'Gerente 2', email: `${sfx}-m2@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Supervisora', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: mgrId, unitId }, { userId: mgr2Id, unitId }, { userId: supId, unitId }, { userId: supId, unitId: outraUnitId }] });
  colabId = (await prisma.collaborator.create({ data: { name: `Colab ${sfx}`, active: true, source: 'RH', units: { create: { unitId } } } })).id;
  // valores autorizados: 20 e 25 nesta unidade; a outra fica sem nenhum
  for (const v of [20, 25]) { const r = await addOvertimeRate(admin(), unitId, v); if (!r.ok) throw new Error('setup rate'); }
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitId, outraUnitId] } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: colabId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [mgrId, mgr2Id, supId] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnitId] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, mgr2Id, supId, adminId] } } }).catch(() => {});
  await prisma.$disconnect();
});

let motivoId = '';
const he = (extra: Record<string, unknown> = {}) => ({
  type: 'OVERTIME' as const, unitId, amount: 999, collaboratorId: colabId, overtimeReasonId: motivoId,
  workDate: '2026-09-20', workStartTime: '22:00', workEndTime: '02:00', hourlyRate: 25, reason: 'Evento', ...extra,
});

describe('Lançamento da Hora Extra por período', () => {
  it('sem data, sem horário ou sem valor/hora não lança', async () => {
    const a = await createPaymentRequest(mgr(), { ...he(), workDate: undefined });
    expect(a.ok).toBe(false); if (!a.ok) expect(a.detail).toMatch(/data/i);
    const b = await createPaymentRequest(mgr(), { ...he(), workEndTime: undefined });
    expect(b.ok).toBe(false); if (!b.ok) expect(b.detail).toMatch(/hora início e hora fim/i);
    const c = await createPaymentRequest(mgr(), { ...he(), hourlyRate: undefined });
    expect(c.ok).toBe(false); if (!c.ok) expect(c.detail).toMatch(/autorizado/i);
  });

  it('valor/hora fora da lista da unidade é recusado — inclusive digitado por fora da tela', async () => {
    const r = await createPaymentRequest(mgr(), { ...he(), hourlyRate: 30 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/autorizado/i);
  });

  it('calcula no servidor: 22:00→02:00 = 4h × R$ 25 + R$ 10 VT = R$ 110 (o amount do corpo é ignorado)', async () => {
    const r = await createPaymentRequest(mgr(), he({ transportValue: 10, amount: 5 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = await prisma.paymentRequest.findUnique({ where: { id: r.id } });
    expect(Number(s?.hours)).toBe(4);
    expect(Number(s?.hourlyRate)).toBe(25);
    expect(Number(s?.transportValue)).toBe(10);
    expect(Number(s?.amount)).toBe(110);
    expect(s?.workStartTime).toBe('22:00');
    expect(s?.workEndTime).toBe('02:00');
    expect(s?.collaboratorId).toBe(colabId);
    expect(s?.workDate?.toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('período vazio (mesmo horário) não lança', async () => {
    const r = await createPaymentRequest(mgr(), he({ workEndTime: '22:00' }));
    expect(r.ok).toBe(false);
  });

  it('o valor/hora gravado é RETRATO: desativar na configuração não muda a solicitação', async () => {
    const r = await createPaymentRequest(mgr(), he({ hourlyRate: 20, workStartTime: '18:00', workEndTime: '20:00' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const linha = await prisma.overtimeHourlyRate.findUnique({ where: { unitId_value: { unitId, value: 20 } } });
    const t = await toggleOvertimeRate(admin(), linha!.id, false);
    expect(t.ok).toBe(true);
    expect(await overtimeRateAllowed(unitId, 20)).toBe(false);
    expect(await activeOvertimeRatesByUnit([unitId])).toEqual({ [unitId]: [25] });
    const s = await prisma.paymentRequest.findUnique({ where: { id: r.id } });
    expect(Number(s?.hourlyRate)).toBe(20);
    expect(Number(s?.amount)).toBe(40);
    // e um lançamento NOVO com 20 já não passa
    const n = await createPaymentRequest(mgr(), he({ hourlyRate: 20 }));
    expect(n.ok).toBe(false);
    await toggleOvertimeRate(admin(), linha!.id, true);
  });

  it('só o Admin mexe na lista de valores', async () => {
    const r = await addOvertimeRate(sup(), unitId, 40);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});

describe('Aprovador corrige o período', () => {
  it('trocar o horário e o valor/hora recalcula tudo pela mesma conta', async () => {
    const r = await createPaymentRequest(mgr(), he({ transportValue: 10 }));
    if (!r.ok) throw new Error('setup');
    const e = await approverEditRequest(sup(), r.id, { workStartTime: '18:00', workEndTime: '21:00', hourlyRate: 20, transportValue: 0 });
    expect(e.ok).toBe(true);
    const s = await prisma.paymentRequest.findUnique({ where: { id: r.id } });
    expect(Number(s?.hours)).toBe(3);
    expect(Number(s?.hourlyRate)).toBe(20);
    expect(Number(s?.amount)).toBe(60);
  });

  it('valor/hora não autorizado é recusado na correção; manter o gravado é sempre permitido', async () => {
    const r = await createPaymentRequest(mgr(), he());
    if (!r.ok) throw new Error('setup');
    const bad = await approverEditRequest(sup(), r.id, { hourlyRate: 99 });
    expect(bad.ok).toBe(false);
    const ok = await approverEditRequest(sup(), r.id, { hourlyRate: 25, workEndTime: '01:00' });
    expect(ok.ok).toBe(true);
    const s = await prisma.paymentRequest.findUnique({ where: { id: r.id } });
    expect(Number(s?.hours)).toBe(3);
    expect(Number(s?.amount)).toBe(75);
  });
});

describe('Solicitações da unidade (gerente)', () => {
  it('lista tudo da unidade, de qualquer solicitante; Minhas só as próprias; outra unidade nunca entra', async () => {
    await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitId, outraUnitId] } } });
    const a = await createPaymentRequest(mgr(), he());
    const b = await createPaymentRequest(mgr2(), he({ workStartTime: '18:00', workEndTime: '20:00' }));
    expect(a.ok && b.ok).toBe(true);
    // uma solicitação da OUTRA unidade, feita pela supervisora (avulso simples)
    const tipo = await prisma.miscPaymentType.create({ data: { name: `Avulso ${sfx}` } });
    const c = await createPaymentRequest(sup(), { type: 'MISC', unitId: outraUnitId, amount: 50, miscTypeId: tipo.id, beneficiary: 'X' });
    expect(c.ok).toBe(true);

    const daUnidade = await getUnitRequests(mgr());
    expect(daUnidade.map((r) => r.requestedById).sort()).toEqual([mgrId, mgr2Id].sort());
    expect(daUnidade.some((r) => r.unitId === outraUnitId)).toBe(false);

    const minhas = await getMyRequests(mgr());
    expect(minhas.map((r) => r.requestedById)).toEqual([mgrId]);

    // pedir a outra unidade pelo id (como faria uma URL manipulada) devolve vazio
    const forcado = await getUnitRequests(mgr(), [outraUnitId]);
    expect(forcado).toHaveLength(0);

    const totais = await getPaymentCounts(mgr());
    expect(totais.unit).toBe(2);
    expect(totais.mine).toBe(1);

    await prisma.paymentRequest.deleteMany({ where: { unitId: outraUnitId } });
    await prisma.miscPaymentType.delete({ where: { id: tipo.id } });
  });
});
