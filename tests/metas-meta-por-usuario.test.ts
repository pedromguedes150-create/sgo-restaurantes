import { describe, it, expect } from 'vitest';
import { explicarNota, metaDaUnidade, metaDaUnidadeDoUsuario, metaDoUsuario, rotuloCurto, type MetaDaUnidade, type PesoDaMeta } from '@/lib/metas/meta-por-usuario';
import { pontuar, type ComponenteDaMeta } from '@/lib/metas/pontuacao';

/**
 * Meta por usuário (v1.179.0): a nota da bonificação por pessoa — a MESMA
 * conta da meta da unidade (`pontuar`), herdada por quem cuida da unidade.
 */

const c = (key: string, weight: number, done: number, missed: number): ComponenteDaMeta => ({ key, name: key, weight, done, missed });
const pesos: PesoDaMeta[] = [{ key: 'TASKS', name: 'Checklists do dia', weight: 50 }, { key: 'WASTE', name: 'Desperdício', weight: 40 }, { key: 'CASH', name: 'Cofre', weight: 0 }];

describe('metaDaUnidade', () => {
  it('o exemplo do Pedro: desperdício 40 a 50% e checklists 50 a 50% = 50%; só pesa quem tem peso e algo resolvido', () => {
    const u = metaDaUnidade('u1', 'Juatuba', [c('TASKS', 50, 10, 10), c('WASTE', 40, 15, 15), c('CASH', 0, 30, 0), c('COMMANDS', 30, 0, 0)], []);
    expect(u.scorePct).toBe(50);
    expect(u.notaAntesDosDescontos).toBe(50);
    expect(u.componentes.map((x) => x.key)).toEqual(['TASKS', 'WASTE']); // peso 0 fora; 0 resolvido fora
    expect(u.componentes[0]).toMatchObject({ weight: 50, done: 10, resolved: 20, scorePct: 50 });
  });

  it('a nota é EXATAMENTE a da meta da unidade, descontos inclusos', () => {
    const comps = [c('TASKS', 50, 18, 2), c('WASTE', 40, 20, 10)];
    const descontos = [{ name: 'Escala de gerentes', quantidade: 1, pct: 5 }];
    const u = metaDaUnidade('u1', 'Juatuba', comps, descontos);
    expect(u.scorePct).toBe(pontuar(comps, descontos).scorePct);
    expect(u.notaAntesDosDescontos).toBe(pontuar(comps, []).scorePct);
    expect(u.descontos).toEqual([{ name: 'Escala de gerentes', quantidade: 1, pct: 5, total: 5 }]);
  });
});

describe('metaDoUsuario', () => {
  const juatuba: MetaDaUnidade = metaDaUnidade('u1', 'Juatuba', [c('TASKS', 50, 10, 10), c('WASTE', 40, 15, 15)], []);
  const orla: MetaDaUnidade = metaDaUnidade('u2', 'Orla', [c('TASKS', 50, 20, 0), c('WASTE', 40, 30, 0)], [{ name: 'Fora do prazo', quantidade: 2, pct: 5 }]);

  it('uma unidade: o gerente herda a nota dela, componente a componente', () => {
    const m = metaDoUsuario([juatuba], pesos)!;
    expect(m.scorePct).toBe(50);
    expect(m.componentes.map((x) => [x.key, x.weight, x.scorePct])).toEqual([['TASKS', 50, 50], ['WASTE', 40, 50]]); // CASH (peso 0) não entra
    expect(m.unidades).toEqual([{ unitId: 'u1', unitName: 'Juatuba', scorePct: 50 }]);
    expect(m.descontoTotal).toBe(0);
  });

  it('duas unidades: média simples das notas, e o desconto aparece como média também', () => {
    expect(orla.scorePct).toBe(90); // 100 − 2 × 5
    const m = metaDoUsuario([juatuba, orla], pesos)!;
    expect(m.scorePct).toBe(70); // (50 + 90) / 2
    expect(m.notaAntesDosDescontos).toBe(75); // (50 + 100) / 2
    expect(m.descontoTotal).toBe(5);
    expect(m.componentes.find((x) => x.key === 'TASKS')!.scorePct).toBe(75);
  });

  it('componente em vigor que ninguém pontuou aparece com nulo (coluna "—"), não com zero', () => {
    const m = metaDoUsuario([juatuba], [...pesos, { key: 'COMMANDS', name: 'Comandas', weight: 30 }])!;
    expect(m.componentes.find((x) => x.key === 'COMMANDS')!.scorePct).toBeNull();
    expect(m.scorePct).toBe(50);
  });

  it('sem unidade não há o que medir: nulo, não zero', () => {
    expect(metaDoUsuario([], pesos)).toBeNull();
  });
});

