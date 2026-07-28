import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getVaultOverview, countVault, refillBucket, invalidMultiples } from '@/lib/cash-vault';
import { getDenominations, defaultConfig, DEFAULT_DENOMINATIONS } from '@/lib/cash-denominations';
import type { SessionUser } from '@/lib/auth/session';

const sfx = `dnm${process.pid.toString(36)}`;
let unitA: string; // sem config (padrão de fábrica)
let unitB: string; // R$ 10 ligado no bloco ENTROU (isBig)
let unitC: string; // config sem R$ 0,25 → saldo legado no cofre
let userId: string;
const user = (): SessionUser =>
  ({ id: userId, name: 'Ger', role: 'MANAGER', unitIds: [unitA, unitB, unitC], seesAllUnits: false, needsTerms: false });

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
  const u = await prisma.user.create({ data: { name: 'Ger', email: `${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } });
  userId = u.id;
  for (const uid of [unitA, unitB, unitC]) await prisma.unitMembership.create({ data: { userId, unitId: uid } });
});

afterAll(async () => {
  for (const uid of [unitA, unitB, unitC]) {
    await prisma.cashVaultMovement.deleteMany({ where: { unitId: uid } }).catch(() => {});
    await prisma.cashVault.deleteMany({ where: { unitId: uid } }).catch(() => {});
    await prisma.cashBucket.deleteMany({ where: { unitId: uid } }).catch(() => {});
    await prisma.cashDenomination.deleteMany({ where: { unitId: uid } }).catch(() => {});
  }
  await prisma.unitMembership.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB, unitC] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
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
