import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { saveWasteEntry } from '@/lib/waste/save';
import type { SessionUser } from '@/lib/auth/session';

const sfx = process.pid.toString(36);
let unitId: string;
let userId: string;
let catId: string;
const user = (): SessionUser => ({ id: userId, name: 'T', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false });

const OP = '2026-06-20';
const PRIOR = ['2026-06-13', '2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'];

beforeAll(async () => {
  const unit = await prisma.unit.create({
    data: { code: `WST-${sfx}`, name: 'Unidade Waste', timezone: 'America/Sao_Paulo', cutoffHour: 4 },
  });
  unitId = unit.id;
  const u = await prisma.user.create({
    data: { name: 'Ger', email: `wst-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' },
  });
  userId = u.id;
  await prisma.unitMembership.create({ data: { userId, unitId } });
  const cat = await prisma.wasteCategory.create({ data: { code: `TCAT-${sfx}`, name: 'Cat Teste', order: 99 } });
  catId = cat.id;

  // 7 dias anteriores com 10 KG na categoria (média = 10)
  for (const d of PRIOR) {
    await prisma.wasteEntry.create({
      data: { unitId, operationalDate: d, items: { create: [{ categoryId: catId, kg: 10 }] } },
    });
  }
  // tarefa WASTE pendente do dia (sem exigir evidência)
  const tpl = await prisma.taskTemplate.create({
    data: { unitId, name: 'Perdas', module: 'WASTE', requiresEvidence: false, limitTime: '23:00' },
  });
  await prisma.taskInstance.create({
    data: { templateId: tpl.id, unitId, operationalDate: OP, dueAt: new Date(`${OP}T23:00:00Z`) },
  });
});

afterAll(async () => {
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.wasteCategory.delete({ where: { id: catId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Desperdícios (Módulo 2)', () => {
  it('alerta quando categoria sobe > 20% vs média de 7 dias', async () => {
    const r = await saveWasteEntry(user(), { unitId, operationalDate: OP, items: [{ categoryId: catId, kg: 13 }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.alerts).toHaveLength(1);
      expect(r.alerts[0].increasePct).toBe(30); // 13 vs média 10
    }
  });

  it('salvar conclui a tarefa WASTE do dia (idempotente, 1 lançamento/dia)', async () => {
    await saveWasteEntry(user(), { unitId, operationalDate: OP, items: [{ categoryId: catId, kg: 8 }] });
    // continua existindo apenas 1 lançamento para o dia
    const count = await prisma.wasteEntry.count({ where: { unitId, operationalDate: OP } });
    expect(count).toBe(1);
    // a tarefa WASTE do dia ficou concluída
    const task = await prisma.taskInstance.findFirst({ where: { unitId, operationalDate: OP } });
    expect(task?.status).toBe('DONE');
    expect(task?.completedById).toBe(userId);
  });

  it('nega lançamento fora do escopo de unidade', async () => {
    const outsider: SessionUser = { id: userId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false };
    const r = await saveWasteEntry(outsider, { unitId, operationalDate: OP, items: [{ categoryId: catId, kg: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});