describe('explicarNota', () => {
  it('escreve a conta por extenso, com os descontos e a média quando há mais de uma unidade', () => {
    const juatuba = metaDaUnidade('u1', 'Juatuba', [c('TASKS', 50, 10, 10), c('WASTE', 40, 15, 15)], [{ name: 'Escala de gerentes', quantidade: 1, pct: 5 }]);
    expect(explicarNota(metaDoUsuario([juatuba], pesos)!)).toBe('Checklists 50 × 50% + Desperdício 40 × 50% ÷ 90 = 50% · descontos −5 = 45%');
    const orla = metaDaUnidade('u2', 'Orla', [c('TASKS', 50, 20, 0), c('WASTE', 40, 30, 0)], []);
    expect(explicarNota(metaDoUsuario([juatuba, orla], pesos)!)).toContain('(média de 2 unidades)');
  });
  it('rótulo curto conhecido ou o nome que veio', () => {
    expect(rotuloCurto('WASTE', 'Desperdício diário (cobertura)')).toBe('Desperdício');
    expect(rotuloCurto('XPTO', 'Outro')).toBe('Outro');
  });
});

describe('desconto com dono (v1.214.0): a Escala de gerentes só atinge quem está sem folga', () => {
  /* Vivendas: quatro gerentes, só a Cristina sem folga. */
  const comps = [c('TASKS', 50, 12, 8), c('WASTE', 40, 12, 8)];
  const descontos = [
    { name: 'Fora do prazo', quantidade: 1, pct: 2 },
    { name: 'Escala de gerentes', quantidade: 1, pct: 5, detalhe: 'sem folga cadastrada: Cristina', individual: { userIds: ['cristina'] } },
  ];
  const vivendas = metaDaUnidade('v', 'Vivendas', comps, descontos);

  it('a nota da UNIDADE não muda: segue com os dois descontos', () => {
    expect(vivendas.scorePct).toBe(pontuar(comps, descontos).scorePct); // 60 − 2 − 5 = 53
    expect(vivendas.scorePct).toBe(53);
  });
  it('quem tem folga cadastrada não perde os 5 pontos; o desconto da unidade (fora do prazo) continua para todos', () => {
    const amos = metaDaUnidadeDoUsuario(vivendas, 'amos');
    expect(amos.scorePct).toBe(58);
    expect(amos.descontos.map((d) => d.name)).toEqual(['Fora do prazo']);
    expect(metaDoUsuario([amos], pesos)).toMatchObject({ scorePct: 58, notaAntesDosDescontos: 60, descontoTotal: 2 });
  });
  it('quem está sem folga perde os 5 pontos, uma vez, com o motivo dito a ela', () => {
    const cris = metaDaUnidadeDoUsuario(vivendas, 'cristina');
    expect(cris.scorePct).toBe(53);
    expect(cris.descontos.find((d) => d.name === 'Escala de gerentes')).toMatchObject({ quantidade: 1, total: 5, detalhe: 'você está sem folga cadastrada no mês' });
  });
  it('dois sem folga: a unidade perde 10, cada um deles perde 5 e os outros nada', () => {
    const d2 = [{ name: 'Escala de gerentes', quantidade: 2, pct: 5, individual: { userIds: ['a', 'b'] } }];
    const u = metaDaUnidade('v', 'Vivendas', comps, d2);
    expect(u.scorePct).toBe(50);
    expect(metaDaUnidadeDoUsuario(u, 'a').scorePct).toBe(55);
    expect(metaDaUnidadeDoUsuario(u, 'c').scorePct).toBe(60);
  });
  it('nunca fica negativa; unidade montada sem a informação volta como está', () => {
    const baixa = metaDaUnidade('v', 'V', [c('TASKS', 50, 0, 10)], [{ name: 'Escala de gerentes', quantidade: 1, pct: 5, individual: { userIds: ['x'] } }]);
    expect(metaDaUnidadeDoUsuario(baixa, 'x').scorePct).toBe(0);
    const antiga: MetaDaUnidade = { unitId: 'u', unitName: 'U', scorePct: 40, notaAntesDosDescontos: 45, componentes: [], descontos: [] };
    expect(metaDaUnidadeDoUsuario(antiga, 'x')).toBe(antiga);
  });
});
