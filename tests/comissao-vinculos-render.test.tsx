import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/comissao',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { SugestaoDoVinculo } from '@/components/comissao/apuracao-client';
import { VinculosClient } from '@/components/comissao/vinculos-client';
import type { LinhaDaApuracao } from '@/lib/comissao/calculo';

/** Vínculos da comissão (v1.178.0) — o que a tela promete. */

const linha: LinhaDaApuracao = {
  chave: 'VENDEDOR:1036 - JANAINA SOUZA', kind: 'NAO_CADASTRADO', codigo: '1036', nome: 'JANAINA SOUZA', vendas: 500, pct: 1, calculado: 0, ajuste: 0,
  motivoAjuste: null, valor: 0, collaboratorId: null, collaboratorName: null,
  sugestoes: [{ collaboratorId: 'j', name: 'Janaina Sousa Coelho', confianca: 98 }, { collaboratorId: 'x', name: 'Outra', confianca: 72 }],
};

describe('sugestão na prévia', () => {
  it('mostra a mais parecida com o percentual e os botões Confirmar e Ignorar', () => {
    const html = renderToString(React.createElement(SugestaoDoVinculo, { linha, ignoradas: [], onConfirmar: () => {}, onIgnorar: () => {} })).split('<!-- -->').join('');
    expect(html).toContain('Janaina Sousa Coelho');
    expect(html).toContain('98%');
    expect(html).toContain('Alta probabilidade');
    expect(html).toContain('Confirmar vínculo');
    expect(html).toContain('Ignorar');
  });
  it('ignorada a primeira, aparece a próxima; sem nenhuma, diz isso', () => {
    expect(renderToString(React.createElement(SugestaoDoVinculo, { linha, ignoradas: ['j'], onConfirmar: () => {}, onIgnorar: () => {} }))).toContain('Outra');
    expect(renderToString(React.createElement(SugestaoDoVinculo, { linha, ignoradas: ['j', 'x'], onConfirmar: () => {}, onIgnorar: () => {} }))).toContain('Nenhum nome parecido');
  });
});

describe('aba Vínculos', () => {
  it('tabela Nome no RH × Nome no Teknisa × Situação, Novo vínculo e aviso de vínculo quebrado', () => {
    const html = renderToString(React.createElement(VinculosClient, {
      podeEditar: true, unidades: [{ id: 'u', name: 'Nova União' }],
      vinculos: [
        { id: '1', unitId: 'u', unidade: 'Nova União', sellerCode: '1036', sellerName: 'JANAINA SOUZA', collaboratorName: 'Janaina Sousa Coelho', jobTitle: 'Operador de Caixa', situacao: 'VINCULADO', rotuloSituacao: 'Vinculado', createdByName: 'Pedro', createdAt: '2026-10-23T12:00:00Z' },
        { id: '2', unitId: 'u', unidade: 'Nova União', sellerCode: '1040', sellerName: 'PAULO', collaboratorName: 'Paulo Antigo', jobTitle: null, situacao: 'INATIVO', rotuloSituacao: 'Colaborador inativo no RH', createdByName: 'Pedro', createdAt: '2026-10-23T12:00:00Z' },
      ],
      ignorados: [{ id: 'd', unidade: 'Nova União', sellerCode: '1050', sellerName: 'ANA SOUZA', collaboratorName: 'Ana Paula Lima', createdByName: 'Pedro', createdAt: '2026-10-23T12:00:00Z' }],
    })).split('<!-- -->').join('');
    expect(html).toContain('Tabela de vínculos · 2');
    expect(html).toContain('Nome no RH');
    expect(html).toContain('1036 - JANAINA SOUZA');
    expect(html).toContain('Vinculado');
    expect(html).toContain('1 vínculo(s) apontam para quem saiu do RH ou da unidade');
    expect(html).toContain('Novo vínculo');
    expect(html).toContain('Sugestões ignoradas · 1');
    expect(html).toContain('Desfazer');
  });
  it('sem permissão, só consulta', () => {
    const html = renderToString(React.createElement(VinculosClient, { podeEditar: false, unidades: [], vinculos: [], ignorados: [] }));
    expect(html).not.toContain('Novo vínculo');
  });
});
