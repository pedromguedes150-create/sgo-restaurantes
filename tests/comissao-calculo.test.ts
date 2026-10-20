import { describe, it, expect } from 'vitest';
import {
  lerPlanilhaDeVendedores, separarCodigo, tipoDoVendedor, somarMeses, mesDeApuracao, competenciaDePagamento, mesDeVendaPadrao,
  dividirIgual, apurar, aplicarAjustes, rotuloDoMes, type VendedorLido,
} from '@/lib/comissao/calculo';

/**
 * COMISSÃO POR VENDEDOR (v1.175.0) — a conta pura, com o exemplo do Pedro:
 * GRUPO BEIJA FLOR (cozinha) 0,5% da venda do grupo; vendedor com nome 1% da
 * própria venda; FREELANCER fora; só funcionário cadastrado recebe; ajuste
 * com motivo; setembro apura em outubro e paga em novembro.
 */

const CAB = ['Unidade', 'Garçom', 'Código', 'Produto', 'Nv. de Produto Superior', 'Qtd.', 'Vr. Unit', 'Vr. Desc.', 'Vr. Rep.', 'Vr. Liq.', 'Vr. Acrésc.', 'Vr. Gorjeta', 'Tx. Entrega', 'Vr. Total'];
const U = '0003 - CHURRASCARIA BF JUATUBA | 001 - CHURRASCARIA';
const linha = (garcom: string, total: number, unidade = U) => [unidade, garcom, '9E+11', 'BUFFET', 'BUFFET/MARMITEX', 1, total, 0, 0, total, 0, 0, 0, total];

const PLANILHA = [
  ['Produtividade por Vendedor - Analítico'], [],
  CAB,
  linha('0001 - GRUPO BEIJA FLOR', 1000), linha('0001 - GRUPO BEIJA FLOR', 500.5),
  linha('1065 - MARIA MERCES', 300), linha('1065 - MARIA MERCES', 200.25),
  linha('1055 - THIAGO HEITOR', 100),
  linha('0004 - freelancer 04', 50), linha('0011 - FREELANCER 11', 25),
  linha('0106 - MARCELO TELES', 80),
  ['Total', '', '', '', '', '', '', '', '', '', '', '', '', 2255.75],
];

describe('a planilha', () => {
  it('soma a venda por garçom pelo NOME das colunas, ignora a linha Total e declara a unidade', () => {
    const r = lerPlanilhaDeVendedores(PLANILHA);
    expect(r.ok).toBe(true);
    expect(r.totalVendas).toBe(2255.75);
    expect(r.itens).toBe(8);
    expect(r.unidadeDeclarada).toBe(U);
    const porNome = Object.fromEntries(r.vendedores.map((v) => [v.bruto, v.vendas]));
    expect(porNome['0001 - GRUPO BEIJA FLOR']).toBe(1500.5);
    expect(porNome['1065 - MARIA MERCES']).toBe(500.25);
    expect(r.vendedores[0].bruto).toBe('0001 - GRUPO BEIJA FLOR'); // maior venda primeiro
    expect(r.vendedores.find((v) => v.bruto === '1065 - MARIA MERCES')).toMatchObject({ codigo: '1065', nome: 'MARIA MERCES', itens: 2 });
  });

  it('aceita número em texto pt-BR e cabeçalho com outra grafia', () => {
    const r = lerPlanilhaDeVendedores([['Vendedor', 'Valor Total'], ['1065 - MARIA MERCES', '1.234,56'], ['1065 - MARIA MERCES', 'abc']]);
    expect(r.ok).toBe(true);
    expect(r.vendedores[0].vendas).toBe(1234.56);
  });

  it('recusa planilha sem as colunas, vazia e com DUAS unidades', () => {
    expect(lerPlanilhaDeVendedores([['Produto', 'Qtd'], ['x', 1]]).ok).toBe(false);
    expect(lerPlanilhaDeVendedores([]).ok).toBe(false);
    const duas = lerPlanilhaDeVendedores([CAB, linha('1065 - MARIA MERCES', 10), linha('1065 - MARIA MERCES', 10, '0002 - CHURRASCARIA BF TERESOPOLIS | 001 - CHURRASCARIA')]);
    expect(duas.ok).toBe(false);
    expect(duas.erro).toContain('2 unidades');
    /* duas LOJAS da mesma unidade somam e avisam */
    const lojas = lerPlanilhaDeVendedores([CAB, linha('1065 - MARIA MERCES', 10), linha('1065 - MARIA MERCES', 10, '0003 - CHURRASCARIA BF JUATUBA | 002 - LANCHONETE')]);
    expect(lojas.ok).toBe(true);
    expect(lojas.avisos[0]).toContain('2 PDVs');
  });

  it('separa código e nome; classifica grupo, freelancer e vendedor', () => {
    expect(separarCodigo('1065 - MARIA MERCES')).toEqual({ codigo: '1065', nome: 'MARIA MERCES' });
    expect(separarCodigo('MARIA')).toEqual({ codigo: null, nome: 'MARIA' });
    expect(tipoDoVendedor('GRUPO BEIJA FLOR')).toBe('GRUPO');
    expect(tipoDoVendedor('Grupo Beija-Flor')).toBe('GRUPO');
    expect(tipoDoVendedor('freelancer 04')).toBe('FREELANCER');
    expect(tipoDoVendedor('FREELANCE DIARIO')).toBe('FREELANCER');
    expect(tipoDoVendedor('MARIA MERCES')).toBe('VENDEDOR');
  });
});

