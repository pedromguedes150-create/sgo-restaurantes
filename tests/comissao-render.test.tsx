import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/comissao',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ApuracaoClient } from '@/components/comissao/apuracao-client';
import { ConfigComissaoClient } from '@/components/comissao/config-comissao-client';
import { PayoutsCompetenciaClient } from '@/components/people/payouts-competencia-client';

/** COMISSÃO (v1.175.0) — o que as telas prometem antes de qualquer dado. */

describe('Apuração', () => {
  it('pede unidade, mês das vendas e a planilha; explica a regra com os percentuais configurados e quantas funções da cozinha estão marcadas', () => {
    const html = renderToString(React.createElement(ApuracaoClient, {
      unidades: [{ id: 'u1', name: 'Juatuba' }], meses: ['2026-09', '2026-08'], mesInicial: '2026-09',
      percentuais: { vendedor: 1, cozinha: 0.5 }, funcoesDaCozinha: 2,
    })).split('<!-- -->').join('');
    expect(html).toContain('data-testid="apuracao-comissao"');
    expect(html).toContain('Mês das vendas');
    expect(html).toContain('Produtividade por Vendedor — Analítico');
    expect(html).toContain('ganha <b>1%</b> da própria venda');
    expect(html).toContain('rende <b>0,5%</b>');
    expect(html).toContain('2 função(ões) marcada(s)');
    expect(html).toContain('Apuração em outubro/2026 · pagamento na competência novembro/2026');
    expect(html).toContain('Ler planilha e apurar');
    expect(html).toContain('FREELANCER, gerente e encarregado ficam fora');
  });

  it('fonte: quem não está no RH e gerentes/encarregados ficam em seções RECOLHIDAS, como os freelancers (v1.176.0)', () => {
    const src = readFileSync('src/components/comissao/apuracao-client.tsx', 'utf8');
    expect(src).toContain('Fora da comissão — não estão no RH desta unidade');
    expect(src).toContain('Fora da comissão — gerentes e encarregados');
    expect(src).toContain('{verNaoCad && <div className="overflow-x-auto">');
    expect(src).not.toContain('sem comissão até vincular');
  });

  it('sem função marcada, diz isso na regra', () => {
    const html = renderToString(React.createElement(ApuracaoClient, { unidades: [], meses: ['2026-09'], mesInicial: '2026-09', percentuais: { vendedor: 1, cozinha: 0.5 }, funcoesDaCozinha: 0 }));
    expect(html).toContain('nenhuma função marcada ainda');
  });
});

describe('Configuração', () => {
  it('mostra os percentuais e a lista de funções com a marca; Admin edita percentual, Coordenador só as funções', () => {
    const funcoes = [
      { jobTitle: 'Auxiliar de Cozinha', jobTitleKey: 'auxiliar de cozinha', colaboradores: 12, marcada: true },
      { jobTitle: 'Garçom', jobTitleKey: 'garcom', colaboradores: 30, marcada: false },
    ];
    const coord = renderToString(React.createElement(ConfigComissaoClient, { percentuais: { vendedor: 1, cozinha: 0.5 }, funcoes, podeEditarPct: false, podeEditarFuncoes: true })).split('<!-- -->').join('');
    expect(coord).toContain('data-testid="funcoes-cozinha"');
    expect(coord).toContain('Auxiliar de Cozinha');
    expect(coord).toContain('1 função(ões) · 12 pessoa(s) na rede');
    expect(coord).toContain('Só o Administrador altera.');
    expect(coord).not.toContain('Salvar percentuais');
    expect(coord).toContain('Salvar funções da cozinha');
    const adm = renderToString(React.createElement(ConfigComissaoClient, { percentuais: { vendedor: 1, cozinha: 0.5 }, funcoes, podeEditarPct: true, podeEditarFuncoes: true }));
    expect(adm).toContain('Salvar percentuais');
  });
});

describe('Competência', () => {
  it('o quadro de competência aceita o tipo COMMISSION e fala em Comissão', () => {
    const html = renderToString(React.createElement(PayoutsCompetenciaClient, {
      tipo: 'COMMISSION', competencia: '2026-11', meses: ['2026-11', '2026-10'], colaboradores: [], podeLancar: true, podeFecharExtra: false, isAdmin: true, basePath: '/modulos/comissao?aba=competencia',
      quadro: { competencia: '2026-11', grupos: [], totalGeral: 0, totalLancamentos: 0, fechada: false, fechadaPor: null, unidadesSemLancamento: [{ id: 'u1', name: 'Juatuba' }] },
    }));
    expect(html).toContain('Exportar Comissão XLSX');
    expect(html).toContain('Nenhum lançamento de comissão nesta competência.');
  });
});
