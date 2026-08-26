import { describe, it, expect } from 'vitest';
import { lerPlanilhaDeProdutos, normalizarCodigoDeBarras } from '@/lib/products/sheet';

/**
 * Leitura da planilha do catálogo.
 *
 * A matriz de "BEBIDAS" abaixo é o recorte fiel de um arquivo real da rede
 * (214 produtos). O importador anterior exigia uma coluna "Nome": diante dele
 * ignorava as 214 linhas e respondia "0 criados", sem dizer por quê.
 */

/** Recorte fiel de BEBIDAS.xlsx — cabeçalho com o nome da CATEGORIA na col. A. */
const BEBIDAS: string[][] = [
  ['BEBIDAS', 'QUANT', 'UN', 'COD. BARRAS'],
  ['CERVEJA BACKER MEDIEVAL 600 ML', '24', 'UN', '7898915633733'],
  ['CERVEJA BRAHMA 600ML', '24', 'UN', '7891149010400'],
  ['CERVEJA HEINEKEN 600ML', '24', 'UN', '78905498'],
  ['ENERGETICO MONSTER MONGO LOKO 473ML', '6', 'UN', '070847033301'],
  ['ENERGETICO CORUJAO 20ML', '1', 'UN', '0763331007734'],
];

describe('A planilha do fornecedor (formato real)', () => {
  const r = lerPlanilhaDeProdutos(BEBIDAS);

  it('lê todos os produtos, sem ignorar nenhum', () => {
    expect(r.itens).toHaveLength(5);
    expect(r.ignoradas).toBe(0);
  });

  it('o cabeçalho da primeira coluna vira a CATEGORIA', () => {
    /* "BEBIDAS" não é um rótulo de coluna — é como o fornecedor organiza a
       lista. Ignorar isso obrigaria a digitar a categoria 214 vezes. */
    expect(r.categoriaDoCabecalho).toBe('BEBIDAS');
    expect(r.itens.every((i) => i.category === 'BEBIDAS')).toBe(true);
  });

  it('QUANT vira quantidade por embalagem', () => {
    expect(r.itens[0].packSize).toBe(24);
    expect(r.itens.at(-1)!.packSize).toBe(1);
  });

  it('o código de barras PRESERVA os zeros à esquerda', () => {
    /* Como número, "070847033301" viraria 70847033301 e deixaria de ser o
       código do produto. */
    expect(r.itens[3].barcode).toBe('070847033301');
    expect(r.itens[4].barcode).toBe('0763331007734');
  });

  it('UN vira a medida, em minúsculas', () => {
    expect(r.itens.every((i) => i.measure === 'un')).toBe(true);
  });

  it('sem coluna de origem, quem importa decide', () => {
    /* A lista do fornecedor não fala de Fábrica ou CD. Adivinhar em silêncio
       jogaria o catálogo inteiro para o lado errado. */
    expect(r.temColunaOrigem).toBe(false);
    expect(r.itens.every((i) => i.origin === null)).toBe(true);
  });

  it('a linha da planilha é guardada (para explicar o que foi ignorado)', () => {
    expect(r.itens[0].linha).toBe(2);
  });
});

describe('O formato que o sistema já pedia continua valendo', () => {
  it('colunas nomeadas têm prioridade sobre a posição', () => {
    const r = lerPlanilhaDeProdutos([
      ['Categoria', 'Origem', 'Nome', 'Medida'],
      ['Limpeza', 'CD', 'DETERGENTE 5L', 'un'],
    ]);
    expect(r.itens[0].name).toBe('DETERGENTE 5L');
    expect(r.itens[0].category).toBe('Limpeza');
    expect(r.itens[0].origin).toBe('CD');
    expect(r.categoriaDoCabecalho).toBeNull();
  });

  it('"Centro de Distribuição" também é CD', () => {
    const r = lerPlanilhaDeProdutos([['Nome', 'Origem'], ['X', 'Centro de Distribuição']]);
    expect(r.itens[0].origin).toBe('CD');
  });

  it('origem desconhecida cai em Fábrica, não em nulo', () => {
    const r = lerPlanilhaDeProdutos([['Nome', 'Origem'], ['X', 'Matriz']]);
    expect(r.itens[0].origin).toBe('FABRICA');
  });
});

