import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { submitCount } from '@/lib/commands/count';
import { closeDivergence, addReplacement } from '@/lib/commands/lifecycle';
import { getActiveSequence } from '@/lib/commands/active';
import type { SessionUser } from '@/lib/auth/session';

const sfx = process.pid.toString(36);
let unitId: string;
let mgrId: string;
let supId: string;
let admId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'M', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false });
const sup = (): SessionUser => ({ id: supId, name: 'S', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false });
const adm = (): SessionUser => ({ id: admId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `CMD-${sfx}`, name: 'U Cmd', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  await prisma.commandSequence.create({ data: { unitId, name: 'Principal', rangeStart: 1, rangeEnd: 100, order: 0 } });
  mgrId = (await prisma.user.create({ data: { name: 'M', email: `cm-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'S', email: `cs-${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  admId = (await prisma.user.create({ data: { name: 'A', email: `ca-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: mgrId, unitId }, { userId: supId, unitId }] });
});

afterAll(async () => {
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId, admId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Comandas (Módulo 3)', () => {
  it('exige observação quando há ausentes', async () => {
    const r = await submitCount(mgr(), { unitId, operationalDate: '2026-06-01', allPresent: false, absentNumbers: [5] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('OBSERVATION_REQUIRED');
  });

  it('ausente vira divergência; reenvio não duplica', async () => {
    const r1 = await submitCount(mgr(), { unitId, operationalDate: '2026-06-02', allPresent: false, absentNumbers: [5], observation: 'sumiu' });
    expect(r1.ok && r1.newDivergences).toBe(1);
    const r2 = await submitCount(mgr(), { unitId, operationalDate: '2026-06-03', allPresent: false, absentNumbers: [5], observation: 'ainda' });
    expect(r2.ok && r2.newDivergences).toBe(0);
  });

  it('baixa (perdida) sai da sequência ativa e não reaparece', async () => {
    const div = await prisma.commandDivergence.findFirst({ where: { unitId, number: 5, status: { in: ['OPEN', 'INVESTIGATING'] } } });
    const closed = await closeDivergence(sup(), div!.id, 'LOST');
    expect(closed.ok).toBe(true);

    const seq = await getActiveSequence(unitId);
    expect(seq.active.has(5)).toBe(false);

    // contar 5 como ausente agora: já não pertence à ativa → nenhuma nova divergência
    const r = await submitCount(mgr(), { unitId, operationalDate: '2026-06-04', allPresent: false, absentNumbers: [5], observation: 'x' });
    expect(r.ok && r.newDivergences).toBe(0);
  });

  it('recuperada mantém a comanda na sequência ativa', async () => {
    await submitCount(mgr(), { unitId, operationalDate: '2026-06-05', allPresent: false, absentNumbers: [7], observation: 'sumiu' });
    const div = await prisma.commandDivergence.findFirst({ where: { unitId, number: 7, status: { in: ['OPEN', 'INVESTIGATING'] } } });
    const r = await closeDivergence(sup(), div!.id, 'RECOVERED');
    expect(r.ok).toBe(true);
    const seq = await getActiveSequence(unitId);
    expect(seq.active.has(7)).toBe(true);
  });

  it('reposição (Admin) entra na ativa; gerente não pode repor', async () => {
    const denied = await addReplacement(mgr(), unitId, 200, 'nao pode');
    expect(denied.ok).toBe(false);
    const ok = await addReplacement(adm(), unitId, 200, 'reposta');
    expect(ok.ok).toBe(true);
    const seq = await getActiveSequence(unitId);
    expect(seq.active.has(200)).toBe(true);
  });

  it('nega contagem fora do escopo', async () => {
    const outsider: SessionUser = { id: mgrId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false };
    const r = await submitCount(outsider, { unitId, allPresent: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});
