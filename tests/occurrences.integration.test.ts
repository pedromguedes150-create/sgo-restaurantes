import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createOccurrence } from '@/lib/occurrences/create';
import { closeOccurrence } from '@/lib/occurrences/close';
import type { SessionUser } from '@/lib/auth/session';

const sfx = process.pid.toString(36);
let unitId: string;
let mgrId: string;
let supId: string;
let typeId: string;
let catId: string;
let catId2: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `OCC-${sfx}`, name: 'U Occ', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  mgrId = (await prisma.user.create({ data: { name: 'M', email: `occm-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'S', email: `occs-${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: mgrId, unitId }, { userId: supId, unitId }] });
  const type = await prisma.occurrenceType.create({ data: { code: `T-${sfx}`, name: 'Tipo Teste' } });
  typeId = type.id;
  catId = (await prisma.occurrenceCategory.create({ data: { typeId, name: 'Cat A' } })).id;
  catId2 = (await prisma.occurrenceCategory.create({ data: { typeId, name: 'Cat B' } })).id;
});

afterAll(async () => {
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.occurrenceType.delete({ where: { id: typeId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Ocorrências (Módulo 6)', () => {
  it('numera sequencialmente por unidade', async () => {
    const a = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId2, gravity: 'LOW', description: 'um' });
    const b = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId2, gravity: 'LOW', description: 'dois' });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.number).toBe(a.number + 1);
  });

  it('marca reincidência (mesmo tipo+categoria <30 dias)', async () => {
    const first = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId, gravity: 'MEDIUM', description: 'primeira' });
    const second = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId, gravity: 'MEDIUM', description: 'repetida' });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok) expect(first.isRecurrence).toBe(false);
    if (second.ok) expect(second.isRecurrence).toBe(true);
  });

  it('gerente NÃO pode encerrar; supervisor pode (com ação corretiva)', async () => {
    const created = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId2, gravity: 'HIGH', description: 'p/ encerrar' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const denied = await closeOccurrence(mgr(), created.id, { justification: 'x', correctiveAction: 'y', reviewDate: new Date() });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('FORBIDDEN');

    const ok = await closeOccurrence(sup(), created.id, { justification: 'apurado', correctiveAction: 'treinamento', reviewDate: new Date('2026-12-01') });
    expect(ok.ok).toBe(true);

    const fresh = await prisma.occurrence.findUnique({ where: { id: created.id } });
    expect(fresh?.status).toBe('CLOSED');
    expect(fresh?.closedById).toBe(supId);
  });

  it('nega criação fora do escopo de unidade', async () => {
    const outsider: SessionUser = { id: mgrId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await createOccurrence(outsider, { unitId, typeId, categoryId: catId, gravity: 'LOW', description: 'fora' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});
