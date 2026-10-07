import { describe, it, expect } from 'vitest';
import {
  chaveDaPessoa, cpfFormatado, filtrarLancamentos, lerFiltro, ordenar, pessoasDoPeriodo, porColaborador, porUnidade, queryDoFiltro,
  resolverPeriodo, resumir, type Lancamento,
} from '@/lib/payments/consolidacao-calculo';

/**
 * CONSOLIDAÇÃO DE PAGAMENTOS — o núcleo puro que a tela, o PDF e o Excel
 * compartilham. 30/09/2026 é quarta-feira: a semana vai de 28/09 a 04/10.
 */

const HOJE = '2026-09-30';
const l = (p: Partial<Lancamento> & { id: string }): Lancamento => ({
  data: '2026-09-28', unitId: 'mo', unidade: 'Moreira', tipo: 'OVERTIME', pessoaChave: 'C:joao', pessoa: 'João Silva',
  horas: 2, vt: 0, valor: 45, status: 'APPROVED', motivo: null, solicitadoPor: 'Gerente', dataSolicitacao: '2026-09-28', semVinculoRh: false, pagarEm: null, pagoEm: null, cpf: null, pixKey: null,
  ...p,
});

describe('períodos rápidos (pela data do serviço)', () => {
  it('hoje, ontem, semanas segunda→domingo e meses', () => {
    const p = (periodo: Parameters<typeof resolverPeriodo>[0]['periodo']) => resolverPeriodo({ periodo }, HOJE);
    expect(p('hoje')).toMatchObject({ de: HOJE, ate: HOJE, rotulo: '30/09/2026' });
    expect(p('ontem')).toMatchObject({ de: '2026-09-29', ate: '2026-09-29' });
    expect(p('semana')).toMatchObject({ de: '2026-09-28', ate: '2026-10-04', rotulo: '28/09/2026 a 04/10/2026' });
    expect(p('semana-passada')).toMatchObject({ de: '2026-09-21', ate: '2026-09-27' });
    expect(p('mes')).toMatchObject({ de: '2026-09-01', ate: '2026-09-30' });
    expect(p('mes-passado')).toMatchObject({ de: '2026-08-01', ate: '2026-08-31' });
  });

  it('domingo ainda é da semana que começou na segunda', () => {
    expect(resolverPeriodo({ periodo: 'semana' }, '2026-10-04')).toMatchObject({ de: '2026-09-28', ate: '2026-10-04' });
  });

  it('período escolhido: 1 dia, invertido, ou incompleto', () => {
    expect(resolverPeriodo({ periodo: 'personalizado', de: '2026-09-01', ate: '2026-09-07' }, HOJE)).toMatchObject({ de: '2026-09-01', ate: '2026-09-07' });
    expect(resolverPeriodo({ periodo: 'personalizado', de: '2026-09-07', ate: '2026-09-01' }, HOJE)).toMatchObject({ de: '2026-09-01', ate: '2026-09-07' });
    expect(resolverPeriodo({ periodo: 'personalizado', de: '2026-09-05' }, HOJE)).toMatchObject({ de: '2026-09-05', ate: '2026-09-05' });
    expect(resolverPeriodo({ periodo: 'personalizado' }, HOJE)).toMatchObject({ de: '2026-09-28', ate: '2026-10-04' });
  });
});

describe('filtro na URL: a mesma leitura na tela, no PDF e no Excel', () => {
  it('ida e volta sem perder nada', () => {
    const f = { aba: 'financeiro' as const, periodo: 'personalizado' as const, de: '2026-09-01', ate: '2026-09-07', unitId: 'mo', tipo: 'OVERTIME' as const, status: 'APPROVED' as const, pessoa: 'C:joao' };
    expect(lerFiltro(new URLSearchParams(queryDoFiltro(f)))).toEqual(f);
  });
  it('a aba de recorrência vai e volta pela URL (Excel e PDF sabem qual relatório gerar)', () => {
    const f = lerFiltro(new URLSearchParams('aba=recorrencia&periodo=semana-passada'));
    expect(f.aba).toBe('recorrencia');
    expect(queryDoFiltro(f)).toBe('aba=recorrencia&periodo=semana-passada');
    expect(lerFiltro(new URLSearchParams('aba=outra')).aba).toBe('financeiro');
  });

  it('valor inválido cai no padrão, não em filtro vazio', () => {
    const f = lerFiltro(new URLSearchParams('periodo=xyz&tipo=MISC&status=ALGO&de=ontem'));
    expect(f).toMatchObject({ periodo: 'semana', tipo: 'TODOS', status: 'TODOS', de: undefined });
  });
});

