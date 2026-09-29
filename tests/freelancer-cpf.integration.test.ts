import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createFreelancer, updateFreelancer } from '@/lib/admin';
import type { SessionUser } from '@/lib/auth/session';

const unitId = 'test-cpf-unit';
const adminId = 'test-cpf-admin';
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [unitId], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  await prisma.unit.upsert({ where: { id: unitId }, create: { id: unitId, name: 'CPF Test Unit', code: 'CPFTEST' }, update: {} });
  await prisma.user.upsert({ where: { id: adminId }, create: { id: adminId, name: 'Adm CPF', email: 'cpf-test@test', passwordHash: 'x', role: 'ADMIN' }, update: {} });
});

afterAll(async () => {
  await prisma.freelancerUnit.deleteMany({ where: { unitId } });
  await prisma.freelancer.deleteMany({ where: { cpf: { in: ['52998224725', '45317828791', '34706612004'] } } });
  await prisma.freelancer.deleteMany({ where: { name: { startsWith: 'FL CPF Test' } } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
});

describe('createFreelancer com CPF', () => {
  it('recusa CPF inválido', async () => {
    const r = await createFreelancer(admin(), { name: 'FL CPF Test A', cpf: '000.000.000-00', defaultValue: 100, pixKey: 'pix@a', unitIds: [unitId] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('CPF inválido');
  });

  it('recusa CPF curto', async () => {
    const r = await createFreelancer(admin(), { name: 'FL CPF Test B', cpf: '123', defaultValue: 100, pixKey: 'pix@b', unitIds: [unitId] });
    expect(r.ok).toBe(false);
  });

  it('cria com CPF válido (guarda só dígitos)', async () => {
    const r = await createFreelancer(admin(), { name: 'FL CPF Test C', cpf: '529.982.247-25', defaultValue: 100, pixKey: 'pix@c', unitIds: [unitId] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = await prisma.freelancer.findUnique({ where: { id: r.id! } });
      expect(f?.cpf).toBe('52998224725');
    }
  });

  it('recusa CPF duplicado', async () => {
    const r = await createFreelancer(admin(), { name: 'FL CPF Test D', cpf: '529.982.247-25', defaultValue: 100, pixKey: 'pix@d', unitIds: [unitId] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('CONFLICT');
      expect(r.message).toContain('já cadastrado');
    }
  });
});

describe('updateFreelancer com CPF', () => {
  let flId: string;

  beforeAll(async () => {
    const r = await createFreelancer(admin(), { name: 'FL CPF Test E', cpf: '453.178.287-91', defaultValue: 100, pixKey: 'pix@e', unitIds: [unitId] });
    expect(r.ok).toBe(true);
    if (r.ok) flId = r.id!;
  });

  it('atualiza CPF para um novo válido', async () => {
    const r = await updateFreelancer(admin(), flId, { cpf: '347.066.120-04' });
    expect(r.ok).toBe(true);
    const f = await prisma.freelancer.findUnique({ where: { id: flId } });
    expect(f?.cpf).toBe('34706612004');
  });

  it('recusa CPF inválido na edição', async () => {
    const r = await updateFreelancer(admin(), flId, { cpf: '111.111.111-11' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('CPF inválido');
  });

  it('mantém o próprio CPF sem conflito', async () => {
    const r = await updateFreelancer(admin(), flId, { cpf: '347.066.120-04' });
    expect(r.ok).toBe(true);
  });

  it('recusa CPF de outro freelancer', async () => {
    const r = await updateFreelancer(admin(), flId, { cpf: '529.982.247-25' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('CONFLICT');
      expect(r.message).toContain('já cadastrado');
    }
  });
});
