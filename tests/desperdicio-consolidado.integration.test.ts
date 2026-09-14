import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getConsolidadoDeDesperdicio } from '@/lib/waste/consolidado';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O PAINEL CONSOLIDADO da rede.
 *
 * O painel afirma três coisas — quanto, onde e para que lado está indo — e a
 * terceira é a perigosa: uma variação lida errado vira cobrança em cima da
 * unidade errada. Os casos abaixo cercam justamente os jeitos de mentir com
 * variação: base zero, unidade que só parou de lançar, e categoria antiga
 * sobrando no meio.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitA: string;
let unitB: string;
const catId: Record<string, string> = {};

const admin = (): SessionUser => ({ id: 'x', name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

/** Só as unidades do teste — o banco de dev tem outras. */
function linha(c: Awaited<ReturnType<typeof getConsolidadoDeDesperdicio>>, unitId: string) {
  return c.linhas.find((l) => l.unitId === unitId)!;
}

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `DA-${sfx}`, name: 'Desp A', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `DB-${sfx}`, name: 'Desp B', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;

  /* Os seis já existem (vieram na migração). A categoria ANTIGA é criada aqui
     para provar que ela não entra nos totais. */
  const codes = ['SS_ALMOCO', 'SS_JANTAR', 'REF_ALMOCO', 'REF_JANTAR', 'PROD_ALMOCO', 'PROD_JANTAR'];
  for (const code of codes) {
    const c = await prisma.wasteCategory.findUnique({ where: { code }, select: { id: true } });
    if (!c) throw new Error(`categoria ${code} não existe — a migração dos tipos fixos não rodou neste banco`);
    catId[code] = c.id;
  }
  const antiga = await prisma.wasteCategory.create({
    data: { code: `ANTIGA-${sfx}`, name: 'Buffet antigo', measure: 'kg', order: 999, active: false },
  });
  catId.ANTIGA = antiga.id;
});

beforeEach(async () => {
  await prisma.wasteEntry.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
});

