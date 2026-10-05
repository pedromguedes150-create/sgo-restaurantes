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
import { porColaborador, porUnidade, resumir, totaisDaRecorrencia, type Consolidacao, type Lancamento, type SemanaRecorrente } from '@/lib/payments/consolidacao-calculo';

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
  horas: 2, vt: 0, valor: 45, status: 'APPROVED', motivo: 'Evento', solicitadoPor: 'Gerente', dataSolicitacao: '2026-09-28', semVinculoRh: false, cpf: null, pixKey: null, ...p,
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
  const html = renderToString(React.createElement(ConsolidacaoPagamentosClient, {
    financeiro: dados, periodo: dados.periodo, unidades: dados.unidades, filtro: { periodo: 'semana', tipo: 'TODOS', status: 'TODOS' },
  }));

  it('filtros rápidos, exportações e o aviso de que exportar não paga', () => {
    for (const t of ['Hoje', 'Ontem', 'Esta semana', 'Semana passada', 'Este mês', 'Mês passado', 'Escolher período', 'Exportar Excel', 'Gerar PDF']) expect(html).toContain(t);
    expect(html).toContain('/api/payments/consolidacao/export?periodo=semana');
    expect(html).toContain('não</b> marca nada como pago');
  });

  it('cabeçalho da tabela na ordem pedida e cada unidade no seu bloco', () => {
    const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
    const pos = ['Data', 'Unidade', 'Tipo', 'Colaborador', 'Horas', 'Motivo', 'V.T.', 'Valor', 'Status'].map((t) => thead.indexOf(`>${t}`));
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

describe('Visão financeira: somas na própria tela', () => {
  const xs = [
    l({ id: 'a', valor: 80, status: 'APPROVED' }),
    l({ id: 'b', tipo: 'FREELANCER', pessoaChave: 'F:j', pessoa: 'João', horas: null, vt: 12, valor: 150, status: 'PAID' }),
    l({ id: 'c', valor: 40, status: 'PENDING' }),
  ];
  const r = resumir(xs, 'TODOS');
  const dados: Consolidacao = {
    periodo: { de: '2026-09-21', ate: '2026-09-27', rotulo: '21/09/2026 a 27/09/2026' },
    unidades: [{ id: 'mo', name: 'Moreira' }], lancamentos: xs, pessoas: [], resumo: r,
    porUnidade: porUnidade(xs, 'TODOS'), porColaborador: porColaborador(xs, 'TODOS'),
  };
  const html = renderToString(React.createElement(ConsolidacaoPagamentosClient, { financeiro: dados, periodo: dados.periodo, unidades: dados.unidades, filtro: { periodo: 'semana-passada', tipo: 'TODOS', status: 'TODOS' } }));

  it('as duas visões aparecem como abas', () => {
    expect(html).toContain('Visão financeira');
    expect(html).toContain('Recorrência de freelancers');
  });

  it('rodapé com os quatro totais e o total por situação quando o status é Todos', () => {
    for (const t of ['TOTAL FREELANCER', 'TOTAL HORA EXTRA', 'TOTAL VALE-TRANSPORTE', 'TOTAL GERAL']) expect(html).toContain(t);
    expect(html).toContain('Solicitado — pendente');
    expect(html).toContain('Aprovado — a pagar');
    expect(r.porStatus).toEqual({ pendente: 40, aprovado: 80, pago: 150 });
    expect(r.total).toBe(270);
  });
});

describe('Visão de recorrência: o total que era feito na calculadora', () => {
  /* O print do Pedro: seis recorrentes da semana de 21/09 no Jardim Teresópolis. */
  const semana = (nome: string, solicitacoes: number, valor: number, id = nome): SemanaRecorrente => ({
    chave: `${id}|2026-09-21`, freelancerId: id, nome, cpf: null, pixKey: null, unidades: ['Jardim Teresópolis'], semanaDe: '2026-09-21', semanaAte: '2026-09-27', solicitacoes, valor,
  });
  const linhas = [semana('Vinícius', 6, 675), semana('Felipe', 6, 660), semana('Junior', 5, 405), semana('César', 4, 545), semana('Harison', 4, 523.7), semana('Jociele', 4, 425)];

  it('soma 3.233,70 sozinho, com 6 freelancers e 29 solicitações', () => {
    expect(totaisDaRecorrencia(linhas)).toEqual({ freelancers: 6, semanas: 6, solicitacoes: 29, valor: 3233.7 });
  });

  it('a mesma pessoa em duas semanas é UM freelancer e duas linhas', () => {
    const t = totaisDaRecorrencia([semana('Vinícius', 6, 675), { ...semana('Vinícius', 3, 300), chave: 'Vinícius|2026-09-28', semanaDe: '2026-09-28', semanaAte: '2026-10-04' }]);
    expect(t).toMatchObject({ freelancers: 1, semanas: 2, solicitacoes: 9, valor: 975 });
  });

  it('a tabela mostra o total no rodapé e os botões de Excel/PDF da recorrência', () => {
    const rec = { periodo: { de: '2026-09-21', ate: '2026-09-27', rotulo: '21/09/2026 a 27/09/2026' }, limiteSemanal: 2, linhas, totais: totaisDaRecorrencia(linhas) };
    const html = renderToString(React.createElement(ConsolidacaoPagamentosClient, {
      recorrencia: rec, periodo: rec.periodo, unidades: [], filtro: { aba: 'recorrencia', periodo: 'semana-passada', tipo: 'TODOS', status: 'TODOS' },
    }));
    expect(html).toContain('<tfoot');
    expect(html).toContain('TOTAL · 6 freelancer(s)');
    expect(html).toContain('3.233,70');
    expect(html).toContain('/api/payments/consolidacao/export?aba=recorrencia');
    expect(html).toContain('Relatório de recorrência');
  });
});