describe('totais: rejeitado não soma, a menos que se peça por ele', () => {
  const xs = [
    l({ id: '1', tipo: 'OVERTIME', valor: 45, status: 'APPROVED' }),
    l({ id: '2', tipo: 'FREELANCER', pessoaChave: 'F:maria', pessoa: 'Maria', unitId: 'km', unidade: 'KM13', horas: null, vt: 12, valor: 150, status: 'APPROVED' }),
    l({ id: '3', tipo: 'FREELANCER', pessoaChave: 'F:carlos', pessoa: 'Carlos', vt: 0, valor: 180, status: 'PENDING' }),
    l({ id: '4', tipo: 'OVERTIME', valor: 99, status: 'REJECTED' }),
  ];

  it('Todos: soma os válidos, conta os pendentes e deixa o rejeitado de fora', () => {
    const r = resumir(xs, 'TODOS');
    expect(r).toMatchObject({ solicitacoes: 3, freelancers: 2, horasExtras: 1, vt: 12, valorFreelancer: 330, valorHoraExtra: 45, total: 375 });
    expect(r.fora).toEqual({ qtd: 1, valor: 99 });
    expect(r.pendentes).toEqual({ qtd: 1, valor: 180 });
  });

  it('solicitado, aprovado (a pagar) e pago separados — e a contagem por unidade', () => {
    const r = resumir(xs, 'TODOS');
    expect(r.porStatus).toEqual({ pendente: 180, aprovado: 195, pago: 0 });
    expect(r.porStatus.pendente + r.porStatus.aprovado + r.porStatus.pago).toBe(r.total);
    expect(porUnidade(xs, 'TODOS').map((u) => u.qtd)).toEqual([1, 2]); // KM13: 1 · Moreira: 2 (a rejeitada não conta)
  });

  it('pedir Rejeitado é pedir para somá-los', () => {
    const r = resumir(filtrarLancamentos(xs, { status: 'REJECTED' }), 'REJECTED');
    expect(r).toMatchObject({ solicitacoes: 1, total: 99 });
    expect(r.fora.qtd).toBe(0);
  });

  it('o V.T. está DENTRO do valor: o total não soma de novo', () => {
    const r = resumir([l({ id: 'a', tipo: 'FREELANCER', vt: 12, valor: 150 })], 'TODOS');
    expect(r.total).toBe(150);
    expect(r.vt).toBe(12);
  });

  it('cada unidade no seu bloco, em ordem alfabética, e o rejeitado listado sem somar', () => {
    const u = porUnidade(xs, 'TODOS');
    expect(u.map((x) => x.unidade)).toEqual(['KM13', 'Moreira']);
    const mo = u.find((x) => x.unitId === 'mo')!;
    expect(mo).toMatchObject({ freelancer: 180, horaExtra: 45, vt: 0, total: 225 });
    expect(mo.lancamentos.map((x) => x.id).sort()).toEqual(['1', '3', '4']);
  });
});

