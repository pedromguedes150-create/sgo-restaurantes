import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { completeTask } from '@/lib/tasks/complete';
import { markMissedTasks } from '@/lib/tasks/maintenance';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Teste de integração contra o Postgres de DEV (localhost:5433).
 * Prova: conclusão transacional (regra nº 8), evidência obrigatória e
 * marcação de "não realizada".
 */
const suffix = process.pid.toString(36);
let unitId: string;
let userId: string;
const user = (): SessionUser => ({ id: userId, name: 'Teste', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({
    data: { code: `TST-${suffix}`, name: 'Unidade Teste', timezone: 'America/Sao_Paulo', cutoffHour: 4 },
  });
  unitId = unit.id;
  const u = await prisma.user.create({
    data: { name: 'Gerente Teste', email: `tst-${suffix}@example.com`, role: 'MANAGER', passwordHash: 'x' },
  });
  userId = u.id;
  await prisma.unitMembership.create({ data: { userId, unitId } });
});

afterAll(async () => {
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

async function makeInstance(opts: { requiresEvidence?: boolean; operationalDate?: string } = {}) {
  const tpl = await prisma.taskTemplate.create({
    data: {
      unitId,
      name: 'Tarefa Teste',
      requiresEvidence: opts.requiresEvidence ?? false,
      limitTime: '23:00',
    },
  });
  return prisma.taskInstance.create({
    data: {
      templateId: tpl.id,
      unitId,
      operationalDate: opts.operationalDate ?? '2026-06-10',
      // Prazo dinâmico no futuro: conclusão dentro do prazo = DONE (a data
      // operacional do teste de "não realizada" é que define o MISSED).
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

describe('conclusão transacional (regra nº 8)', () => {
  it('dois gerentes concluindo ao mesmo tempo geram UM único registro', async () => {
    const inst = await makeInstance();
    const [a, b] = await Promise.all([
      completeTask(inst.id, user()),
      completeTask(inst.id, user()),
    ]);
    const oks = [a, b].filter((r) => r.ok).length;
    const already = [a, b].filter((r) => !r.ok && r.reason === 'ALREADY_DONE').length;
    expect(oks).toBe(1);
    expect(already).toBe(1);

    const fresh = await prisma.taskInstance.findUnique({ where: { id: inst.id } });
    expect(fresh?.status).toBe('DONE');
    expect(fresh?.completedById).toBe(userId);
  });

  it('tarefa que exige evidência não conclui sem foto', async () => {
    const inst = await makeInstance({ requiresEvidence: true });
    const r = await completeTask(inst.id, user());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('EVIDENCE_REQUIRED');

    const ok = await completeTask(inst.id, user(), { evidencePath: 'uploads/x/y.jpg' });
    expect(ok.ok).toBe(true);
  });

  it('nega conclusão fora do escopo de unidade (regra nº 3)', async () => {
    const inst = await makeInstance();
    const outsider: SessionUser = { id: userId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await completeTask(inst.id, outsider);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});

describe('"não realizada" automática', () => {
  it('tarefa pendente de dia operacional encerrado vira MISSED', async () => {
    const inst = await makeInstance({ operationalDate: '2020-01-01' }); // dia bem no passado
    await markMissedTasks();
    const fresh = await prisma.taskInstance.findUnique({ where: { id: inst.id } });
    expect(fresh?.status).toBe('MISSED');
  });
});
