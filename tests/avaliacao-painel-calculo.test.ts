import { describe, it, expect } from 'vitest';
import { evolucaoDoCriterio, lerFiltroPainel, mesesEntre, montarPainel, queryDoFiltroPainel, situacaoDoPlano, somarMeses, type AvaliacaoDoPainel, type PlanoDoPainel } from '@/lib/people/avaliacao-painel-calculo';

/**
 * Painel gerencial da avaliação (v1.162.0) — composição PURA das avaliações
 * gravadas: cobertura, médias, evolução, abaixo do esperado, critérios com
 * dificuldade e planos (vencido derivado).
 */
const a = (p: Partial<AvaliacaoDoPainel> & { collaboratorId: string; yearMonth: string; nota: number | null }): AvaliacaoDoPainel => ({
  id: p.collaboratorId + p.yearMonth, collaboratorName: p.collaboratorId, unitId: 'u1', unitName: 'Centro', funcao: 'Cozinheiro', evaluatorName: 'Ger',
  classificacao: p.nota == null ? null : p.nota >= 4.5 ? 'EXCELENTE' : p.nota >= 3.5 ? 'BOM' : p.nota >= 2.5 ? 'REGULAR' : 'MELHORAR',
  respostas: [], revisaoAberta: false, ...p,
});
const plano = (p: Partial<PlanoDoPainel> & { id: string; dueDate: string }): PlanoDoPainel => ({
  collaboratorId: 'ana', collaboratorName: 'ana', unitId: 'u1', unitName: 'Centro', yearMonth: '2026-09', criterionLabel: 'Pontualidade', action: 'x', responsibleName: 'Ger', status: 'PENDING', completedAt: null, ...p,
});

describe('período e filtro', () => {
  it('mesesEntre, somarMeses e o padrão de 6 meses até o mês corrente', () => {
    expect(mesesEntre('2026-05', '2026-10')).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(mesesEntre('2026-11', '2026-10')).toEqual([]);
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    const f = lerFiltroPainel({}, '2026-10');
    expect(f).toEqual({ de: '2026-05', ate: '2026-10', unitId: null, funcao: null, colaborador: null });
    // "até" no futuro cai no mês corrente; "de" depois do "até" vira o próprio "até"; mais de 24 meses é cortado
    expect(lerFiltroPainel({ de: '2026-12', ate: '2027-03' }, '2026-10')).toMatchObject({ de: '2026-10', ate: '2026-10' });
    expect(mesesEntre(lerFiltroPainel({ de: '2020-01', ate: '2026-10' }, '2026-10').de, '2026-10')).toHaveLength(24);
    expect(queryDoFiltroPainel({ de: '2026-05', ate: '2026-10', unitId: 'u1', funcao: 'Garçom / Atendente', colaborador: null })).toBe('de=2026-05&ate=2026-10&unit=u1&funcao=Gar%C3%A7om+%2F+Atendente');
  });
});

