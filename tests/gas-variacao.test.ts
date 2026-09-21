import { describe, it, expect } from 'vitest';
import {
  encadear, ordemCronologica, precoPorKg, resumoDoPeriodo, variacaoEntre, type NotaDeGas,
} from '@/lib/gas/variacao';

/**
 * A VARIAÇÃO DO PREÇO DO GÁS.
 *
 * Os dois primeiros blocos são os defeitos relatados com print. Os dois eram
 * silenciosos: o número saía plausível e ninguém tinha como desconfiar.
 */

let seq = 0;
const nota = (operationalDate: string, totalValue: number, quantityKg: number): NotaDeGas => ({
  id: `n${++seq}`,
  operationalDate,
  createdAt: new Date(2020, 0, 1, 0, 0, seq),
  quantityKg,
  totalValue,
});

/** Preços redondos para os casos ficarem legíveis. */
const a = (data: string, preco: number, kg = 100) => nota(data, preco * kg, kg);

describe('Preço por kg', () => {
  it('é valor ÷ kg, com quatro casas', () => {
    expect(precoPorKg(3682.2, 570)).toBeCloseTo(6.46, 4);
    expect(precoPorKg(2120.16, 328)).toBeCloseTo(6.4639, 4);
  });

  it('sem kg devolve null, e não Infinity', () => {
    /* `Infinity` atravessaria a soma inteira e apareceria como traço em toda a
       tela, sem ninguém saber de onde veio. */
    expect(precoPorKg(100, 0)).toBeNull();
    expect(precoPorKg(100, -5)).toBeNull();
  });
});

describe('Variação entre dois preços', () => {
  it('o caso do print: 6,4600 contra 7,0162 dá −7,9%', () => {
    expect(variacaoEntre(6.46, 7.0162)).toBeCloseTo(-7.9, 1);
  });

  it('sem base de comparação devolve null', () => {
    expect(variacaoEntre(6.5, 0)).toBeNull();
  });
});

describe('DEFEITO 1 — nota retroativa comparava com o futuro', () => {
  /* A referência era "a nota mais recente da unidade", não a ANTERIOR. Lançar
     hoje uma compra de junho comparava junho com julho. */
  it('a nota do meio compara com a de trás, não com a última lançada', () => {
    const serie = encadear([
      a('2026-07-23', 6.46),   // lançada primeiro, mas é a MAIS NOVA
      a('2026-05-10', 6.00),
      a('2026-06-26', 7.00),   // lançada por último, no meio da série
    ]);

    const junho = serie.find((e) => e.nota.operationalDate === '2026-06-26')!;
    expect(junho.prevPrice).toBe(6.00);
    expect(junho.variationPct).toBeCloseTo(16.7, 1);
  });

  it('e a nota SEGUINTE passa a comparar com a retroativa', () => {
    /* Era isto que ninguém recalculava: julho continuava apontando para maio,
       como se junho não existisse. */
    const serie = encadear([a('2026-05-10', 6.00), a('2026-07-23', 6.46), a('2026-06-26', 7.00)]);
    const julho = serie.find((e) => e.nota.operationalDate === '2026-07-23')!;
    expect(julho.prevPrice).toBe(7.00);
    expect(julho.variationPct).toBeCloseTo(-7.7, 1);
  });
});

describe('DEFEITO 2 — correção de data não recalculava nada', () => {
  it('mudar a data reordena a série e as variações acompanham', () => {
    /* Não há gatilho a chamar: a série é reencadeada na leitura, então corrigir
       a data já muda o resultado. Era a ausência desse recálculo que deixava a
       nota do print sem variação nenhuma. */
    const antes = encadear([a('2026-01-10', 5.00), a('2026-02-10', 6.00), a('2026-03-10', 7.00)]);
    expect(antes.map((e) => e.variationPct)).toEqual([null, 20, expect.closeTo(16.7, 1)]);

    /* A mesma nota de 6,00 passa a ser a última. */
    const depois = encadear([a('2026-01-10', 5.00), a('2026-04-10', 6.00), a('2026-03-10', 7.00)]);
    expect(depois.map((e) => e.nota.operationalDate)).toEqual(['2026-01-10', '2026-03-10', '2026-04-10']);
    expect(depois[1].prevPrice).toBe(5.00);
    expect(depois[2].prevPrice).toBe(7.00);
    expect(depois[2].variationPct).toBeCloseTo(-14.3, 1);
  });
});

