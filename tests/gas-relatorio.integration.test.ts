import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getRelatorioDeGas, getVariacoesPorNota } from '@/lib/gas/query';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O RELATÓRIO DO GÁS, do banco até o número.
 *
 * A lógica da cadeia é provada em `gas-variacao.test.ts`. Aqui se prova a
 * metade que depende do banco: a ORDEM que a consulta traz, a ÂNCORA do
 * período, o escopo por unidade e — o principal — que a variação deixou de sair
 * das colunas gravadas no lançamento.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unidadeA: string;
let unidadeB: string;
let userId: string;

const admin = (): SessionUser => ({ id: userId, name: 'Admin Gás', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  unidadeA = (await prisma.unit.create({ data: { code: `GA-${sfx}`, name: `Gas Unidade A ${sfx}` } })).id;
  unidadeB = (await prisma.unit.create({ data: { code: `GB-${sfx}`, name: `Gas Unidade B ${sfx}` } })).id;
  userId = (await prisma.user.create({ data: { name: 'Admin Gás', email: `gas-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
});

beforeEach(async () => {
  await prisma.gasReceipt.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB] } } });
});

afterAll(async () => {
  await prisma.gasReceipt.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unidadeA, unidadeB] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

/**
 * Cria a nota com `prevPricePerKg`/`variationPct` DELIBERADAMENTE ERRADOS.
 *
 * É assim que se prova que a tela deixou de ler as colunas gravadas: se ela
 * ainda as lesse, os casos abaixo devolveriam 999.
 */
async function lancar(unitId: string, data: string, precoKg: number, kg = 100, ordem = 0) {
  return prisma.gasReceipt.create({
    data: {
      unitId,
      operationalDate: data,
      quantityKg: kg,
      totalValue: Math.round(precoKg * kg * 100) / 100,
      pricePerKg: precoKg,
      prevPricePerKg: 999,
      variationPct: 999,
      createdAt: new Date(2020, 0, 1, 0, 0, ordem),
    },
  });
}

const doRelatorio = async (opts: Parameters<typeof getRelatorioDeGas>[1] = {}) =>
  (await getRelatorioDeGas(admin(), opts)).unidades.filter((u) => [unidadeA, unidadeB].includes(u.unitId));

describe('A variação não vem mais da coluna gravada', () => {
  it('ignora o `variationPct` do lançamento e recalcula da série', async () => {
    await lancar(unidadeA, '2026-01-10', 6.0, 100, 1);
    await lancar(unidadeA, '2026-02-10', 6.6, 100, 2);

    const [u] = await doRelatorio({ de: '2026-01-01' });
    expect(u.rows.map((r) => r.variationPct)).toEqual([null, expect.closeTo(10, 1)]);
    /* Se ainda lesse a coluna, o segundo seria 999. */
    expect(u.rows.some((r) => r.variationPct === 999)).toBe(false);
  });
});

describe('Nota retroativa reencadeia o histórico', () => {
  it('a nota do meio entra na fila e a seguinte passa a apontar para ela', async () => {
    await lancar(unidadeA, '2026-05-10', 6.0, 100, 1);
    await lancar(unidadeA, '2026-07-23', 6.46, 100, 2);
    /* Lançada por ÚLTIMO, com data do meio — o caso do print. */
    await lancar(unidadeA, '2026-06-26', 7.0, 100, 3);

    const [u] = await doRelatorio({ de: '2026-01-01' });
    expect(u.rows.map((r) => r.date)).toEqual(['2026-05-10', '2026-06-26', '2026-07-23']);
    expect(u.rows[1].prevPrice).toBe(6);
    expect(u.rows[2].prevPrice).toBe(7);
    expect(u.rows[2].variationPct).toBeCloseTo(-7.7, 1);
  });
});

describe('Correção de data recalcula sozinha', () => {
  it('trocar o operationalDate muda a ordem e as variações, sem gatilho nenhum', async () => {
    const n1 = await lancar(unidadeA, '2026-01-10', 5.0, 100, 1);
    const n2 = await lancar(unidadeA, '2026-02-10', 6.0, 100, 2);
    await lancar(unidadeA, '2026-03-10', 7.0, 100, 3);

    const antes = (await doRelatorio({ de: '2026-01-01' }))[0];
    expect(antes.rows.map((r) => r.date)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);

    /* É o que `editEntryDate` faz: troca a data e mais nada. */
    await prisma.gasReceipt.update({ where: { id: n2.id }, data: { operationalDate: '2026-04-10', dateEdited: true, dateEditedByName: 'Marcelo' } });

    const depois = (await doRelatorio({ de: '2026-01-01' }))[0];
    expect(depois.rows.map((r) => r.date)).toEqual(['2026-01-10', '2026-03-10', '2026-04-10']);
    expect(depois.rows[1].prevPrice).toBe(5);
    expect(depois.rows[2].prevPrice).toBe(7);
    expect(depois.rows[2].variationPct).toBeCloseTo(-14.3, 1);
    expect(depois.rows[2].dateEdited).toBe(true);
    expect(depois.rows[2].dateEditedByName).toBe('Marcelo');

    expect(n1.id).toBeTruthy();
  });
});

describe('A âncora do período', () => {
  it('a primeira linha do período compara com a última nota ANTES dele', async () => {
    await lancar(unidadeA, '2026-05-10', 6.0, 100, 1);
    await lancar(unidadeA, '2026-07-10', 6.6, 100, 2);

    const [u] = await doRelatorio({ de: '2026-07-01' });
    expect(u.rows).toHaveLength(1);
    expect(u.ancora).toBe(6);
    expect(u.rows[0].variationPct).toBeCloseTo(10, 1);
  });

  it('a variação de uma nota é a MESMA com e sem filtro de período', async () => {
    await lancar(unidadeA, '2026-05-10', 6.0, 100, 1);
    await lancar(unidadeA, '2026-07-10', 6.6, 100, 2);

    const tudo = (await doRelatorio({ de: '2026-01-01' }))[0];
    const soJulho = (await doRelatorio({ de: '2026-07-01' }))[0];
    const noTudo = tudo.rows.find((r) => r.date === '2026-07-10')!;
    expect(soJulho.rows[0].variationPct).toBe(noTudo.variationPct);
  });
});

describe('Resumo por unidade e consolidado da rede', () => {
  beforeEach(async () => {
    /* A: 100 kg a 6,00 e 1.000 kg a 7,00 → 7.600 / 1.100 = 6,9091 */
    await lancar(unidadeA, '2026-03-01', 6.0, 100, 1);
    await lancar(unidadeA, '2026-03-15', 7.0, 1000, 2);
    /* B: 200 kg a 5,00 → 1.000 / 200 = 5,00 */
    await lancar(unidadeB, '2026-03-10', 5.0, 200, 3);
  });

  it('o preço médio da unidade é ponderado, e não a média das notas', async () => {
    const [a] = (await doRelatorio({ de: '2026-01-01' })).filter((u) => u.unitId === unidadeA);
    expect(a.kg).toBe(1100);
    expect(a.valor).toBe(7600);
    expect(a.precoMedio).toBeCloseTo(6.9091, 3);
    /* A média simples das notas daria 6,50. */
    expect(a.precoMedio).not.toBeCloseTo(6.5, 2);
  });

  it('traz menor, maior, último e a variação do período por unidade', async () => {
    const [a] = (await doRelatorio({ de: '2026-01-01' })).filter((u) => u.unitId === unidadeA);
    expect(a.menorPreco).toBe(6);
    expect(a.maiorPreco).toBe(7);
    expect(a.ultimoPreco).toBe(7);
    expect(a.variacaoNoPeriodo).toBeCloseTo(16.7, 1);
  });

  it('o consolidado da rede soma kg e valor e usa o preço ponderado', async () => {
    const r = await getRelatorioDeGas(admin(), { de: '2026-03-01', ate: '2026-03-31', unitId: undefined });
    const minhas = r.unidades.filter((u) => [unidadeA, unidadeB].includes(u.unitId));
    const kg = minhas.reduce((s, u) => s + u.kg, 0);
    const valor = minhas.reduce((s, u) => s + u.valor, 0);
    expect(kg).toBe(1300);
    expect(valor).toBe(8600);
    /* 8600 / 1300 = 6,6154. A média das médias de A e B daria 5,95. */
    expect(valor / kg).toBeCloseTo(6.6154, 3);
  });
});

describe('Escopo por unidade', () => {
  it('quem não alcança a unidade não vê as notas dela', async () => {
    await lancar(unidadeA, '2026-03-01', 6.0, 100, 1);
    const soB: SessionUser = { id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [unidadeB], seesAllUnits: false, needsTerms: false };
    const r = await getRelatorioDeGas(soB, { de: '2026-01-01' });
    expect(r.unidades.some((u) => u.unitId === unidadeA)).toBe(false);
  });

  it('a âncora também respeita o escopo', async () => {
    await lancar(unidadeA, '2026-01-01', 6.0, 100, 1);
    const soB: SessionUser = { id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [unidadeB], seesAllUnits: false, needsTerms: false };
    const mapa = await getVariacoesPorNota(soB);
    const daUnidadeA = await prisma.gasReceipt.findFirst({ where: { unitId: unidadeA } });
    expect(mapa.has(daUnidadeA!.id)).toBe(false);
  });
});

describe('getVariacoesPorNota — para as listas soltas', () => {
  it('devolve a variação de cada nota, encadeada por unidade', async () => {
    await lancar(unidadeA, '2026-01-10', 6.0, 100, 1);
    const segunda = await lancar(unidadeA, '2026-02-10', 6.6, 100, 2);
    /* Unidade B não interfere na cadeia de A. */
    await lancar(unidadeB, '2026-01-20', 10.0, 100, 3);

    const mapa = await getVariacoesPorNota(admin());
    expect(mapa.get(segunda.id)?.prevPrice).toBe(6);
    expect(mapa.get(segunda.id)?.variationPct).toBeCloseTo(10, 1);
  });
});