describe('Casos que quebram planilha de verdade', () => {
  it('planilha vazia não é erro nem invenção', () => {
    const r = lerPlanilhaDeProdutos([]);
    expect(r.itens).toEqual([]);
    expect(r.categoriaDoCabecalho).toBeNull();
  });

  it('linha em branco no meio não conta como ignorada', () => {
    const r = lerPlanilhaDeProdutos([['BEBIDAS', 'QUANT'], ['COCA 2L', '6'], ['', ''], ['FANTA 2L', '6']]);
    expect(r.itens).toHaveLength(2);
    expect(r.ignoradas).toBe(0);
  });

  it('linha com dados mas SEM nome é contada como ignorada', () => {
    /* Contar é o que permite a tela dizer "3 linhas sem nome" em vez de
       simplesmente perder produtos em silêncio. */
    const r = lerPlanilhaDeProdutos([['BEBIDAS', 'QUANT'], ['', '24'], ['COCA 2L', '6']]);
    expect(r.itens).toHaveLength(1);
    expect(r.ignoradas).toBe(1);
  });

  it('cabeçalho repetido no meio não vira produto', () => {
    /* Acontece quando alguém junta duas listas num arquivo só. */
    const r = lerPlanilhaDeProdutos([['BEBIDAS', 'QUANT'], ['COCA 2L', '6'], ['Nome', 'Quant'], ['FANTA 2L', '6']]);
    expect(r.itens.map((i) => i.name)).toEqual(['COCA 2L', 'FANTA 2L']);
  });

  it('planilha SEM cabeçalho não perde o primeiro produto', () => {
    /* Se a primeira linha não traz nenhum rótulo conhecido, ela é dado — e
       tratá-la como cabeçalho comeria um produto e inventaria uma categoria. */
    const r = lerPlanilhaDeProdutos([['COCA 2L', '6'], ['FANTA 2L', '6']]);
    expect(r.itens.map((i) => i.name)).toEqual(['COCA 2L', 'FANTA 2L']);
    expect(r.categoriaDoCabecalho).toBeNull();
    expect(r.itens[0].category).toBe('Geral');
  });

  it('QUANT com texto ("cx 24") ainda dá 24', () => {
    const r = lerPlanilhaDeProdutos([['BEBIDAS', 'QUANT'], ['COCA 2L', 'cx 24']]);
    expect(r.itens[0].packSize).toBe(24);
  });

  it('QUANT zero ou vazio não inventa embalagem', () => {
    const r = lerPlanilhaDeProdutos([['BEBIDAS', 'QUANT'], ['A', '0'], ['B', '']]);
    expect(r.itens[0].packSize).toBeNull();
    expect(r.itens[1].packSize).toBeNull();
  });

  it('espaço em volta do nome não cria produto diferente', () => {
    const r = lerPlanilhaDeProdutos([['BEBIDAS', 'QUANT'], ['  COCA 2L  ', '6']]);
    expect(r.itens[0].name).toBe('COCA 2L');
  });

  it('coluna única sem rótulo é tratada como DADO, não como cabeçalho', () => {
    /* Com uma coluna só e nenhum rótulo conhecido, não há como saber se a
       primeira linha é categoria ou produto. Tratar como dado importa um
       produto a mais — visível e apagável — em vez de descartar um produto de
       verdade em silêncio, que é o erro que não se percebe. */
    const r = lerPlanilhaDeProdutos([['BEBIDAS'], ['COCA 2L']]);
    expect(r.itens.map((i) => i.name)).toEqual(['BEBIDAS', 'COCA 2L']);
    expect(r.categoriaDoCabecalho).toBeNull();
  });
});

describe('normalizarCodigoDeBarras', () => {
  it('tira o que não é dígito e mantém os zeros', () => {
    expect(normalizarCodigoDeBarras(' 070 847 033301 ')).toBe('070847033301');
    expect(normalizarCodigoDeBarras('7891149010400')).toBe('7891149010400');
  });

  it('vazio vira nulo, não string vazia', () => {
    /* String vazia no banco pareceria "tem código" e atrapalharia a busca. */
    expect(normalizarCodigoDeBarras('')).toBeNull();
    expect(normalizarCodigoDeBarras('   ')).toBeNull();
    expect(normalizarCodigoDeBarras(null)).toBeNull();
    expect(normalizarCodigoDeBarras('sem código')).toBeNull();
  });
});
