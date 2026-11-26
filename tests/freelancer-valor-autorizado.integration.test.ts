import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { approverEditRequest } from '@/lib/payments/approve';
import { addAltRate, removeAltRate, listAltRatesByUnit, computeFreelancerAmount } from '@/lib/freelancer/pricing';
import { currentOperationalDate } from '@/lib/date/operational';
import type { SessionUser } from '@/lib/auth/session';

/**
 * v1.226.0 — o valor/hora do freelancer pode ser outro, desde que AUTORIZADO
 * pelo Admin para a unidade naquele tipo de dia. Quem lança escolhe da lista.
 */
const sfx = `fv${process.pid.toString(36)}`;
let unitId: string; let setorId: string; let mgrId: string; let supId: string; let admId: string; let freelaId: string;
const mgr = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Supervisora', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const adm = (): SessionUser => ({ id: admId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const HOJE = currentOperationalDate({ timezone: 'America/Sao_Paulo', cutoffHour: 4 });
const TIPOS = ['WEEKDAY', 'WEEKEND', 'HOLIDAY'] as const;

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `FV-${sfx}`, name: 'U Valor', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  setorId = (await prisma.sector.create({ data: { unitId, name: 'Salão' } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}-m@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Supervisora', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  admId = (await prisma.user.create({ data: { name: 'Admin', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: mgrId, unitId }, { userId: supId, unitId }] });
  freelaId = (await prisma.freelancer.create({ data: { name: 'Freela Valor', defaultValue: 100, pixKey: '1', units: { create: { unitId } } } })).id;
  /* O padrão é 15 em qualquer tipo de dia: o teste não depende do dia em que roda. */
  await prisma.freelancerHourlyRate.createMany({ data: TIPOS.map((dayType) => ({ unitId, dayType, value: 15 })) });
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.freelancer.delete({ where: { id: freelaId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [mgrId, supId] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId, admId] } } }).catch(() => {});
  await prisma.$disconnect();
});

const base = () => ({ type: 'FREELANCER' as const, unitId, amount: 0, freelancerId: freelaId, workDate: HOJE, workSectorId: setorId, workStartTime: '10:00', workEndTime: '14:00' });

describe('cadastro dos valores autorizados', () => {
  it('só o Admin autoriza; o valor igual ao padrão e o repetido são recusados', async () => {
    expect((await addAltRate(mgr(), unitId, 'WEEKDAY', 18)).ok).toBe(false);
    for (const t of TIPOS) expect((await addAltRate(adm(), unitId, t, 18)).ok).toBe(true);
    const igualAoPadrao = await addAltRate(adm(), unitId, 'WEEKDAY', 15);
    expect(igualAoPadrao).toMatchObject({ ok: false, reason: 'CONFLICT' });
    expect(await addAltRate(adm(), unitId, 'WEEKDAY', 18)).toMatchObject({ ok: false, reason: 'CONFLICT' });
    expect(await addAltRate(adm(), unitId, 'WEEKDAY', 0)).toMatchObject({ ok: false, reason: 'INVALID' });
    expect((await listAltRatesByUnit())[unitId]?.WEEKDAY?.map((x) => x.value)).toEqual([18]);
  });
});

describe('lançamento', () => {
  it('sem escolher, sai pelo padrão — sem divergência', async () => {
    const r = await createPaymentRequest(mgr(), base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = await prisma.paymentRequest.findUnique({ where: { id: r.id }, select: { amount: true, hourlyRate: true, divergent: true } });
    expect(Number(s?.amount)).toBe(60);
    expect(Number(s?.hourlyRate)).toBe(15);
    expect(s?.divergent).toBe(false);
  });

  it('com o valor autorizado, calcula por ele e marca a divergência com o que daria pelo padrão', async () => {
    const r = await createPaymentRequest(mgr(), { ...base(), workStartTime: '15:00', workEndTime: '19:00', hourlyRate: 18, transportValue: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = await prisma.paymentRequest.findUnique({ where: { id: r.id }, select: { amount: true, hourlyRate: true, divergent: true, standardValue: true } });
    expect(Number(s?.amount)).toBe(82); // 4h × 18 + 10
    expect(Number(s?.hourlyRate)).toBe(18);
    expect(s?.divergent).toBe(true);
    expect(Number(s?.standardValue)).toBe(70); // 4h × 15 + 10
  });

  it('valor que não está na lista é recusado, mesmo vindo por fora da tela', async () => {
    const r = await createPaymentRequest(mgr(), { ...base(), workStartTime: '20:00', workEndTime: '22:00', hourlyRate: 40 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/autorizado/i);
  });
});

describe('correção do aprovador', () => {
  it('mudar o horário mantém o valor/hora escolhido — mesmo depois de ele sair da lista', async () => {
    const r = await createPaymentRequest(mgr(), { ...base(), workStartTime: '06:00', workEndTime: '08:00', hourlyRate: 18 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const linha of Object.values((await listAltRatesByUnit())[unitId] ?? {}).flat()) await removeAltRate(adm(), linha!.id);
    expect((await computeFreelancerAmount({ unitId, dateISO: HOJE, start: '06:00', end: '08:00' })).opcoes).toEqual([15]);

    const e = await approverEditRequest(sup(), r.id, { workStartTime: '06:00', workEndTime: '09:00' });
    expect(e.ok).toBe(true);
    const s = await prisma.paymentRequest.findUnique({ where: { id: r.id }, select: { amount: true, hourlyRate: true, divergent: true } });
    expect(Number(s?.amount)).toBe(54); // 3h × 18
    expect(Number(s?.hourlyRate)).toBe(18);
    expect(s?.divergent).toBe(true);

    /* Um valor NOVO precisa estar autorizado; voltar ao padrão sempre pode. */
    expect((await approverEditRequest(sup(), r.id, { hourlyRate: 25 })).ok).toBe(false);
    expect((await approverEditRequest(sup(), r.id, { hourlyRate: 15 })).ok).toBe(true);
    const fim = await prisma.paymentRequest.findUnique({ where: { id: r.id }, select: { amount: true, divergent: true } });
    expect(Number(fim?.amount)).toBe(45);
    expect(fim?.divergent).toBe(false);
  });
});
