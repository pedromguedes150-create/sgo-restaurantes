import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getVaultOverview, countVault, refillBucket, invalidMultiples } from '@/lib/cash-vault';
import { getDenominations, defaultConfig, DEFAULT_DENOMINATIONS, ensureUnitDenominations, saveDenomination } from '@/lib/cash-denominations';
import { deleteCashDenomination } from '@/lib/admin-ops';
import type { SessionUser } from '@/lib/auth/session';

const sfx = `dnm${process.pid.toString(36)}`;
let unitA: string; // sem config (padrão de fábrica)
let unitB: string; // R$ 10 ligado no bloco ENTROU (isBig)
let unitC: string; // config sem R$ 0,25 → saldo legado no cofre
let unitD: string; // config (supervisor) — bloqueio R2
let userId: string;
let supId: string;
let adminId: string;
const user = (): SessionUser =>
  ({ id: userId, name: 'Ger', role: 'MANAGER', unitIds: [unitA, unitB, unitC], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser =>
  ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitD], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser =>
  ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

async function seedConfig(unitId: string, mutate: (d: (typeof DEFAULT_DENOMINATIONS)[number]) => Partial<(typeof DEFAULT_DENOMINATIONS)[number]> = () => ({}), skip: (key: string) => boolean = () => false) {
  const rows = DEFAULT_DENOMINATIONS.filter((d) => !skip(d.key)).map((d) => ({ ...d, ...mutate(d) }));
  await prisma.cashDenomination.createMany({
    data: rows.map((d) => ({
      unitId, key: d.key, value: d.value, kind: d.kind, label: d.label,
      isSmall: d.isSmall, isBig: d.isBig, countsAsBigIndicator: d.countsAsBigIndicator, order: d.order,
    })),
  });
}

beforeAll(async () => {
  const mk = async (n: string) => (await prisma.unit.create({ data: { code: `DNM-${n}-${sfx}`, name: `Un ${n}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitA = await mk('A');
  unitB = await mk('B');
  unitC = await mk('C');
  unitD = await mk('D');
  const u = await prisma.user.create({ data: { name: 'Ger', email: `${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } });
  userId = u.id;
  const s = await prisma.user.create({ data: { name: 'Sup', email: `${sfx}-sup@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } });
  supId = s.id;
  const a = await prisma.user.create({ data: { name: 'Adm', email: `${sfx}-adm@example.com`, role: 'ADMIN', passwordHash: 'x' } });
  adminId = a.id;
  for (const uid of [unitA, unitB, unitC]) await prisma.unitMembership.create({ data: { userId, unitId: uid } });
  await prisma.unitMembership.create({ data: { userId: supId, unitId: unitD } });
});

afterAll(async () => {
  for (const uid of [unitA, unitB, unitC, unitD]) {
    await prisma.cashVaultMovement.deleteMany({ where: { unitId: uid } }).catch(() => {});
    await prisma.cashVault.deleteMany({ where: { unitId: uid } }).catch(() => {});
    await prisma.cashBucket.deleteMany({ where: { unitId: uid } }).catch(() => {});
    await prisma.cashDenomination.deleteMany({ where: { unitId: uid } }).catch(() => {});
  }
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [userId, supId, adminId] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB, unitC, unitD] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [userId, supId, adminId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Denominações configuráveis (Módulo 18) — PR 1 backend', () => {
  it('(a) unidade sem configuração se comporta igual a hoje (padrão de fábrica + indicador 200/100/50)', async () => {
    const config = await getDenominations(unitA);
    expect(config.keys).toEqual(defaultConfig().keys);
    // indicador NÃO inclui o R$ 20 (decisão R1)
    expect(config.indicatorKeys).toEqual(['200', '100', '50']);
    expect(config.bigKeys).toEqual(['200', '100', '50', '20']);

    const r = await countVault(user(), unitA, { '200': 200, '100': 100, '50': 50, '20': 20 }, undefined);
    expect(r.ok).toBe(true);

    const o = await getVaultOverview(user(), unitA);
    expect(o).not.toBeNull();
    expect(o!.total).toBe(370);
    expect(o!.bigNotesTotal).toBe(350); // 200+100+50, sem o 20
    expect(o!.bigNotesPct).toBe(95);
  });

  it('(b) com R$ 10 ligado no bloco ENTROU, a reposição aceita R$ 10', async () => {
    await seedConfig(unitB, (d) => (d.key === '10' ? { isBig: true } : {}));
    const config = await getDenominations(unitB);
    expect(config.bigKeys).toContain('10'); // veio do banco, não da lista fixa

    const bucket = await prisma.cashBucket.create({ data: { unitId: unitB, name: 'Caixa 1', targetValue: 200 } });
    // sai R$ 50 em miúdos, entra R$ 50 em nota de 10 (troca 1:1)
    const r = await refillBucket(user(), unitB, bucket.id, { '5': 50 }, { '10': 50 }, undefined);
    expect(r.ok).toBe(true);

    const o = await getVaultOverview(user(), unitB);
    const last = o!.recentMovements[0];
    expect(last.type).toBe('REFILL');
    expect(last.deltas['10']).toBe(50);
    expect(last.deltas['5']).toBe(-50);
  });

  it('(c) movimento/saldo com chave desativada continua somando certo (leitura tolerante)', async () => {
    await seedConfig(unitC, undefined, (key) => key === '0.25'); // config SEM o R$ 0,25
    const config = await getDenominations(unitC);
    expect(config.keys).not.toContain('0.25');

    // injeta saldo legado direto no cofre: R$ 100 em notas de 20 + R$ 8,50 em moedas de 0,25 (fora da config)
    await prisma.cashVault.upsert({
      where: { unitId: unitC },
      create: { unitId: unitC, balances: { '20': 100, '0.25': 8.5 } },
      update: { balances: { '20': 100, '0.25': 8.5 } },
    });

    const o = await getVaultOverview(user(), unitC);
    expect(o!.total).toBe(108.5);           // o 8,50 legado NÃO some do total
    expect(o!.balances['0.25']).toBe(8.5);  // aparece como linha legado
    expect(o!.bigNotesTotal).toBe(0);       // 20 não conta no indicador; 0,25 nem entra
  });

  it('(d) validação de múltiplos usa os valores do banco', async () => {
    const config = await getDenominations(unitA); // padrão
    expect(invalidMultiples(config, { '10': 30 })).toEqual([]);       // 30 é múltiplo de 10
    expect(invalidMultiples(config, { '10': 25 })).toContain('10');   // 25 não é
    expect(invalidMultiples(config, { outros: 37.37 })).toEqual([]);  // "outros" fora da regra
  });
});

describe('Configuração de denominações (PR 2) — bloqueios R2/R6', () => {
  it('(R2) não deixa desativar denominação com saldo ≠ 0; depois de zerar, permite', async () => {
    await ensureUnitDenominations(unitD, sup());
    // coloca R$ 8,50 em moedas de 0,25 no cofre
    await prisma.cashVault.upsert({
      where: { unitId: unitD },
      create: { unitId: unitD, balances: { '0.25': 8.5 } },
      update: { balances: { '0.25': 8.5 } },
    });

    const blocked = await saveDenomination(sup(), unitD, { key: '0.25', active: false });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('INVALID');

    // zera o saldo e tenta de novo
    await prisma.cashVault.update({ where: { unitId: unitD }, data: { balances: { '0.25': 0 } } });
    const okNow = await saveDenomination(sup(), unitD, { key: '0.25', active: false });
    expect(okNow.ok).toBe(true);
    const row = await prisma.cashDenomination.findFirst({ where: { unitId: unitD, key: '0.25' } });
    expect(row?.active).toBe(false);
  });

  it('(R6) "outros" é linha de sistema e não pode ser desativada', async () => {
    await ensureUnitDenominations(unitD, sup());
    const r = await saveDenomination(sup(), unitD, { key: 'outros', active: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('gerente (sem CASH_CONFIG) não configura', async () => {
    const r = await saveDenomination(user(), unitA, { key: '10', isBig: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});

describe('getVaultOverview expõe a configuração (base do PR 3)', () => {
  it('unidade padrão: denominations trazem outros e o indicador 200/100/50', async () => {
    const o = await getVaultOverview(user(), unitA);
    expect(o).not.toBeNull();
    expect(o!.denominations.map((d) => d.key)).toContain('outros');
    const indicator = o!.denominations.filter((d) => d.countsAsBigIndicator).map((d) => d.key);
    expect(indicator).toEqual(['200', '100', '50']);
  });

  it('com R$ 10 ligado em Notas grandes, o overview marca isBig no 10 (a linha vai aparecer na reposição)', async () => {
    const o = await getVaultOverview(user(), unitB);
    const ten = o!.denominations.find((d) => d.key === '10');
    expect(ten?.isBig).toBe(true);
    expect(ten?.label).toContain('10');
  });
});

describe('Exclusão de denominação pelo Admin (PR 4) — /api/admin/ops', () => {
  it('não-admin (supervisor) não exclui', async () => {
    await ensureUnitDenominations(unitD, sup());
    const row = await prisma.cashDenomination.findFirst({ where: { unitId: unitD, key: '0.05' } });
    const r = await deleteCashDenomination(sup(), row!.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('bloqueia "outros" (linha de sistema, R6)', async () => {
    const row = await prisma.cashDenomination.findFirst({ where: { unitId: unitD, key: 'outros' } });
    const r = await deleteCashDenomination(admin(), row!.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('bloqueia exclusão com saldo ≠ 0 (R2); com saldo zero, exclui', async () => {
    await prisma.cashVault.upsert({
      where: { unitId: unitD },
      create: { unitId: unitD, balances: { '0.05': 3 } },
      update: { balances: { '0.05': 3 } },
    });
    const row = await prisma.cashDenomination.findFirst({ where: { unitId: unitD, key: '0.05' } });
    const blocked = await deleteCashDenomination(admin(), row!.id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('INVALID');

    await prisma.cashVault.update({ where: { unitId: unitD }, data: { balances: { '0.05': 0 } } });
    const okNow = await deleteCashDenomination(admin(), row!.id);
    expect(okNow.ok).toBe(true);
    const gone = await prisma.cashDenomination.findUnique({ where: { id: row!.id } });
    expect(gone).toBeNull();
  });
});