describe('montarPainel', () => {
  const meses = ['2026-09', '2026-10'];
  const avals = [
    a({ collaboratorId: 'ana', yearMonth: '2026-09', nota: 2, respostas: [{ key: 'pontualidade', label: 'Pontualidade', score: 1 }, { key: 'equipe', label: 'Equipe', score: 3 }] }),
    a({ collaboratorId: 'ana', yearMonth: '2026-10', nota: 3, respostas: [{ key: 'pontualidade', label: 'Pontualidade', score: 2 }, { key: 'equipe', label: 'Equipe', score: 4 }] }),
    a({ collaboratorId: 'bia', yearMonth: '2026-10', nota: 2.2, funcao: 'Garçom / Atendente', unitId: 'u2', unitName: 'Orla', revisaoAberta: true, respostas: [{ key: 'pontualidade', label: 'Pontualidade', score: 2 }] }),
    a({ collaboratorId: 'leg', yearMonth: '2026-09', nota: 4.5, classificacao: null }), // formato antigo: nota sem classificação
    a({ collaboratorId: 'sem', yearMonth: '2026-10', nota: null }),
  ];
  const ativos = [{ unitId: 'u1', unitName: 'Centro', ativos: 2 }, { unitId: 'u2', unitName: 'Orla', ativos: 1 }];
  const planos = [plano({ id: 'p1', dueDate: '2026-09-30' }), plano({ id: 'p2', dueDate: '2026-12-01', status: 'IN_PROGRESS' }), plano({ id: 'p3', dueDate: '2026-09-01', status: 'DONE', completedAt: '2026-09-15T00:00:00Z', collaboratorId: 'bia', collaboratorName: 'bia' })];
  const p = montarPainel(avals, ativos, planos, meses, '2026-10-08');

  it('resumo: cobertura = avaliações ÷ (ativos × meses), média das notas, revisões abertas', () => {
    // 5 avaliações ÷ (3 ativos × 2 meses) = 83,3%
    expect(p.resumo).toEqual({ avaliacoes: 5, colaboradores: 4, media: 2.93, cobertura: 83.3, abaixo: 1, revisoesAbertas: 1 });
    expect(p.classificacoes.map((c) => c.qtd)).toEqual([0, 0, 1, 2]); // 4,5 sem classificação (antiga) não entra
  });
  it('abaixo do esperado olha a ÚLTIMA avaliação de cada um (ana se recuperou: 2 → 3)', () => {
    expect(p.abaixoDoEsperado.map((x) => x.collaboratorId)).toEqual(['bia']);
    expect(p.abaixoDoEsperado[0].planosAbertos).toBe(0); // o plano da bia já está concluído
  });
  it('por unidade e por função, ordenados pela média', () => {
    expect(p.porUnidade.map((u) => [u.unitName, u.ativos, u.avaliacoes, u.cobertura, u.media, u.abaixo])).toEqual([
      ['Centro', 2, 4, 100, 3.17, 0], // (2+3+4,5)/3; "sem" não tem nota mas conta como avaliação
      ['Orla', 1, 1, 50, 2.2, 1],
    ]);
    expect(p.porFuncao.map((f) => [f.funcao, f.avaliacoes, f.colaboradores, f.media, f.abaixo])).toEqual([
      ['Cozinheiro', 3, 2, 3.17, 0],
      ['Garçom / Atendente', 1, 1, 2.2, 1],
    ]);
  });
  it('evolução mensal e critérios com maior dificuldade (menores médias primeiro)', () => {
    expect(p.evolucao).toEqual([{ yearMonth: '2026-09', avaliacoes: 2, media: 3.25 }, { yearMonth: '2026-10', avaliacoes: 3, media: 2.6 }]);
    expect(p.criterios).toEqual([
      { key: 'pontualidade', label: 'Pontualidade', media: 1.67, respostas: 3, abaixo: 3 },
      { key: 'equipe', label: 'Equipe', media: 3.5, respostas: 2, abaixo: 0 },
    ]);
  });
  it('planos: vencido é derivado do prazo; concluído nunca vence', () => {
    expect(p.planos).toMatchObject({ pendentes: 0, emAndamento: 1, concluidos: 1, vencidos: 1 });
    expect(p.planos.lista.map((x) => [x.id, x.situacao])).toEqual([['p3', 'DONE'], ['p1', 'VENCIDO'], ['p2', 'IN_PROGRESS']]);
    expect(situacaoDoPlano({ status: 'PENDING', dueDate: '2026-10-08' }, '2026-10-08')).toBe('PENDING');
    expect(situacaoDoPlano({ status: 'PENDING', dueDate: '2026-10-07' }, '2026-10-08')).toBe('VENCIDO');
    expect(situacaoDoPlano({ status: 'DONE', dueDate: '2020-01-01' }, '2026-10-08')).toBe('DONE');
  });
  it('sem ativos a cobertura é nula; sem avaliações as médias são nulas', () => {
    const vazio = montarPainel([], [], [], meses, '2026-10-08');
    expect(vazio.resumo).toEqual({ avaliacoes: 0, colaboradores: 0, media: null, cobertura: null, abaixo: 0, revisoesAbertas: 0 });
    expect(vazio.evolucao.map((e) => e.media)).toEqual([null, null]);
  });
});

describe('evolucaoDoCriterio', () => {
  it('compara a nota do critério entre a avaliação anterior e a atual', () => {
    expect(evolucaoDoCriterio(2, 4)).toEqual({ antes: 2, depois: 4, tendencia: 'MELHOROU' });
    expect(evolucaoDoCriterio(3, 3)).toEqual({ antes: 3, depois: 3, tendencia: 'IGUAL' });
    expect(evolucaoDoCriterio(4, 2)).toEqual({ antes: 4, depois: 2, tendencia: 'PIOROU' });
    expect(evolucaoDoCriterio(null, 4)).toEqual({ antes: null, depois: 4, tendencia: null });
    expect(evolucaoDoCriterio(2, undefined)).toEqual({ antes: 2, depois: null, tendencia: null });
  });
});
