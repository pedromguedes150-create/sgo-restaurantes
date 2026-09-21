import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getGasDashboard } from '@/lib/gas/query';
import { createGasReceipt, editGasReceipt } from '@/lib/gas/create';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O PAINEL DE GÁS, do banco até o número.
 *
 * A matemática está provada em `gas-colunas.test.ts`. Aqui se prova a metade
 * que depende do banco: que o cartão "Preço médio/kg" deixou de ser média
 * simples, que "Último preço/kg" parou de depender da ordem em que o banco
 * devolveu as linhas, que a nota fora de faixa sai NOMEADA em vez de só
 * distorcer a tela, e que ela não entra mais.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unidade: string;
let outra: string;
let userId: string;

const admin = (): SessionUser => ({ id: userId, name: 'Admin Gás', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

/** Data dentro da janela padrão do painel (últimos 6 meses). */
function diasAtras(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  unidade = (await prisma.unit.create({ data: { code: `PA-${sfx}`, name: `Painel Gas A ${sfx}` } })).id;
  outra = (await prisma.unit.create({ data: { code: `PB-${sfx}`, name: `Painel Gas B ${sfx}` } })).id;
  userId = (await prisma.user.create({ data: { name: 'Admin Gás', email: `painel-gas-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
});

beforeEach(async () => {
  await prisma.gasReceipt.deleteMany({ where: { unitId: { in: [unidade, outra] } } });
});

afterAll(async () => {
  await prisma.gasReceipt.deleteMany({ where: { unitId: { in: [unidade, outra] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unidade, outra] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

async function lancar(unitId: string, data: string, precoKg: number, kg: number, ordem = 0) {
  return prisma.gasReceipt.create({
    data: {
      unitId, operationalDate: data, quantityKg: kg,
      totalValue: Math.round(precoKg * kg * 100) / 100, pricePerKg: precoKg,
      createdAt: new Date(2020, 0, 1, 0, 0, ordem),
    },
  });
}

/** Só a unidade do teste — o painel devolve a rede inteira. */
const minhaUnidade = () => getGasDashboard(admin(), { unitId: unidade });

describe('Preço médio/kg do painel', () => {
  it('é ponderado (valor ÷ kg), e não a média dos preços', async () => {
    /* 30 kg a 6,00 e 600 kg a 7,00 → 4.380 ÷ 630 = 6,9524. A média simples
       daria 6,50, tratando a compra de 30 kg como igual à de 600. */
    await lancar(unidade, diasAtras(30), 6.0, 30, 1);
    await lancar(unidade, diasAtras(10), 7.0, 600, 2);

    const d = await minhaUnidade();
    expect(d.avgPrice).toBeCloseTo(6.9524, 3);
    expect(d.avgPrice).not.toBeCloseTo(6.5, 2);
    expect(d.totalKg).toBe(630);
    expect(d.totalValue).toBe(4380);
  });

  it('a média por unidade também é ponderada', async () => {
    await lancar(unidade, diasAtras(30), 6.0, 30, 1);
    await lancar(unidade, diasAtras(10), 7.0, 600, 2);

    const d = await minhaUnidade();
    const u = d.byUnit.find((x) => x.key === unidade)!;
    expect(u.avg).toBeCloseTo(6.9524, 3);
    /* mín/máx continuam sendo os preços das notas — são as pontas, não médias. */
    expect(u.min).toBe(6);
    expect(u.max).toBe(7);
  });

  it('o preço do mês na tendência é ponderado', async () => {
    const dia = diasAtras(20);
    await lancar(unidade, dia, 6.0, 100, 1);
    await lancar(unidade, dia, 8.0, 900, 2);

    const d = await minhaUnidade();
    const mes = d.monthly.find((m) => m.month === dia.slice(0, 7))!;
    /* 600 + 7.200 = 7.800 ÷ 1.000 = 7,80. A média simples daria 7,00. */
    expect(mes.avg).toBeCloseTo(7.8, 4);
  });
});

describe('Último preço/kg', () => {
  it('desempata pela ordem de lançamento dentro do mesmo dia', async () => {
    /* No arquivo real há QUATRO notas no mesmo 23/07, e o "último" era decidido
       por `date >=` sobre a ordem em que o Postgres devolvia as linhas — sem
       desempate no ORDER BY, essa ordem não é garantida.
       Este caso NÃO reproduz a falha (ela é não-determinística): ele fixa o
       CONTRATO, gravando as três fora da ordem de preço para que só o
       desempate por `createdAt` chegue em 7,25. */
    const dia = diasAtras(5);
    await lancar(unidade, dia, 7.25, 100, 3);
    await lancar(unidade, dia, 6.0, 100, 1);
    await lancar(unidade, dia, 6.5, 100, 2);

    const d = await minhaUnidade();
    expect(d.lastPrice).toBe(7.25);
    expect(d.byUnit.find((x) => x.key === unidade)!.last).toBe(7.25);
  });

  it('a nota retroativa não vira o "último"', async () => {
    await lancar(unidade, diasAtras(5), 7.0, 100, 1);
    /* Lançada DEPOIS, com data anterior. */
    await lancar(unidade, diasAtras(40), 6.0, 100, 2);

    const d = await minhaUnidade();
    expect(d.lastPrice).toBe(7);
  });
});

describe('Notas fora da faixa', () => {
  it('saem nomeadas, com unidade, data e preço', async () => {
    await lancar(unidade, diasAtras(30), 6.5, 100, 1);
    /* O caso do print: o TOTAL da nota parou no campo de preço unitário. */
    await lancar(unidade, diasAtras(20), 6295, 300, 2);

    const d = await minhaUnidade();
    expect(d.foraDaFaixa).toHaveLength(1);
    expect(d.foraDaFaixa[0].pricePerKg).toBe(6295);
    expect(d.foraDaFaixa[0].unitName).toContain('Painel Gas A');
    expect(d.foraDaFaixa[0].kg).toBe(300);
    expect(d.tetoPrecoKg).toBe(30);
  });

  it('painel limpo não traz aviso nenhum', async () => {
    await lancar(unidade, diasAtras(30), 6.46, 570, 1);
    await lancar(unidade, diasAtras(10), 7.0162, 328, 2);

    const d = await minhaUnidade();
    expect(d.foraDaFaixa).toEqual([]);
  });

  it('respeitam o escopo de unidade de quem pergunta', async () => {
    await lancar(outra, diasAtras(10), 6295, 300, 1);
    const soMinha: SessionUser = { id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [unidade], seesAllUnits: false, needsTerms: false };
    const d = await getGasDashboard(soMinha, {});
    expect(d.foraDaFaixa.some((r) => r.unitId === outra)).toBe(false);
  });
});

describe('A faixa barra o lançamento, e não só o exibe', () => {
  it('recusa o preço do botijão inteiro lançado como preço de quilo', async () => {
    const r = await createGasReceipt(admin(), { unitId: unidade, quantityKg: 45, totalValue: 45 * 293 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('PRECO_IMPLAUSIVEL');
      /* A mensagem tem de dizer o que conferir — "inválido" mandaria o gerente
         tentar de novo igual. */
      expect(r.message).toContain('KG');
    }
  });

  it('aceita o gás real', async () => {
    const r = await createGasReceipt(admin(), { unitId: unidade, quantityKg: 570, totalValue: 3682.2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pricePerKg).toBeCloseTo(6.46, 4);
  });

  it('a correção de lançamento fecha a mesma porta', async () => {
    /* É por esta tela que se conserta uma nota fora de faixa; ela não pode ser
       a porta aberta ao lado da porta fechada. */
    const nota = await lancar(unidade, diasAtras(10), 6.5, 100, 1);
    const e = await editGasReceipt(admin(), nota.id, { quantityKg: 1, totalValue: 650 });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.reason).toBe('PRECO_IMPLAUSIVEL');

    /* E continua aceitando a correção legítima. */
    const ok = await editGasReceipt(admin(), nota.id, { quantityKg: 110, totalValue: 715 });
    expect(ok.ok).toBe(true);
  });
});
