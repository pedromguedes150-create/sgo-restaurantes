import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/desperdicios/consolidado',
}));

let sessao = { id: 'u1', name: 'Alan', role: 'ADMIN', unitIds: [] as string[], seesAllUnits: true, needsTerms: false };
let consolidado: unknown = null;

vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => sessao }));
vi.mock('@/lib/waste/consolidado', () => ({ getConsolidadoDeDesperdicio: async () => consolidado }));

import { renderToString } from 'react-dom/server';
import React from 'react';
import Page from '@/app/(app)/modulos/desperdicios/consolidado/page';
import type { ConsolidadoDeDesperdicio, LinhaDoConsolidado } from '@/lib/waste/consolidado';

/**
 * A TELA do painel consolidado.
 *
 * O que se mede é o que a supervisão LÊ — e o risco desta tela é fazer alguém
 * cobrar a unidade errada: variação sem base, e "zero quilo" de quem só parou
 * de lançar.
 */

function linha(nome: string, over: Partial<LinhaDoConsolidado> = {}): LinhaDoConsolidado {
  return {
    unitId: `u-${nome}`, unitName: nome,
    porCodigo: { SS_ALMOCO: 10, SS_JANTAR: 0, REF_ALMOCO: 0, REF_JANTAR: 0, PROD_ALMOCO: 5, PROD_JANTAR: 0 },
    sobraLimpa: 10, sobraProducao: 5, geral: 15,
    anterior: 10, variacao: 50, diasComLancamento: 12, diasDecorridos: 20,
    ...over,
  };
}

function base(over: Partial<ConsolidadoDeDesperdicio> = {}): ConsolidadoDeDesperdicio {
  const l = linha('Jardim Teresópolis');
  return {
    year: 2026, month: 9,
    linhas: [l],
    rede: {
      porCodigo: l.porCodigo, sobraLimpa: 10, sobraProducao: 5, geral: 15,
      anterior: 10, variacao: 50,
    },
    subiram: [l], cairam: [], semLancamento: [],
    ...over,
  };
}

const render = async (sp: { ano?: string; mes?: string } = {}) =>
  renderToString(await Page({ searchParams: sp })).split('<!-- -->').join('');

beforeEach(() => {
  sessao = { id: 'u1', name: 'Alan', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
  consolidado = base();
});

describe('A tabela da rede', () => {
  it('traz as seis colunas de tipo e os três totais', async () => {
    const html = await render();
    for (const t of ['Self-service almoço', 'Self-service jantar', 'Refeitório almoço', 'Refeitório jantar', 'Sobras produção almoço', 'Sobras produção jantar']) {
      expect(html, t).toContain(t);
    }
    expect(html).toContain('TOTAL S L (kg)');
    expect(html).toContain('TOTAL SOBRA PRODUÇÃO (kg)');
    expect(html).toContain('TOTAL GERAL DIA (kg)');
  });

  it('mostra a unidade e a linha da rede', async () => {
    const html = await render();
    expect(html).toContain('Jardim Teresópolis');
    expect(html).toContain('Rede');
  });
});

describe('Para que lado cada unidade foi', () => {
  it('quem subiu aparece no bloco de aumento, com o antes e o depois', async () => {
    const html = await render();
    expect(html).toContain('Aumentou em setembro');
    expect(html).toContain('50');
  });

  it('quem caiu aparece no outro bloco', async () => {
    const caiu = linha('Moreira', { geral: 6, anterior: 10, variacao: -40 });
    consolidado = base({ linhas: [caiu], subiram: [], cairam: [caiu] });
    const html = await render();
    expect(html).toContain('Diminuiu em setembro');
    expect(html).toContain('Moreira');
  });

  it('sem base de comparação, a variação sai como traço — nunca como "+100%"', async () => {
    const semBase = linha('Nova', { anterior: 0, variacao: null });
    consolidado = base({ linhas: [semBase], subiram: [], cairam: [], rede: { ...base().rede, variacao: null } });
    const html = await render();
    expect(html).toContain('—');
    expect(html).not.toContain('▲ 100');
  });
});

describe('Zero quilo não é elogio', () => {
  it('quem não lançou nada é apontado, com a frase que evita a leitura errada', async () => {
    const parada = linha('Igarapé', { geral: 0, sobraLimpa: 0, sobraProducao: 0, diasComLancamento: 0, variacao: null });
    consolidado = base({ linhas: [parada], subiram: [], cairam: [], semLancamento: [parada] });
    const html = await render();
    expect(html).toContain('Sem nenhum lançamento em setembro');
    expect(html).toContain('ninguém lançou');
  });

  it('a cobertura fica visível na tabela — dias lançados sobre dias decorridos', async () => {
    const html = await render();
    expect(html).toContain('12');
    expect(html).toContain('20');
    expect(html).toContain('Dias lançados');
  });
});

describe('Navegação do mês', () => {
  it('respeita o mês pedido e vira o ano para trás em janeiro', async () => {
    consolidado = base({ year: 2026, month: 1 });
    const html = await render({ ano: '2026', mes: '1' });
    expect(html).toContain('janeiro de 2026');
    expect(html).toContain('ano=2025&amp;mes=12');
  });
});
