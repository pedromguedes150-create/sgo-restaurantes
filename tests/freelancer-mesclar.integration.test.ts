import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { mesclarFreelancers } from '@/lib/payments/mesclar-freelancers';
import { possiveisDuplicados, candidatosADestino } from '@/lib/payments/duplicados';

/**
 * MESCLAR FREELANCERS — o caso do Arthur Diogo (01/10/2026): dois cadastros,
 * um sem CPF e outro completo, os dois com solicitações. O que se prova: o
 * histórico muda de dono sem ser reescrito; unidades e setores somam; CPF/PIX
 * preenchem o definitivo se faltarem; o duplicado some; só o Admin; CPFs
 * diferentes bloqueiam.
 */
const sfx = `mf${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
let unitA: string; let unitB: string; let adminId: string; let supId: string;
const admin = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false });

const cpfDe = (n: number) => `${String(100000000 + n).padStart(9, '0')}${String(n % 97).padStart(2, '0')}`.slice(0, 11);

async function freelancer(nome: string, opts: { cpf?: string | null; pix?: string | null; units: string[]; setores?: [string, number][] }) {
  return prisma.freelancer.create({
    data: {
      name: nome, cpf: opts.cpf ?? null, pixKey: opts.pix ?? null, defaultValue: 100,
      units: { create: opts.units.map((unitId) => ({ unitId })) },
      sectorRates: { create: (opts.setores ?? []).map(([sectorName, dayValue]) => ({ sectorName, dayValue })) },
    },
  });
}

async function solicitacao(freelancerId: string, unitId: string, nome: string) {
  return prisma.paymentRequest.create({
    data: {
      unitId, type: 'FREELANCER', amount: 100, standardValue: 100, description: `Freelancer ${nome}`,
      freelancerId, requestedById: adminId, workDate: new Date('2026-09-15T12:00:00Z'),
    },
  });
}

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `MFA-${sfx}`, name: `Mescla A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `MFB-${sfx}`, name: `Mescla B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
});

beforeEach(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.freelancer.deleteMany({ where: { name: { endsWith: sfx } } });
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.freelancer.deleteMany({ where: { name: { endsWith: sfx } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, supId] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, supId] } } });
  await prisma.$disconnect();
});

describe('mesclarFreelancers', () => {
  it('o histórico muda de dono sem ser reescrito; unidades somam; setores e CPF/PIX completam o definitivo; o duplicado some', async () => {
    const nome = `Arthur Diogo ${sfx}`;
    const dup = await freelancer(nome, { cpf: null, pix: '12829008626', units: [unitA], setores: [['Churrasqueira', 150]] });
    const dest = await freelancer(nome, { cpf: cpfDe(1), pix: null, units: [unitB], setores: [['Cozinha', 120]] });
    await solicitacao(dup.id, unitA, nome);
    await solicitacao(dup.id, unitA, nome);
    await solicitacao(dest.id, unitB, nome);

    const r = await mesclarFreelancers(admin(), { duplicadoId: dup.id, destinoId: dest.id });
    expect(r).toMatchObject({ ok: true, id: dest.id, solicitacoes: 2, unidadesSomadas: 1, setoresCopiados: 1 });

    expect(await prisma.freelancer.findUnique({ where: { id: dup.id } })).toBeNull();
    const d = await prisma.freelancer.findUniqueOrThrow({ where: { id: dest.id }, include: { units: true, sectorRates: true, requests: true } });
    expect(d.requests).toHaveLength(3);
    expect(d.requests.every((q) => q.description === `Freelancer ${nome}` && Number(q.standardValue) === 100)).toBe(true); // snapshot intacto
    expect(d.units.map((u) => u.unitId).sort()).toEqual([unitA, unitB].sort());
    expect(d.sectorRates.map((s) => s.sectorName).sort()).toEqual(['Churrasqueira', 'Cozinha']);
    expect(d.cpf).toBe(cpfDe(1));
    expect(d.pixKey).toBe('12829008626'); // o definitivo estava sem PIX
    expect(await prisma.paymentRequest.count({ where: { freelancerId: null, unitId: { in: [unitA, unitB] } } })).toBe(0);

    const a = await prisma.auditLog.findFirst({ where: { action: 'FREELANCER_MERGE', entityId: dest.id } });
    expect((a?.metadata as { solicitacoesTransferidas?: number })?.solicitacoesTransferidas).toBe(2);
  });

  it('o CPF do duplicado passa para o definitivo que está sem CPF (único no banco)', async () => {
    const nome = `Brena ${sfx}`;
    const dup = await freelancer(nome, { cpf: cpfDe(2), units: [unitA] });
    const dest = await freelancer(nome, { cpf: null, units: [unitA] });
    const r = await mesclarFreelancers(admin(), { duplicadoId: dup.id, destinoId: dest.id });
    expect(r.ok).toBe(true);
    expect((await prisma.freelancer.findUniqueOrThrow({ where: { id: dest.id } })).cpf).toBe(cpfDe(2));
  });

  it('CPFs diferentes nos dois cadastros bloqueiam (não parecem a mesma pessoa)', async () => {
    const dup = await freelancer(`X ${sfx}`, { cpf: cpfDe(3), units: [unitA] });
    const dest = await freelancer(`X ${sfx}`, { cpf: cpfDe(4), units: [unitA] });
    const r = await mesclarFreelancers(admin(), { duplicadoId: dup.id, destinoId: dest.id });
    expect(r).toMatchObject({ ok: false, reason: 'CONFLICT' });
    expect(await prisma.freelancer.count({ where: { id: { in: [dup.id, dest.id] } } })).toBe(2);
  });

  it('só o Admin; consigo mesmo e id inexistente são recusados', async () => {
    const a = await freelancer(`Y ${sfx}`, { units: [unitA] });
    const b = await freelancer(`Y ${sfx}`, { units: [unitA] });
    expect(await mesclarFreelancers(sup(), { duplicadoId: a.id, destinoId: b.id })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await mesclarFreelancers(admin(), { duplicadoId: a.id, destinoId: a.id })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await mesclarFreelancers(admin(), { duplicadoId: a.id, destinoId: 'nao-existe' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await prisma.freelancer.count({ where: { id: { in: [a.id, b.id] } } })).toBe(2);
  });
});

describe('possiveisDuplicados / candidatosADestino (puros)', () => {
  const lista = [
    { id: '1', name: 'Arthur Diogo', active: true },
    { id: '2', name: 'ARTHUR  DIOGO', active: true },
    { id: '3', name: 'Brena Campos', active: true },
    { id: '4', name: 'Brena Campos', active: false },
    { id: '5', name: 'Zé', active: true },
  ];
  it('marca só quem tem outro cadastro ATIVO com o mesmo nome (sem caixa/espaços)', () => {
    expect([...possiveisDuplicados(lista)].sort()).toEqual(['1', '2']);
  });
  it('candidatos a destino excluem o próprio e põem o homônimo primeiro', () => {
    expect(candidatosADestino(lista, '1').map((c) => c.id)).toEqual(['2', '3', '4', '5']);
  });
});
