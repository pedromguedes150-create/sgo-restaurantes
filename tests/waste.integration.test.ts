import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { subDays, format } from 'date-fns';
import { prisma } from '@/lib/db/prisma';
import { saveWasteEntry } from '@/lib/waste/save';
import { currentOperationalDate } from '@/lib/date/operational';
import type { SessionUser } from '@/lib/auth/session';

const sfx = process.pid.toString(36);
let unitId: string;
let userId: string;
let catId: string;
const user = (): SessionUser => ({ id: userId, name: 'T', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: userId, name: 'A', role: 'ADMIN', unitIds: [unitId], seesAllUnits: true, needsTerms: false });

// Datas dinâmicas: OP = o dia operacional de HOJE da unidade (o gerente só
// lança o dia — v1.167.1); PRIOR = os 7 dias anteriores a OP (base da média).
const OP = currentOperationalDate({ timezone: 'America/Sao_Paulo', cutoffHour: 4 });
const PRIOR = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(`${OP}T12:00:00`), 1 + i), 'yyyy-MM-dd'));
const ONTEM = PRIOR[0];

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
    const outsider: SessionUser = { id: userId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await saveWasteEntry(outsider, { unitId, operationalDate: OP, items: [{ categoryId: catId, kg: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('rejeita data futura ou malformada, para qualquer perfil', async () => {
    const futuro = format(subDays(new Date(`${OP}T12:00:00`), -2), 'yyyy-MM-dd');
    for (const bad of [futuro, '2026-13-99', 'lixo']) {
      for (const quem of [user(), admin()]) {
        const r = await saveWasteEntry(quem, { unitId, operationalDate: bad, items: [{ categoryId: catId, kg: 1 }] });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('INVALID');
      }
    }
  });

  /* Decisão do Pedro (14/10/2026): o gerente lança o desperdício NO DIA; dia
     anterior é só do Administrador. A regra mora no servidor — a tela esconder
     o seletor não é porta, e um `?date=` montado à mão cai aqui. */
  it('gerente NÃO lança dia anterior (nem ontem): DATA_SO_ADMIN', async () => {
    const velho = format(subDays(new Date(`${OP}T12:00:00`), 30), 'yyyy-MM-dd');
    for (const dia of [ONTEM, velho]) {
      const r = await saveWasteEntry(user(), { unitId, operationalDate: dia, items: [{ categoryId: catId, kg: 1 }] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('DATA_SO_ADMIN');
    }
    expect(await prisma.wasteEntry.count({ where: { unitId, operationalDate: velho } })).toBe(0);
  });

  it('gerente lança HOJE sem informar a data (cai no dia operacional) e informando-a', async () => {
    const semData = await saveWasteEntry(user(), { unitId, items: [{ categoryId: catId, kg: 2 }] });
    expect(semData.ok).toBe(true);
    if (semData.ok) expect(semData.operationalDate).toBe(OP);
    const comData = await saveWasteEntry(user(), { unitId, operationalDate: OP, items: [{ categoryId: catId, kg: 3 }] });
    expect(comData.ok).toBe(true);
  });

  it('Administrador lança/corrige qualquer dia anterior (ontem e 30 dias atrás)', async () => {
    const velho = format(subDays(new Date(`${OP}T12:00:00`), 30), 'yyyy-MM-dd');
    for (const dia of [ONTEM, velho]) {
      const r = await saveWasteEntry(admin(), { unitId, operationalDate: dia, items: [{ categoryId: catId, kg: 1 }] });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.operationalDate).toBe(dia);
    }
  });
});