describe('cada lançamento continua rastreável', () => {
  it('por colaborador soma, mas guarda os lançamentos originais um a um', () => {
    const xs = [
      l({ id: 'a', data: '2026-09-02', tipo: 'OVERTIME', valor: 50 }),
      l({ id: 'b', data: '2026-09-04', tipo: 'OVERTIME', valor: 75 }),
      l({ id: 'c', data: '2026-09-06', tipo: 'FREELANCER', valor: 150, vt: 10 }),
    ];
    const [joao] = porColaborador(xs, 'TODOS');
    expect(joao).toMatchObject({ pessoa: 'João Silva', horaExtra: 125, freelancer: 150, vt: 10, total: 275 });
    expect(joao.lancamentos.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('por colaborador carrega CPF e chave PIX do cadastro (o primeiro lançamento que trouxer)', () => {
    /* Pedido do Financeiro (05/10/2026): a planilha precisa do CPF e da chave
       para pagar sem abrir cadastro a cadastro. A linha da pessoa pega o
       primeiro lançamento que os traz — são a mesma pessoa, o dado é um só. */
    const xs = [
      l({ id: 'a', tipo: 'FREELANCER', pessoaChave: 'F:ana', pessoa: 'Ana', cpf: null, pixKey: null }),
      l({ id: 'b', tipo: 'FREELANCER', pessoaChave: 'F:ana', pessoa: 'Ana', cpf: '09494305604', pixKey: 'ana@pix.com' }),
      l({ id: 'c', tipo: 'OVERTIME', cpf: '12345678901', pixKey: null }),
    ];
    const [ana, joao] = porColaborador(xs, 'TODOS');
    expect(ana).toMatchObject({ pessoa: 'Ana', cpf: '09494305604', pixKey: 'ana@pix.com' });
    expect(joao).toMatchObject({ pessoa: 'João Silva', cpf: '12345678901', pixKey: null });
    expect(cpfFormatado('09494305604')).toBe('094.943.056-04');
    expect(cpfFormatado(null)).toBe('');
    expect(cpfFormatado('123')).toBe('123'); // fora dos 11 dígitos sai como veio — nunca inventado
  });

  it('a chave da pessoa: cadastro do freelancer, colaborador do RH, ou nome digitado (antigo)', () => {
    expect(chaveDaPessoa({ tipo: 'FREELANCER', freelancerId: 'f1', nome: 'X' })).toBe('F:f1');
    expect(chaveDaPessoa({ tipo: 'OVERTIME', collaboratorId: 'c1', nome: 'X' })).toBe('C:c1');
    expect(chaveDaPessoa({ tipo: 'OVERTIME', nome: '  João  Sílva ' })).toBe(chaveDaPessoa({ tipo: 'OVERTIME', nome: 'joao silva' }));
  });

  it('o seletor de colaborador só oferece quem tem lançamento, com o tipo de apoio', () => {
    const op = pessoasDoPeriodo([l({ id: 'a' }), l({ id: 'b', tipo: 'FREELANCER' }), l({ id: 'c', pessoaChave: 'F:ana', pessoa: 'Ana', tipo: 'FREELANCER' })]);
    expect(op).toEqual([
      { value: 'F:ana', label: 'Ana', hint: 'Freelancer' },
      { value: 'C:joao', label: 'João Silva', hint: 'Hora Extra · Freelancer' },
    ]);
  });

  it('ordenação por data, unidade, colaborador, tipo e status — estável', () => {
    const xs = [
      l({ id: '1', data: '2026-09-29', unidade: 'Moreira', pessoa: 'Bruno', status: 'PAID' }),
      l({ id: '2', data: '2026-09-28', unidade: 'KM13', pessoa: 'Ana', status: 'PENDING', tipo: 'FREELANCER' }),
    ];
    expect(ordenar(xs, 'data', 'asc').map((x) => x.id)).toEqual(['2', '1']);
    expect(ordenar(xs, 'unidade', 'desc').map((x) => x.id)).toEqual(['1', '2']);
    expect(ordenar(xs, 'colaborador', 'asc').map((x) => x.id)).toEqual(['2', '1']);
    expect(ordenar(xs, 'tipo', 'asc').map((x) => x.id)).toEqual(['2', '1']);
    expect(ordenar(xs, 'status', 'asc').map((x) => x.id)).toEqual(['2', '1']);
    expect(ordenar([l({ id: 'x', valor: 10 }), l({ id: 'y', valor: 90 })], 'valor', 'desc').map((x) => x.id)).toEqual(['y', 'x']);
  });
});
