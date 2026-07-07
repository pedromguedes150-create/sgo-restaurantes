import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { openCashSession, closeCashSession, getCashOverview } from '@/lib/cash';
import type { SessionUser } from '@/lib/auth/session';

const sfx = `csh${process.pid.toString(36)}`;
let unitId: string;
let userId: string;
const user = (): SessionUser => ({ id: userId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({
    data: { code: `CSH-${sfx}`, name: 'Unidade Troco', timezone: 'America/Sao_Paulo', cutoffHour: 4 },
  });
  unitId = unit.id;
  const u = await prisma.user.create({
    data: { name: 'Ger', email: `${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' },
  });
  userId = u.id;
  await prisma.unitMembership.create({ data: { userId, unitId } });
});

afterAll(async () => {
  await prisma.cashSession.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Gestão de Troco (Módulo 16) — cadeia de caixas', () => {
  it('primeiro caixa da unidade abre sem abertura esperada (sem divergência)', async () => {
    const r = await openCashSession(user(), unitId, 500);
    expect(r.ok).toBe(true);
    const s = await prisma.cashSession.findFirst({ where: { unitId }, orderBy: { openedAt: 'desc' } });
    expect(s?.expectedOpening).toBeNull();
    expect(s?.divergence).toBeNull();
    expect(s?.seq).toBe(1);
  });

  it('não deixa abrir um segundo caixa com um ainda aberto', async () => {
    const r = await openCashSession(user(), unitId, 500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('fechar é transacional: segunda tentativa falha', async () => {
    const open = await prisma.cashSession.findFirst({ where: { unitId, closingAmount: null } });
    const r1 = await closeCashSession(user(), open!.id, 480);
    expect(r1.ok).toBe(true);
    const r2 = await closeCashSession(user(), open!.id, 999);
    expect(r2.ok).toBe(false);
  });

  it('o fechamento vira a abertura esperada do próximo; divergência é calculada e o seq avança', async () => {
    // fechamento anterior foi 480; abrindo com 450 → divergência -30
    const r = await openCashSession(user(), unitId, 450);
    expect(r.ok).toBe(true);
    const s = await prisma.cashSession.findFirst({ where: { unitId, closingAmount: null } });
    expect(Number(s?.expectedOpening)).toBe(480);
    expect(Number(s?.divergence)).toBe(-30);
    expect(s?.seq).toBe(2); // mesmo dia operacional
    await closeCashSession(user(), s!.id, 450);
  });

  it('abertura igual ao fechamento anterior não gera divergência', async () => {
    const r = await openCashSession(user(), unitId, 450);
    expect(r.ok).toBe(true);
    const s = await prisma.cashSession.findFirst({ where: { unitId, closingAmount: null } });
    expect(Number(s?.divergence)).toBe(0);
    await closeCashSession(user(), s!.id, 450);
  });

  it('overview conta as divergências do mês (≥ R$0,01)', async () => {
    const o = await getCashOverview(user(), unitId);
    expect(o).not.toBeNull();
    expect(o!.month.sessions).toBe(3);
    expect(o!.month.divergent).toBe(1); // só a de -30
    expect(o!.month.divergenceTotal).toBe(30);
    expect(o!.lastClosing).toBe(450);
  });

  it('nega operação fora do escopo de unidade', async () => {
    const outsider: SessionUser = { id: userId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await openCashSession(outsider, unitId, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});
