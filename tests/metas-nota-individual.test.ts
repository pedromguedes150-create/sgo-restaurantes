import { describe, it, expect } from 'vitest';
import {
  aplicarIndividuais, componentePorPlantao, estaDePlantao, individuaisDoGerente, modoDaNotaIndividual,
  type FatoDoDia, type FatosDaUnidade, type GerenteDoPlantao,
} from '@/lib/metas/nota-individual';
import { explicarIndividual, metaDaUnidade, metaDaUnidadeDoUsuario, metaDoUsuario, metaIndividualDaUnidade } from '@/lib/metas/meta-por-usuario';
import { metaNoInicio, textoDoPlantao } from '@/lib/metas/meta-do-gerente';
import type { ComponenteDaMeta, DescontoDaMeta } from '@/lib/metas/pontuacao';

/* Dezembro/2026: dia 1 é terça. Ana trabalha seg–sex; Bia não tem horário e folga no dia 2. */
const ana: GerenteDoPlantao = { userId: 'ana', weekdays: [1, 2, 3, 4, 5], ausencias: [] };
const bia: GerenteDoPlantao = { userId: 'bia', weekdays: [], ausencias: [{ startDate: '2026-12-02', endDate: '2026-12-02' }] };
const dia = (d: number) => `2026-12-${String(d).padStart(2, '0')}`;
const fato = (d: number, feitos: number, devidos: number, porAutor: Record<string, number> = {}): FatoDoDia => ({ dia: dia(d), feitos, devidos, porAutor });

describe('nota individual — vigência', () => {
  it('desligada antes de novembro, simulação em novembro e oficial de dezembro em diante', () => {
    expect(modoDaNotaIndividual('2026-10')).toBe('DESLIGADA');
    expect(modoDaNotaIndividual('2026-11')).toBe('SIMULACAO');
    expect(modoDaNotaIndividual('2026-12')).toBe('OFICIAL');
    expect(modoDaNotaIndividual('2027-01')).toBe('OFICIAL');
  });
});

describe('nota individual — plantão', () => {
  it('folga lançada vence o padrão; sem horário é plantão todo dia; fora do padrão não é plantão', () => {
    expect(estaDePlantao(ana, dia(1))).toBe(true);
    expect(estaDePlantao(ana, dia(5))).toBe(false); // sábado
    expect(estaDePlantao(bia, dia(5))).toBe(true);
    expect(estaDePlantao(bia, dia(2))).toBe(false);
  });

  it('o dia de folga não conta contra o gerente', () => {
    /* Dia 5 (sábado) ninguém lançou: pesa para a Bia, não para a Ana. */
    const fatos = [fato(1, 1, 1, { ana: 1 }), fato(2, 1, 1, { ana: 1 }), fato(5, 0, 1)];
    const a = componentePorPlantao(fatos, 'ana', [ana, bia])!;
    expect(a.diasDePlantao).toBe(2);
    expect(a.pctNosDias).toBe(100);
    const b = componentePorPlantao(fatos, 'bia', [ana, bia])!;
    expect(b.diasDePlantao).toBe(2); // dias 1 e 5 (folga no 2)
    expect(b.pctNosDias).toBe(50);
  });

  it('sem nenhum dia de plantão com algo devido → nada a medir (nulo, não zero)', () => {
    const ferias: GerenteDoPlantao = { userId: 'f', weekdays: [], ausencias: [{ startDate: '2026-12-01', endDate: '2026-12-31' }] };
    expect(componentePorPlantao([fato(1, 0, 1)], 'f', [ferias])).toBeNull();
  });
});

describe('nota individual — participação', () => {
  it('quem divide com o colega não perde; quem não faz nada não herda', () => {
    /* Dias 1, 3 e 4: os dois de plantão, 10 checklists por dia, todos feitos pela Ana. */
    const fatos = [1, 3, 4].map((d) => fato(d, 10, 10, { ana: 10 }));
    const a = componentePorPlantao(fatos, 'ana', [ana, bia])!;
    expect(a.participacaoPct).toBe(200); // fez o dobro da parte dela
    expect(a.scorePct).toBe(100);
    const b = componentePorPlantao(fatos, 'bia', [ana, bia])!;
    expect(b.pctNosDias).toBe(100);
    expect(b.participacaoPct).toBe(0);
    expect(b.scorePct).toBe(0);
  });

  it('abaixo de 25% da própria parte o componente cai na proporção', () => {
    /* Parte da Bia = 30 ÷ 2 = 15; ela fez 3 = 20% → fator 20 ÷ 25 = 80%. */
    const fatos = [fato(1, 10, 10, { ana: 9, bia: 1 }), fato(3, 10, 10, { ana: 9, bia: 1 }), fato(4, 10, 10, { ana: 9, bia: 1 })];
    const b = componentePorPlantao(fatos, 'bia', [ana, bia])!;
    expect(b.participacaoPct).toBe(20);
    expect(b.fatorPct).toBe(80);
    expect(b.scorePct).toBe(80);
  });

  it('feito por quem não é gerente (caixa) conta para o dia e fica fora da participação', () => {
    const fatos = [fato(1, 1, 1, { caixa: 1 }), fato(3, 1, 1, { caixa: 1 })];
    const a = componentePorPlantao(fatos, 'ana', [ana, bia])!;
    expect(a.participacaoPct).toBeNull();
    expect(a.scorePct).toBe(100);
  });

  it('o que o gerente fez na folga também conta a favor dele', () => {
    /* Bia folga no dia 2 e mesmo assim lançou; no dia 1 a Ana lançou. Parte da Bia (dia 1) = 0,5; ela fez 1. */
    const fatos = [fato(1, 1, 1, { ana: 1 }), fato(2, 1, 1, { bia: 1 })];
    const b = componentePorPlantao(fatos, 'bia', [ana, bia])!;
    expect(b.fatorPct).toBe(100);
  });
});

