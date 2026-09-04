import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { approverEditRequest } from '@/lib/payments/approve';
import { semanaDe, avaliarRecorrencia, setFreelancerWeekLimit } from '@/lib/payments/recorrencia';
import { getToApprove, getPaymentCounts } from '@/lib/payments/query';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Recorrência de freelancer (04/09): o mesmo freelancer mais de N vezes na
 * semana (segunda→domingo, pelo dia do trabalho, rede inteira) marca a
 * solicitação e avisa a supervisão. E as listas de Pagamentos obedecem o
 * filtro de unidade.
 */

const sfx = `rc${process.pid.toString(36)}`;
let unitId: string; let unit2Id: string; let setorId: string; let setor2Id: string;
let mgrId: string; let supId: string; let admId: string; let freelaId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId, unit2Id], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Supervisora', role: 'SUPERVISOR', unitIds: [unitId, unit2Id], seesAllUnits: false, needsTerms: false });
const adm = (): SessionUser => ({ id: admId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `RC-${sfx}`, name: 'U Rec', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unit2Id = (await prisma.unit.create({ data: { code: `RC2-${sfx}`, name: 'U Rec 2', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  setorId = (await prisma.sector.create({ data: { unitId, name: 'Bar' } })).id;
  setor2Id = (await prisma.sector.create({ data: { unitId: unit2Id, name: 'Bar' } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}-m@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Supervisora', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  admId = (await prisma.user.create({ data: { name: 'Admin', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: mgrId, unitId }, { userId: mgrId, unitId: unit2Id }, { userId: supId, unitId }, { userId: supId, unitId: unit2Id }] });
  freelaId = (await prisma.freelancer.create({ data: { name: 'Freela Rec', defaultValue: 100, pixKey: '1', units: { create: [{ unitId }, { unitId: unit2Id }] } } })).id;
});

afterEach(async () => {
  await prisma.paymentRequest.deleteMany({ where: { freelancerId: freelaId } });
  await prisma.notification.deleteMany({ where: { userId: { in: [supId, admId] } } });
  await prisma.appSetting.deleteMany({ where: { key: 'FREELANCER_WEEK_LIMIT' } });
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitId, unit2Id] } } }).catch(() => {});
  await prisma.freelancer.delete({ where: { id: freelaId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [mgrId, supId] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, unit2Id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId, admId] } } }).catch(() => {});
  await prisma.$disconnect();
});

const lancar = (workDate: string, u = unitId, s = setorId) =>
  createPaymentRequest(mgr(), { type: 'FREELANCER', unitId: u, amount: 100, freelancerId: freelaId, workDate, workSectorId: s });

async function flags(id: string) {
  const r = await prisma.paymentRequest.findUnique({ where: { id }, select: { weekCount: true, recurrent: true } });
  return { weekCount: r?.weekCount, recurrent: r?.recurrent };
}

describe('A semana vai de segunda a domingo', () => {
  it('quarta 02/09/2026 cai na semana de segunda 31/08', () => {
    const { start, end } = semanaDe('2026-09-02');
    expect(start.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(end.toISOString().slice(0, 10)).toBe('2026-09-07');
  });
  it('domingo fecha a semana; segunda abre outra', () => {
    expect(semanaDe('2026-09-06').start.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(semanaDe('2026-09-07').start.toISOString().slice(0, 10)).toBe('2026-09-07');
  });
});

describe('Mais de 2 na mesma semana marca e avisa', () => {
  it('1ª e 2ª passam limpas; a 3ª nasce Recorrente e a supervisão é avisada', async () => {
    const a = await lancar('2026-09-01'); const b = await lancar('2026-09-03'); const c = await lancar('2026-09-05');
    if (!a.ok || !b.ok || !c.ok) throw new Error('setup');
    expect(await flags(a.id)).toEqual({ weekCount: 1, recurrent: false });
    expect(await flags(b.id)).toEqual({ weekCount: 2, recurrent: false });
    expect(await flags(c.id)).toEqual({ weekCount: 3, recurrent: true });
    const avisoSup = await prisma.notification.findFirst({ where: { userId: supId, title: { contains: 'recorrente' } } });
    const avisoAdm = await prisma.notification.findFirst({ where: { userId: admId, title: { contains: 'recorrente' } } });
    expect(avisoSup?.body).toContain('3 solicitações');
    expect(avisoSup?.body).toContain('limite 2');
    expect(avisoAdm).not.toBeNull();
  });

  it('conta a rede inteira: a 3ª em OUTRA unidade também marca', async () => {
    await lancar('2026-09-01'); await lancar('2026-09-02');
    const c = await lancar('2026-09-04', unit2Id, setor2Id);
    if (!c.ok) throw new Error('setup');
    expect(await flags(c.id)).toEqual({ weekCount: 3, recurrent: true });
  });

  it('semana seguinte recomeça do zero', async () => {
    await lancar('2026-09-01'); await lancar('2026-09-02'); await lancar('2026-09-03');
    const d = await lancar('2026-09-08');
    if (!d.ok) throw new Error('setup');
    expect(await flags(d.id)).toEqual({ weekCount: 1, recurrent: false });
  });

  it('rejeitada não conta', async () => {
    const a = await lancar('2026-09-01'); await lancar('2026-09-02');
    if (!a.ok) throw new Error('setup');
    await prisma.paymentRequest.update({ where: { id: a.id }, data: { status: 'REJECTED' } });
    const c = await lancar('2026-09-04');
    if (!c.ok) throw new Error('setup');
    expect(await flags(c.id)).toEqual({ weekCount: 2, recurrent: false });
  });

  it('o limite é configurável pelo Admin', async () => {
    expect((await setFreelancerWeekLimit(mgr(), 5)).ok).toBe(false);
    expect((await setFreelancerWeekLimit(adm(), 3)).ok).toBe(true);
    await lancar('2026-09-01'); await lancar('2026-09-02');
    const c = await lancar('2026-09-03');
    if (!c.ok) throw new Error('setup');
    expect(await flags(c.id)).toEqual({ weekCount: 3, recurrent: false });
    expect((await avaliarRecorrencia(freelaId, '2026-09-04')).limit).toBe(3);
  });

  it('o aprovador mudar o dia para uma semana cheia refaz a contagem e marca', async () => {
    await lancar('2026-09-01'); await lancar('2026-09-02');
    const d = await lancar('2026-09-08');
    if (!d.ok) throw new Error('setup');
    expect(await flags(d.id)).toEqual({ weekCount: 1, recurrent: false });
    const r = await approverEditRequest(sup(), d.id, { workDate: '2026-09-04' });
    expect(r).toEqual({ ok: true });
    expect(await flags(d.id)).toEqual({ weekCount: 3, recurrent: true });
    expect(await prisma.notification.findFirst({ where: { userId: supId, title: { contains: 'recorrente' } } })).not.toBeNull();
  });
});

describe('As listas de Pagamentos obedecem o filtro de unidade', () => {
  it('Para Aprovar e os totais mostram só a unidade pedida', async () => {
    await lancar('2026-09-01'); await lancar('2026-09-08', unit2Id, setor2Id);
    const todas = await getToApprove(sup());
    const so1 = await getToApprove(sup(), [unitId]);
    expect(todas.filter((r) => r.freelancerId === freelaId)).toHaveLength(2);
    expect(so1.filter((r) => r.freelancerId === freelaId)).toHaveLength(1);
    expect(so1.every((r) => r.unitId === unitId)).toBe(true);
    const totais = await getPaymentCounts(sup(), [unit2Id]);
    expect(totais.toApprove).toBe(1);
  });
});
