import { describe, it, expect } from 'vitest';
import { arcoDaRosca, comporMeta, faixaDaMeta, intervalosDaRosca, resumirRanking } from '@/lib/metas/graficos';

/** Gráficos de Metas (v1.163.0): composição pura do ranking e do detalhamento — nada recalcula a meta. */
describe('faixas e ranking', () => {
  it('semáforo de sempre: ≥80 verde, ≥50 âmbar, abaixo vermelho', () => {
    expect(faixaDaMeta(80)).toBe('VERDE');
    expect(faixaDaMeta(79)).toBe('AMBAR');
    expect(faixaDaMeta(50)).toBe('AMBAR');
    expect(faixaDaMeta(49)).toBe('VERMELHO');
  });
  it('resumo do ranking: contagem por faixa, média, mediana, melhor/pior e posição', () => {
    const r = resumirRanking([
      { unitId: 'a', name: 'Nova União', scorePct: 88 }, { unitId: 'b', name: 'Jardim', scorePct: 84 }, { unitId: 'c', name: 'Vespasiano', scorePct: 68 },
      { unitId: 'd', name: 'Produtos', scorePct: 57 }, { unitId: 'e', name: 'Moreira', scorePct: 39 },
    ]);
    expect(r.unidades).toBe(5);
    expect(r.porFaixa.map((f) => [f.faixa, f.qtd])).toEqual([['VERDE', 2], ['AMBAR', 2], ['VERMELHO', 1]]);
    expect(r.porFaixa[0].unidades).toEqual(['Nova União', 'Jardim']);
    expect(r.media).toBe(67); // 336/5 = 67,2
    expect(r.mediana).toBe(68);
    expect(r.melhor).toEqual({ name: 'Nova União', scorePct: 88 });
    expect(r.pior).toEqual({ name: 'Moreira', scorePct: 39 });
    expect(r.posicaoDe('d')).toBe(4);
    expect(r.posicaoDe('zz')).toBeNull();
    expect(resumirRanking([]).media).toBeNull();
    expect(resumirRanking([{ unitId: 'a', name: 'A', scorePct: 10 }, { unitId: 'b', name: 'B', scorePct: 20 }]).mediana).toBe(15);
  });
});

describe('comporMeta', () => {
  const breakdown = [
    { name: 'Abertura', weight: 10, done: 18, resolved: 20, scorePct: 90 },
    { name: 'Fechamento', weight: 10, done: 10, resolved: 20, scorePct: 50 },
    { name: 'Treinamentos (POPs)', weight: 5, done: 1, resolved: 4, scorePct: 25 },
    { name: 'Fora do prazo (−4% na meta)', weight: 0, done: 0, resolved: 2, scorePct: 0 },
  ];
  const c = comporMeta(breakdown);
  it('fatia = peso; cor = resultado; pontos ganhos/perdidos = peso × %', () => {
    expect(c.pesoTotal).toBe(25);
    expect(c.fatias.map((f) => [f.name, f.fracao, f.faixa, f.pontosGanhos, f.pontosPerdidos])).toEqual([
      ['Abertura', 0.4, 'VERDE', 9, 1],
      ['Fechamento', 0.4, 'AMBAR', 5, 5],
      ['Treinamentos (POPs)', 0.2, 'VERMELHO', 1.3, 3.7],
    ]);
    expect(c.pontosGanhos).toBe(15.3);
    expect(c.pontosPerdidos).toBe(9.7);
  });
  it('linha sem peso fica informativa; tarefas somam só os componentes com peso; maiores perdas em ordem', () => {
    expect(c.informativas.map((l) => l.name)).toEqual(['Fora do prazo (−4% na meta)']);
    expect(c.tarefas).toEqual({ done: 29, missed: 15, resolved: 44, pct: 66 });
    expect(c.maioresPerdas.map((m) => m.name)).toEqual(['Fechamento', 'Treinamentos (POPs)', 'Abertura']);
    const vazio = comporMeta([]);
    expect(vazio.tarefas.pct).toBeNull();
    expect(vazio.fatias).toEqual([]);
  });
});

describe('rosca em SVG', () => {
  it('intervalos acumulados ignoram zero e somam 1', () => {
    const xs = intervalosDaRosca([{ valor: 2 }, { valor: 0 }, { valor: 6 }]);
    expect(xs.map((x) => [x.de, x.ate])).toEqual([[0, 0.25], [0.25, 1]]);
    expect(intervalosDaRosca([{ valor: 0 }])).toEqual([]);
  });
  it('arco: começa no topo, usa a flag de arco grande acima de meia volta, círculo inteiro não degenera', () => {
    const quarto = arcoDaRosca(50, 50, 50, 30, 0, 0.25);
    expect(quarto.startsWith('M 50 0 A 50 50 0 0 1 100 50')).toBe(true);
    expect(arcoDaRosca(50, 50, 50, 30, 0, 0.75)).toContain('A 50 50 0 1 1');
    expect(arcoDaRosca(50, 50, 50, 30, 0, 1)).not.toContain('NaN');
    expect(arcoDaRosca(50, 50, 50, 30, 0.5, 0.5)).toBe('');
  });
});