describe('meses', () => {
  it('setembro apura em outubro e paga em novembro; dezembro vira o ano', () => {
    expect(mesDeApuracao('2026-09')).toBe('2026-10');
    expect(competenciaDePagamento('2026-09')).toBe('2026-11');
    expect(competenciaDePagamento('2026-12')).toBe('2027-02');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(mesDeVendaPadrao('2026-10-20')).toBe('2026-09');
    expect(rotuloDoMes('2026-11')).toBe('novembro/2026');
  });
});

describe('a apuração', () => {
  const vendedores: VendedorLido[] = [
    { bruto: '0001 - GRUPO BEIJA FLOR', codigo: '0001', nome: 'GRUPO BEIJA FLOR', vendas: 1500.5, itens: 2 },
    { bruto: '1065 - MARIA MERCES', codigo: '1065', nome: 'MARIA MERCES', vendas: 500.25, itens: 2 },
    { bruto: '1055 - THIAGO HEITOR', codigo: '1055', nome: 'THIAGO HEITOR', vendas: 100, itens: 1 },
    { bruto: '0004 - freelancer 04', codigo: '0004', nome: 'freelancer 04', vendas: 50, itens: 1 },
    { bruto: '0106 - MARCELO TELES', codigo: '0106', nome: 'MARCELO TELES', vendas: 80, itens: 1 },
  ];
  const vinculos = new Map([['1065 - MARIA MERCES', { collaboratorId: 'c-maria', name: 'Maria Merces' }], ['1055 - THIAGO HEITOR', { collaboratorId: 'c-thiago', name: 'Thiago Heitor' }]]);
  const cozinha = [{ collaboratorId: 'c-ana', name: 'Ana' }, { collaboratorId: 'c-bia', name: 'Bia' }, { collaboratorId: 'c-caio', name: 'Caio' }];

  it('divide em centavos sem sobrar nem faltar', () => {
    expect(dividirIgual(7.5, 3)).toEqual([2.5, 2.5, 2.5]);
    expect(dividirIgual(10, 3)).toEqual([3.34, 3.33, 3.33]);
    expect(dividirIgual(0.02, 3)).toEqual([0.01, 0.01, 0]);
    expect(dividirIgual(10, 0)).toEqual([]);
  });

  it('vendedor vinculado 1% da própria venda; grupo 0,5% dividido pela cozinha; freelancer e não cadastrado ficam em zero', () => {
    const { linhas, totais } = apurar({ vendedores, pctVendedor: 1, pctCozinha: 0.5, vinculos, cozinha });
    const por = Object.fromEntries(linhas.map((l) => [l.chave, l]));
    expect(por['VENDEDOR:1065 - MARIA MERCES']).toMatchObject({ kind: 'VENDEDOR', calculado: 5, valor: 5, collaboratorId: 'c-maria' });
    expect(por['VENDEDOR:1055 - THIAGO HEITOR']).toMatchObject({ kind: 'VENDEDOR', calculado: 1, valor: 1 });
    expect(por['FREELANCER:0004 - freelancer 04']).toMatchObject({ kind: 'FREELANCER', valor: 0, pct: 0 });
    expect(por['VENDEDOR:0106 - MARCELO TELES']).toMatchObject({ kind: 'NAO_CADASTRADO', valor: 0, collaboratorId: null });
    expect(por['GRUPO:0001 - GRUPO BEIJA FLOR']).toMatchObject({ kind: 'GRUPO', vendas: 1500.5, calculado: 7.5, valor: 0 });
    /* 7,50 ÷ 3 = 2,50 cada */
    expect(linhas.filter((l) => l.kind === 'COZINHA').map((l) => l.valor)).toEqual([2.5, 2.5, 2.5]);
    expect(totais).toMatchObject({ vendedores: 2, cozinha: 3, freelancers: 1, naoCadastrados: 1, vendasGrupo: 1500.5, boloCozinha: 7.5, comissaoVendedores: 6, comissaoCozinha: 7.5, comissao: 13.5, vendasFreelancers: 50, vendasNaoCadastrados: 80 });
  });

  it('sem função marcada para a cozinha, o bolo fica sem destinatário (nenhuma linha COZINHA, total só dos vendedores)', () => {
    const { linhas, totais } = apurar({ vendedores, pctVendedor: 1, pctCozinha: 0.5, vinculos, cozinha: [] });
    expect(linhas.some((l) => l.kind === 'COZINHA')).toBe(false);
    expect(totais.boloCozinha).toBe(7.5);
    expect(totais.comissao).toBe(6);
  });

  it('ajuste: só em quem recebe, exige motivo, nunca fica negativo; o total acompanha', () => {
    const ap = apurar({ vendedores, pctVendedor: 1, pctCozinha: 0.5, vinculos, cozinha });
    const ok = aplicarAjustes(ap, { 'VENDEDOR:1065 - MARIA MERCES': { ajuste: 10, motivo: 'combinado com a Maria' }, 'COZINHA:c-ana': { ajuste: -5, motivo: 'desconto acordado' } });
    expect(ok.erros).toEqual([]);
    const maria = ok.apuracao.linhas.find((l) => l.chave === 'VENDEDOR:1065 - MARIA MERCES')!;
    expect(maria).toMatchObject({ calculado: 5, ajuste: 10, valor: 15, motivoAjuste: 'combinado com a Maria' });
    expect(ok.apuracao.linhas.find((l) => l.chave === 'COZINHA:c-ana')!.valor).toBe(0); // 2,50 − 5 → 0, nunca negativo
    expect(ok.apuracao.totais.comissao).toBe(15 + 1 + 0 + 2.5 + 2.5);

    const semMotivo = aplicarAjustes(ap, { 'VENDEDOR:1065 - MARIA MERCES': { ajuste: 10, motivo: ' ' } });
    expect(semMotivo.erros[0]).toContain('motivo');
    expect(semMotivo.apuracao.linhas.find((l) => l.chave === 'VENDEDOR:1065 - MARIA MERCES')!.valor).toBe(5);
    const emQuemNaoRecebe = aplicarAjustes(ap, { 'VENDEDOR:0106 - MARCELO TELES': { ajuste: 10, motivo: 'tentativa' } });
    expect(emQuemNaoRecebe.erros[0]).toContain('vinculado');
    /* ajuste zero é ignorado */
    expect(aplicarAjustes(ap, { 'VENDEDOR:1065 - MARIA MERCES': { ajuste: 0, motivo: '' } }).erros).toEqual([]);
  });
});