describe('A ordem da série', () => {
  it('é por data e, no mesmo dia, pela ordem de lançamento', () => {
    /* No arquivo real há QUATRO notas no mesmo 23/07. Sem desempate estável a
       ordem viria do banco, e a variação mudaria entre duas leituras da mesma
       tela. */
    const primeira = nota('2026-07-23', 100, 10);
    const segunda = nota('2026-07-23', 200, 10);
    expect(ordemCronologica(primeira, segunda)).toBeLessThan(0);
    expect(ordemCronologica(segunda, primeira)).toBeGreaterThan(0);
  });

  it('quatro notas no mesmo dia encadeiam em fila, não todas contra a mesma', () => {
    const serie = encadear([a('2026-07-23', 6.4639), a('2026-07-23', 6.4639), a('2026-07-23', 6.46), a('2026-07-23', 6.46)]);
    expect(serie.map((e) => e.variationPct)).toEqual([null, 0, expect.closeTo(-0.1, 1), 0]);
  });
});

describe('A âncora do período', () => {
  it('a primeira linha compara com a última nota ANTES do período', () => {
    const serie = encadear([a('2026-07-01', 6.60)], 6.00);
    expect(serie[0].prevPrice).toBe(6.00);
    expect(serie[0].variationPct).toBeCloseTo(10, 1);
  });

  it('sem âncora, a primeira nota da história não tem variação', () => {
    /* `null`, e não 0%: zero afirmaria "o preço não mudou", quando não havia
       com o que comparar. */
    const serie = encadear([a('2026-07-01', 6.60)]);
    expect(serie[0].variationPct).toBeNull();
    expect(serie[0].prevPrice).toBeNull();
  });

  it('o filtro de período NÃO muda a variação de uma nota', () => {
    /* A propriedade que a âncora existe para garantir: a mesma nota lida em
       dois relatórios diferentes precisa dizer o mesmo número. */
    const historia = [a('2026-05-10', 6.00), a('2026-06-10', 6.60), a('2026-07-10', 7.00)];
    const tudo = encadear(historia);
    const soJulho = encadear([historia[2]], 6.60);
    expect(soJulho[0].variationPct).toBe(tudo[2].variationPct);
  });
});

describe('Nota sem kg não quebra a cadeia', () => {
  it('ela fica sem preço, mas não faz a seguinte pular um elo', () => {
    const serie = encadear([a('2026-01-10', 6.00), nota('2026-02-10', 500, 0), a('2026-03-10', 6.60)]);
    expect(serie[1].pricePerKg).toBe(0);
    expect(serie[1].variationPct).toBeNull();
    /* A de março compara com a de janeiro — o último preço REAL —, e não com
       um salto inventado. */
    expect(serie[2].prevPrice).toBe(6.00);
    expect(serie[2].variationPct).toBeCloseTo(10, 1);
  });
});

describe('Resumo do período', () => {
  const serie = encadear([
    nota('2026-01-10', 600, 100),   // 6,00/kg
    nota('2026-02-10', 7000, 1000), // 7,00/kg
    nota('2026-03-10', 650, 100),   // 6,50/kg
  ]);

  it('soma kg e valor', () => {
    const r = resumoDoPeriodo(serie);
    expect(r.notas).toBe(3);
    expect(r.kg).toBe(1200);
    expect(r.valor).toBe(8250);
  });

  it('o preço médio é PONDERADO — valor ÷ kg, não a média dos preços', () => {
    /* A média simples daria 6,50 e trataria a compra de 100 kg como igual à de
       1.000. O efetivo é 8250 ÷ 1200 = 6,875. É o mesmo erro do ticket médio
       consolidado, e sai igualmente plausível. */
    const r = resumoDoPeriodo(serie);
    expect(r.precoMedio).toBeCloseTo(6.875, 4);
    expect(r.precoMedio).not.toBeCloseTo(6.5, 2);
  });

  it('traz menor, maior, primeiro, último e a variação da ponta a ponta', () => {
    const r = resumoDoPeriodo(serie);
    expect(r.menorPreco).toBe(6);
    expect(r.maiorPreco).toBe(7);
    expect(r.primeiroPreco).toBe(6);
    expect(r.ultimoPreco).toBe(6.5);
    expect(r.variacaoNoPeriodo).toBeCloseTo(8.3, 1);
  });

  it('período vazio devolve zeros e nulos, sem NaN', () => {
    const r = resumoDoPeriodo([]);
    expect(r.notas).toBe(0);
    expect(r.kg).toBe(0);
    expect(r.precoMedio).toBeNull();
    expect(r.variacaoNoPeriodo).toBeNull();
  });
});