afterAll(async () => {
  await prisma.wasteEntry.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.wasteCategory.delete({ where: { id: catId.ANTIGA } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.$disconnect();
});

/** Um lançamento do dia, com os pesos por código. */
async function lancar(unitId: string, data: string, pesos: Record<string, number>) {
  await prisma.wasteEntry.create({
    data: {
      unitId, operationalDate: data,
      items: { create: Object.entries(pesos).map(([code, kg]) => ({ categoryId: catId[code], kg })) },
    },
  });
}

/* Um mês fechado, para os dias decorridos não dependerem de quando o teste roda. */
const HOJE = new Date('2026-09-20T12:00:00Z');

describe('Os totais da unidade e da rede', () => {
  it('somam o mês por tipo, por grupo e no geral', async () => {
    await lancar(unitA, '2026-08-05', { SS_ALMOCO: 10, PROD_ALMOCO: 4 });
    await lancar(unitA, '2026-08-06', { SS_ALMOCO: 5, REF_JANTAR: 3, PROD_JANTAR: 1 });

    const c = await getConsolidadoDeDesperdicio(admin(), 2026, 8, HOJE);
    const a = linha(c, unitA);
    expect(a.porCodigo.SS_ALMOCO).toBe(15);
    expect(a.sobraLimpa).toBe(18);   // 15 + 3
    expect(a.sobraProducao).toBe(5); // 4 + 1
    expect(a.geral).toBe(23);
    expect(a.diasComLancamento).toBe(2);
  });

  it('a rede soma as unidades', async () => {
    await lancar(unitA, '2026-08-05', { SS_ALMOCO: 10 });
    await lancar(unitB, '2026-08-05', { SS_ALMOCO: 7 });

    const c = await getConsolidadoDeDesperdicio(admin(), 2026, 8, HOJE);
    /* O banco de dev tem outras unidades; o que se mede é a contribuição das
       duas do teste estar dentro do total da rede. */
    expect(c.rede.porCodigo.SS_ALMOCO).toBeGreaterThanOrEqual(17);
    expect(linha(c, unitA).geral + linha(c, unitB).geral).toBe(17);
  });

  it('categoria ANTIGA fica de fora dos totais', async () => {
    await lancar(unitA, '2026-08-05', { SS_ALMOCO: 10, ANTIGA: 999 });
    const a = linha(await getConsolidadoDeDesperdicio(admin(), 2026, 8, HOJE), unitA);
    expect(a.geral).toBe(10);
  });

  it('só conta o mês pedido — o dia 1 do mês seguinte fica de fora', async () => {
    await lancar(unitA, '2026-08-31', { SS_ALMOCO: 5 });
    await lancar(unitA, '2026-09-01', { SS_ALMOCO: 100 });

    expect(linha(await getConsolidadoDeDesperdicio(admin(), 2026, 8, HOJE), unitA).geral).toBe(5);
    expect(linha(await getConsolidadoDeDesperdicio(admin(), 2026, 9, HOJE), unitA).geral).toBe(100);
  });
});

describe('A variação — onde subiu e onde caiu', () => {
  it('compara com o mês anterior e classifica os dois lados', async () => {
    await lancar(unitA, '2026-08-10', { SS_ALMOCO: 100 });
    await lancar(unitA, '2026-09-10', { SS_ALMOCO: 150 }); // subiu 50%
    await lancar(unitB, '2026-08-10', { SS_ALMOCO: 100 });
    await lancar(unitB, '2026-09-10', { SS_ALMOCO: 60 });  // caiu 40%

    const c = await getConsolidadoDeDesperdicio(admin(), 2026, 9, HOJE);
    expect(linha(c, unitA).variacao).toBeCloseTo(50);
    expect(linha(c, unitB).variacao).toBeCloseTo(-40);
    expect(c.subiram.map((l) => l.unitId)).toContain(unitA);
    expect(c.cairam.map((l) => l.unitId)).toContain(unitB);
    expect(c.subiram.map((l) => l.unitId)).not.toContain(unitB);
  });

  it('unidade SEM mês anterior fica fora dos dois lados do dashboard', async () => {
    /* Sem base, ela apareceria como "subiu infinito" e roubaria o topo de quem
       realmente piorou. */
    await lancar(unitA, '2026-09-10', { SS_ALMOCO: 80 });

    const c = await getConsolidadoDeDesperdicio(admin(), 2026, 9, HOJE);
    expect(linha(c, unitA).variacao).toBeNull();
    expect(c.subiram.map((l) => l.unitId)).not.toContain(unitA);
    expect(c.cairam.map((l) => l.unitId)).not.toContain(unitA);
  });

  it('quem PAROU de lançar aparece como "sem lançamento", não como exemplar', async () => {
    /* -100% aqui é o dado dizendo "ninguém registrou", e ler isso como queda de
       desperdício premia justamente quem deixou de medir. */
    await lancar(unitA, '2026-08-10', { SS_ALMOCO: 100 });

    const c = await getConsolidadoDeDesperdicio(admin(), 2026, 9, HOJE);
    const a = linha(c, unitA);
    expect(a.geral).toBe(0);
    expect(a.diasComLancamento).toBe(0);
    expect(c.semLancamento.map((l) => l.unitId)).toContain(unitA);
  });

  it('a cobertura acompanha o número — 2 dias lançados num mês fechado', async () => {
    await lancar(unitA, '2026-08-05', { SS_ALMOCO: 1 });
    await lancar(unitA, '2026-08-06', { SS_ALMOCO: 1 });

    const a = linha(await getConsolidadoDeDesperdicio(admin(), 2026, 8, HOJE), unitA);
    expect(a.diasComLancamento).toBe(2);
    expect(a.diasDecorridos).toBe(31); // agosto inteiro já passou
  });

  it('no mês corrente, os dias decorridos param em hoje', async () => {
    const a = linha(await getConsolidadoDeDesperdicio(admin(), 2026, 9, HOJE), unitA);
    expect(a.diasDecorridos).toBe(20); // HOJE = 20/09
  });
});

describe('Escopo por unidade', () => {
  it('quem só enxerga uma unidade não vê a outra no consolidado', async () => {
    await lancar(unitA, '2026-08-10', { SS_ALMOCO: 10 });
    await lancar(unitB, '2026-08-10', { SS_ALMOCO: 20 });

    const gerente: SessionUser = { id: 'g', name: 'Gerente', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false };
    const c = await getConsolidadoDeDesperdicio(gerente, 2026, 8, HOJE);
    expect(c.linhas.map((l) => l.unitId)).toEqual([unitA]);
    expect(c.rede.geral).toBe(10);
  });
});