describe('nota individual — a nota com os mesmos pesos', () => {
  const comps: ComponenteDaMeta[] = [
    { key: 'TASKS', name: 'Checklists do dia', weight: 50, done: 80, missed: 20 },
    { key: 'WASTE', name: 'Desperdício', weight: 40, done: 2, missed: 2 },
    { key: 'TRAINING', name: 'Treinamentos', weight: 10, done: 1, missed: 1 },
    { key: 'COMMUNICATION', name: 'Comunicados', weight: 0, done: 1, missed: 0 },
  ];
  const descs: DescontoDaMeta[] = [
    { name: 'Fora do prazo', quantidade: 1, pct: 2 },
    { name: 'Escala de gerentes', quantidade: 1, pct: 5, individual: { userIds: ['bia'] } },
  ];
  const fatos: FatosDaUnidade = {
    gerentes: [ana, bia],
    porDia: {
      TASKS: [fato(1, 50, 50, { ana: 25, bia: 25 }), fato(5, 30, 50, { bia: 30 })],
      WASTE: [fato(1, 1, 1, { ana: 1 }), fato(2, 1, 1, { ana: 1 }), fato(5, 0, 1), fato(6, 0, 1)],
    },
    porPessoa: { COMMUNICATION: { ana: { done: 1, missed: 0 } } },
  };
  const unidade = metaDaUnidade('u1', 'Vivendas', comps, descs);

  it('a nota da UNIDADE não muda', () => {
    /* (50×0,8 + 40×0,5 + 10×0,5) ÷ 100 = 65 → −2 → −5 = 58 */
    expect(unidade.scorePct).toBe(58);
  });

  it('cada gerente recebe os próprios dias; treinamentos seguem os da unidade', () => {
    const a = metaIndividualDaUnidade(unidade, 'ana', fatos);
    /* Ana: checklists 50/50 = 100; desperdício dias 1 e 2 = 100; treinamentos 50 → 95 → −2 = 93 (sem o −5: tem folga). */
    expect(a.componentes.find((c) => c.key === 'TASKS')!.scorePct).toBe(100);
    expect(a.componentes.find((c) => c.key === 'WASTE')!.scorePct).toBe(100);
    expect(a.componentes.find((c) => c.key === 'TRAINING')!.scorePct).toBe(50);
    expect(a.scorePct).toBe(93);
    expect(a.descontos.map((d) => d.name)).toEqual(['Fora do prazo']);

    const b = metaIndividualDaUnidade(unidade, 'bia', fatos);
    /* Bia: checklists dias 1 e 5 = 80/100; desperdício dias 1, 5 e 6 = 1/3, sem nada lançado por ela → 0. */
    expect(b.componentes.find((c) => c.key === 'TASKS')!.scorePct).toBe(80);
    expect(b.componentes.find((c) => c.key === 'WASTE')!.scorePct).toBe(0);
    /* (50×0,8 + 40×0 + 10×0,5) ÷ 100 = 45 → −2 → −5 = 38 */
    expect(b.scorePct).toBe(38);
    expect(b.semHorario).toBe(true);
    expect(a.semHorario).toBe(false);
  });

  it('sem os fatos, ou para quem não é gerente da unidade, vale a nota herdada', () => {
    expect(metaIndividualDaUnidade(unidade, 'ana', undefined).scorePct).toBe(metaDaUnidadeDoUsuario(unidade, 'ana').scorePct);
    expect(metaIndividualDaUnidade(unidade, 'outro', fatos).scorePct).toBe(metaDaUnidadeDoUsuario(unidade, 'outro').scorePct);
  });

  it('componente sem nada a medir PARA A PESSOA sai da conta dela', () => {
    const ind = individuaisDoGerente(fatos, 'bia')!;
    expect(ind.COMMUNICATION).toBeNull();
    const trocados = aplicarIndividuais(comps, ind);
    expect(trocados.find((c) => c.key === 'COMMUNICATION')).toMatchObject({ done: 0, missed: 0, weight: 0 });
    expect(trocados.find((c) => c.key === 'TRAINING')).toEqual(comps[2]);
  });

  it('a explicação e o cartão do gerente dizem o plantão e a participação', () => {
    const pesos = comps.filter((c) => c.weight > 0).map((c) => ({ key: c.key, name: c.name, weight: c.weight }));
    const m = metaDoUsuario([metaIndividualDaUnidade(unidade, 'bia', fatos)], pesos)!;
    const frases = explicarIndividual(m);
    expect(frases.some((f) => f.startsWith('Checklists: 80% nos seus 2 dia(s) de plantão'))).toBe(true);
    expect(frases.some((f) => f.includes('Desperdício') && f.includes('mínimo 25%'))).toBe(true);
    expect(m.semHorario).toBe(true);

    const inicio = metaNoInicio([metaIndividualDaUnidade(unidade, 'bia', fatos)]);
    expect(inicio.scorePct).toBe(38);
    const item = inicio.unidades[0].itens.find((i) => i.key === 'WASTE')!;
    expect(textoDoPlantao(item.individual!)).toContain('o item foi reduzido');
    expect(inicio.unidades[0].semHorario).toBe(true);
  });
});
