import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pagamentos/consolidacao',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { Select, normalizarBusca } from '@/components/ui/ds/select';
import { ConsolidacaoPagamentosClient } from '@/components/payments/consolidacao-pagamentos-client';
import { porColaborador, porUnidade, resumir, type Consolidacao, type Lancamento } from '@/lib/payments/consolidacao-calculo';

describe('Select com busca (colaborador da Hora Extra)', () => {
  it('a busca ignora acento e caixa: "mar" acha Márcia e MARCOS', () => {
    const nomes = ['Márcia Lopes', 'MARCOS ANTÔNIO', 'Maria Aparecida', 'João'];
    expect(nomes.filter((n) => normalizarBusca(n).includes(normalizarBusca('mar')))).toEqual(['Márcia Lopes', 'MARCOS ANTÔNIO', 'Maria Aparecida']);
    expect(normalizarBusca('  JOÃO ')).toBe('joao');
  });

  it('aberto, mostra o campo de pesquisa acima da lista', () => {
    const html = renderToString(
      React.createElement(Select, {
        label: 'Colaborador', searchable: true, searchPlaceholder: 'Pesquisar colaborador…', defaultOpen: true,
        value: '', onValueChange: () => {}, options: [{ value: 'a', label: 'Marcos Antônio', hint: 'Garçom' }, { value: 'b', label: 'Maria Aparecida' }],
      }),
    );
    expect(html).toContain('type="search"');
    expect(html).toContain('Pesquisar colaborador…');
    expect(html).toContain('Marcos Antônio');
    expect(html).toContain('Garçom');
  });

  it('sem busca, o seletor segue como antes (sem campo)', () => {
    const html = renderToString(React.createElement(Select, { label: 'Tipo', defaultOpen: true, value: '', onValueChange: () => {}, options: [{ value: 'a', label: 'A' }] }));
    expect(html).not.toContain('type="search"');
  });
});

const l = (p: Partial<Lancamento> & { id: string }): Lancamento => ({
  data: '2026-09-28', unitId: 'mo', unidade: 'Moreira', tipo: 'OVERTIME', pessoaChave: 'C:joao', pessoa: 'João Silva',
  horas: 2, vt: 0, valor: 45, status: 'APPROVED', motivo: 'Evento', solicitadoPor: 'Gerente', dataSolicitacao: '2026-09-28', semVinculoRh: false, ...p,
});

describe('Tela da Consolidação de pagamentos', () => {
  const xs = [
    l({ id: '1' }),
    l({ id: '2', tipo: 'FREELANCER', unitId: 'km', unidade: 'KM13', pessoaChave: 'F:maria', pessoa: 'Maria Souza', horas: null, vt: 12, valor: 150 }),
    l({ id: '3', pessoa: 'Antigo', pessoaChave: 'N:antigo', semVinculoRh: true, valor: 30, status: 'REJECTED' }),
  ];
  const dados: Consolidacao = {
    periodo: { de: '2026-09-28', ate: '2026-10-04', rotulo: '28/09/2026 a 04/10/2026' },
    unidades: [{ id: 'km', name: 'KM13' }, { id: 'mo', name: 'Moreira' }],
    lancamentos: xs,
    pessoas: [],
    resumo: resumir(xs, 'TODOS'),
    porUnidade: porUnidade(xs, 'TODOS'),
    porColaborador: porColaborador(xs, 'TODOS'),
  };
  const html = renderToString(React.createElement(ConsolidacaoPagamentosClient, { dados, filtro: { periodo: 'semana', tipo: 'TODOS', status: 'TODOS' } }));

  it('filtros rápidos, exportações e o aviso de que exportar não paga', () => {
    for (const t of ['Hoje', 'Ontem', 'Esta semana', 'Semana passada', 'Este mês', 'Mês passado', 'Escolher período', 'Exportar Excel', 'Gerar PDF']) expect(html).toContain(t);
    expect(html).toContain('/api/payments/consolidacao/export?periodo=semana');
    expect(html).toContain('não</b> marca nada como pago');
  });

  it('cabeçalho da tabela na ordem pedida e cada unidade no seu bloco', () => {
    const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
    const pos = ['Data', 'Unidade', 'Tipo', 'Colaborador', 'Horas', 'V.T.', 'Valor', 'Status'].map((t) => thead.indexOf(`>${t}`));
    expect(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1]))).toBe(true);
    expect(html).toContain('KM13'.toUpperCase());
    expect(html).toContain('MOREIRA');
  });

  it('rejeitada aparece riscada e fora do total; HE antiga é marcada como nome digitado', () => {
    expect(html).toContain('1 rejeitada(s) fora dos totais');
    expect(html).toContain('line-through');
    expect(html).toContain('(nome digitado)');
  });
});
