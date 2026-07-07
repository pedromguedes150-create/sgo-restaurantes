import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { saveEvaluation, addObservation, listObservations, getEvaluationMonthStats, getEvaluationWeight } from '@/lib/people/evaluation';
import type { SessionUser } from '@/lib/auth/session';

const sfx = `evl${process.pid.toString(36)}`;
let unitId: string;
let userId: string;
let collabId: string;
const user = (): SessionUser => ({ id: userId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

function ym(offsetMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const CURRENT = ym(0);
const PAST = ym(-1);

beforeAll(async () => {
  const unit = await prisma.unit.create({
    data: { code: `EVL-${sfx}`, name: 'Unidade Aval', timezone: 'America/Sao_Paulo', cutoffHour: 4 },
  });
  unitId = unit.id;
  const u = await prisma.user.create({
    data: { name: 'Ger', email: `${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' },
  });
  userId = u.id;
  await prisma.unitMembership.create({ data: { userId, unitId } });
  const c = await prisma.collaborator.create({ data: { name: 'Colab Teste', active: true } });
  collabId = c.id;
  await prisma.collaboratorUnit.create({ data: { collaboratorId: collabId, unitId } });
});

afterAll(async () => {
  await prisma.collaboratorEvaluation.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaboratorObservation.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaborator.delete({ where: { id: collabId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Avaliação do colaborador (item 13) — regras da meta', () => {
  it('peso padrão é 0 (não mexe nas notas atuais até o Admin ligar)', async () => {
    expect(await getEvaluationWeight()).toBe(0);
  });

  it('nota fora de 1–5 é rejeitada', async () => {
    const r = await saveEvaluation(user(), collabId, CURRENT, { punctuality: 0, performance: 3, teamwork: 3, presentation: 3 });
    expect(r.ok).toBe(false);
  });

  it('mês futuro é rejeitado', async () => {
    const r = await saveEvaluation(user(), collabId, ym(1), { punctuality: 3, performance: 3, teamwork: 3, presentation: 3 });
    expect(r.ok).toBe(false);
  });

  it('salvar 2x no mesmo mês faz upsert (1 registro por colaborador/mês)', async () => {
    const r1 = await saveEvaluation(user(), collabId, CURRENT, { punctuality: 4, performance: 4, teamwork: 4, presentation: 4 });
    expect(r1.ok).toBe(true);
    const r2 = await saveEvaluation(user(), collabId, CURRENT, { punctuality: 5, performance: 5, teamwork: 5, presentation: 5, comments: 'melhorou' });
    expect(r2.ok).toBe(true);
    const rows = await prisma.collaboratorEvaluation.findMany({ where: { collaboratorId: collabId, yearMonth: CURRENT } });
    expect(rows).toHaveLength(1);
    expect(rows[0].punctuality).toBe(5);
  });

  it('mês corrente nunca penaliza (missed = 0 mesmo sem avaliar todos)', async () => {
    // remove a avaliação para simular pendência no mês corrente
    await prisma.collaboratorEvaluation.deleteMany({ where: { unitId, yearMonth: CURRENT } });
    const s = await getEvaluationMonthStats(unitId, CURRENT);
    expect(s.done).toBe(0);
    expect(s.missed).toBe(0);
  });

  it('mês encerrado sem avaliação penaliza (missed = ativos sem avaliação)', async () => {
    const s = await getEvaluationMonthStats(unitId, PAST);
    expect(s.done).toBe(0);
    expect(s.missed).toBe(1); // 1 colaborador ativo, nenhum avaliado
  });

  it('observação não altera o cadastro e fica listada com autor', async () => {
    const r = await addObservation(user(), collabId, 'Chegou 10 min atrasado');
    expect(r.ok).toBe(true);
    const list = await listObservations(user(), collabId);
    expect(list).toHaveLength(1);
    expect(list[0].authorName).toBe('Ger');
    const c = await prisma.collaborator.findUnique({ where: { id: collabId } });
    expect(c?.name).toBe('Colab Teste'); // cadastro intocado
  });

  it('FINANCE não avalia', async () => {
    const fin: SessionUser = { id: userId, name: 'F', role: 'FINANCE', unitIds: [unitId], seesAllUnits: false, needsTerms: false };
    const r = await saveEvaluation(fin, collabId, CURRENT, { punctuality: 3, performance: 3, teamwork: 3, presentation: 3 });
    expect(r.ok).toBe(false);
  });
});
