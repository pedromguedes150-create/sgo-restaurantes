import { describe, it, expect } from 'vitest';
import { mediaPonderada, precoImplausivel, somarNotas, TETO_PRECO_KG_PADRAO } from '@/lib/gas/variacao';
import { alturaDaBarra } from '@/components/gas/gas-client';

/**
 * "AS COLUNAS NÃO ESTÃO SUBINDO."
 *
 * O print que originou isto: preço médio de R$ 48,9914/kg ao lado de um último
 * preço de R$ 7,0162/kg, e R$ 2.203.879 para 46 toneladas de gás. Uma nota
 * sozinha, com o TOTAL da nota lançado no lugar do preço por quilo, fazia três
 * estragos ao mesmo tempo — e os três em silêncio.
 */

/** Uma série de gás realista: varia poucos por cento. */
const serieReal = [6.46, 6.4639, 6.52, 7.0162];

describe('A escala das colunas', () => {
  it('com dado limpo, a variação de 6,46 a 7,02 APARECE', () => {
    /* Partindo do zero, a menor coluna tinha 92% da altura da maior: o gráfico
       que existe para mostrar variação era o que a escondia. */
    const min = Math.min(...serieReal);
    const max = Math.max(...serieReal);
    const menor = alturaDaBarra(min, min, max);
    const maior = alturaDaBarra(max, min, max);
    expect(maior).toBe(90);
    expect(menor).toBeLessThan(maior * 0.4);

    const escalaAntiga = (v: number) => Math.max(4, (v / max) * 90);
    expect(escalaAntiga(min) / escalaAntiga(max)).toBeGreaterThan(0.9);
  });

  it('o defeito relatado: UMA nota fora de escala achatava todas as outras', () => {
    /* Era literalmente isto — todo mês real ia para o piso de 4px e a coluna
       do mês estragado tomava o gráfico inteiro. */
    const comLixo = [...serieReal, 6295];
    const max = Math.max(...comLixo);
    const escalaAntiga = (v: number) => Math.max(4, (v / max) * 90);
    expect(serieReal.every((v) => escalaAntiga(v) === 4)).toBe(true);
  });

  it('série estável cai em meia altura, e não em zero nem no topo', () => {
    /* `min === max` (um mês só, ou preço que não mudou). Meia altura é honesto:
       não há variação a mostrar, e nem "despencou" nem "disparou". */
    expect(alturaDaBarra(6.5, 6.5, 6.5)).toBe(45);
  });

  it('nenhuma barra some: a menor ainda tem altura visível', () => {
    const min = Math.min(...serieReal);
    const max = Math.max(...serieReal);
    expect(alturaDaBarra(min, min, max)).toBeGreaterThanOrEqual(4);
  });
});

describe('O preço médio é ponderado', () => {
  const notas = [
    { quantityKg: 30, totalValue: 30 * 6.0 },
    { quantityKg: 600, totalValue: 600 * 7.0 },
  ];

  it('é valor ÷ kg, e não a média dos preços', () => {
    /* A média simples daria 6,50 e trataria a compra de 30 kg como igual à de
       600. O efetivo é 4.380 ÷ 630 = 6,9524. */
    expect(mediaPonderada(notas)).toBeCloseTo(6.9524, 3);
    expect(mediaPonderada(notas)).not.toBeCloseTo(6.5, 2);
  });

  it('soma kg e valor sem acumular ruído de ponto flutuante', () => {
    expect(somarNotas(notas)).toEqual({ kg: 630, valor: 4380 });
  });

  it('sem kg devolve null, e não NaN nem Infinity', () => {
    expect(mediaPonderada([{ quantityKg: 0, totalValue: 500 }])).toBeNull();
    expect(mediaPonderada([])).toBeNull();
  });
});

describe('A faixa de plausibilidade do preço/kg', () => {
  it('deixa passar o preço real do gás', () => {
    for (const p of serieReal) expect(precoImplausivel(p)).toBe(false);
  });

  it('barra o preço do BOTIJÃO inteiro lançado como preço de quilo', () => {
    /* P45 a ~R$ 6,50/kg custa ~R$ 293. É a troca mais provável de todas. */
    expect(precoImplausivel(293)).toBe(true);
  });

  it('barra o TOTAL da nota no lugar do unitário — o caso do print', () => {
    expect(precoImplausivel(6295)).toBe(true);
  });

  it('o teto é folgado: gás caro passa, e o corte não julga a compra', () => {
    /* ~4,5× o preço da rede. Nada legítimo chega perto; o teto separa preço de
       QUILO de preço de OUTRA COISA, não caro de barato. */
    expect(TETO_PRECO_KG_PADRAO).toBe(30);
    expect(precoImplausivel(12)).toBe(false);
    expect(precoImplausivel(29.99)).toBe(false);
    expect(precoImplausivel(30.01)).toBe(true);
  });

  it('respeita o teto configurado pelo Admin', () => {
    expect(precoImplausivel(50, 100)).toBe(false);
    expect(precoImplausivel(50, 40)).toBe(true);
  });

  it('nota sem preço não é implausível — é nota sem preço', () => {
    /* `null` vem de kg = 0. Tratá-la como fora da faixa a mandaria para o aviso
       vermelho, dizendo ao gerente para corrigir um preço que não existe. */
    expect(precoImplausivel(null)).toBe(false);
  });
});

describe('A folga separa os dois gráficos', () => {
  it('na comparação entre unidades a menor barra fica em metade da maior', () => {
    /* Ali o comprimento lê-se como grandeza. Duas unidades a R$ 6,5974 e
       R$ 6,6076 não podem virar "metade contra o dobro" só porque a amplitude
       da série é pequena — a diferença aparece, mas limitada a 2×. */
    const menor = alturaDaBarra(6.5974, 6.5974, 6.6076, 100, 1);
    const maior = alturaDaBarra(6.6076, 6.5974, 6.6076, 100, 1);
    expect(maior).toBe(100);
    expect(menor).toBe(50);
  });

  it('e vale qualquer que seja a diferença — o teto é sempre 2×', () => {
    const menor = alturaDaBarra(3, 3, 300, 100, 1);
    expect(menor).toBe(50);
  });

  it('a tendência mensal continua ampliando, que é o serviço dela', () => {
    const menor = alturaDaBarra(6.46, 6.46, 7.0162, 90);
    const maior = alturaDaBarra(7.0162, 6.46, 7.0162, 90);
    expect(menor / maior).toBeLessThan(0.3);
  });
});
