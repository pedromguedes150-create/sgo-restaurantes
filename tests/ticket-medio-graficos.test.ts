import { describe, it, expect } from 'vitest';
import { ordemPorReceita, participacao, rankingDoTicket, MAX_FATIAS, type LinhaParaGrafico } from '@/lib/ticket-media/graficos';

/** v1.209.0 — os gráficos do Ticket Médio só apresentam o que o painel calculou. */

const l = (id: string, receita: number, coupons: number, o: Partial<LinhaParaGrafico> = {}): LinhaParaGrafico =>
  ({ unitId: id, name: `Unidade ${id}`, receita, coupons, ticket: coupons ? receita / coupons : null, variacaoTicket: null, importado: true, ...o });

describe('participacao', () => {
  const linhas = [l('a', 100_000, 2_000), l('b', 300_000, 5_000), l('c', 0, 0, { importado: false, ticket: null })];

  it('fatias da maior para a menor, em % do total das importadas; pendente não entra', () => {
    const ordem = ordemPorReceita(linhas);
    expect(ordem).toEqual(['b', 'a']);
    const r = participacao(linhas, 'receita', ordem);
    expect(r.map((f) => [f.unitId, f.pct, f.cor])).toEqual([['b', 75, 0], ['a', 25, 1]]);
    expect(r.reduce((s, f) => s + f.pct, 0)).toBe(100);
  });

  it('a cor é da unidade: nos cupons a ordem pode mudar, a cor não', () => {
    const xs = [l('a', 100, 90), l('b', 300, 10)];
    const ordem = ordemPorReceita(xs);
    const c = participacao(xs, 'coupons', ordem);
    expect(c.map((f) => [f.unitId, f.cor])).toEqual([['a', 1], ['b', 0]]);
  });

  it('além do teto vira "Outras"; sem dado não há fatia', () => {
    const muitas = Array.from({ length: 9 }, (_, i) => l(`u${i}`, 1000 - i * 10, 10));
    const r = participacao(muitas, 'receita', ordemPorReceita(muitas));
    expect(r).toHaveLength(MAX_FATIAS + 1);
    expect(r[r.length - 1]).toMatchObject({ unitId: null, name: 'Outras (2)', cor: MAX_FATIAS });
    expect(participacao([l('x', 0, 0, { importado: false })], 'receita', [])).toEqual([]);
  });
});

describe('rankingDoTicket', () => {
  it('do maior para o menor, com a distância para o consolidado', () => {
    const linhas = [l('a', 100_000, 2_000), l('b', 300_000, 5_000)]; // 50 e 60; consolidado 57,14
    const consolidado = 400_000 / 7_000;
    const r = rankingDoTicket(linhas, consolidado);
    expect(r.barras.map((b) => b.unitId)).toEqual(['b', 'a']);
    expect(r.barras[0].largura).toBe(100);
    expect(r.barras[0].vsConsolidado).toBe(5);
    expect(r.barras[1].vsConsolidado).toBe(-12.5);
    expect(r.marcaDoConsolidado).toBe(95.2);
    expect(rankingDoTicket([], null)).toEqual({ barras: [], marcaDoConsolidado: null });
  });
});
