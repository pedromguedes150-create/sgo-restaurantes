import { describe, it, expect } from 'vitest';
import { normalizar, soDigitos, buscarProdutos, produtoPorCodigo, type ProdutoBuscavel } from '@/lib/products/busca';
import { medianaParaTeste as mediana } from '@/lib/products/sugestoes';

/**
 * A BUSCA de produto e a conta da sugestão.
 *
 * O pedido é montado no celular, no meio do salão e com pressa. Exigir acento
 * certo e caixa certa faria o gerente desistir da busca e pedir pelo nome
 * errado — e aí o erro só aparece quando a caixa chega.
 */

const CATALOGO: ProdutoBuscavel[] = [
  { id: '1', name: 'Muçarela fatiada', category: 'Refrigerados', measure: 'caixa', barcode: '7891000100103' },
  { id: '2', name: 'Arroz Tipo 1 5kg', category: 'Secos', measure: 'fardo', barcode: '7896004400112', barcodes: ['0007896004400112'] },
  { id: '3', name: 'Arroz Parboilizado', category: 'Secos', measure: 'fardo' },
  { id: '4', name: 'Coca-Cola 2L', category: 'Bebidas', measure: 'fardo', barcode: '7894900011517' },
  { id: '5', name: 'Farinha de trigo', category: 'Secos', measure: 'fardo' },
];

describe('Normalizar o texto', () => {
  it('tira acento, caixa e espaço sobrando', () => {
    expect(normalizar('  Muçarela   FATIADA ')).toBe('mucarela fatiada');
    expect(normalizar('Refrigerados')).toBe('refrigerados');
  });

  it('aguenta vazio e nulo', () => {
    for (const x of ['', null, undefined]) expect(normalizar(x as string)).toBe('');
  });

  it('soDigitos limpa separador de código de barras', () => {
    expect(soDigitos('789 1000-100.103')).toBe('7891000100103');
  });
});

describe('Buscar por nome', () => {
  it('acha SEM acento o que está COM acento — é o caso do dia a dia', () => {
    const r = buscarProdutos(CATALOGO, 'mucarela');
    expect(r.map((p) => p.name)).toEqual(['Muçarela fatiada']);
  });

  it('ignora a caixa', () => {
    expect(buscarProdutos(CATALOGO, 'COCA').map((p) => p.id)).toEqual(['4']);
  });

  it('acha por PARTE do nome', () => {
    expect(buscarProdutos(CATALOGO, 'trigo').map((p) => p.id)).toEqual(['5']);
  });

  it('quem COMEÇA com o termo vem antes de quem só o contém', () => {
    /* Com 400 produtos, "arroz" traz dezenas — e o que o gerente quer é quase
       sempre o que começa com a palavra. */
    const doce: ProdutoBuscavel = { id: '9', name: 'Doce de arroz', category: 'Secos', measure: 'un' };
    const r = buscarProdutos([...CATALOGO, doce], 'arroz');
    expect(r[r.length - 1].id).toBe('9');
    expect(r.slice(0, 2).map((p) => p.id).sort()).toEqual(['2', '3']);
  });

  it('acha pela CATEGORIA, mas ela pesa menos que o nome', () => {
    const r = buscarProdutos(CATALOGO, 'secos');
    expect(r.map((p) => p.id).sort()).toEqual(['2', '3', '5']);
  });

  it('termo vazio não devolve o catálogo inteiro', () => {
    expect(buscarProdutos(CATALOGO, '')).toEqual([]);
    expect(buscarProdutos(CATALOGO, '   ')).toEqual([]);
  });
});

describe('Buscar por código de barras', () => {
  it('o código exato vem em primeiro lugar', () => {
    expect(buscarProdutos(CATALOGO, '7894900011517')[0].id).toBe('4');
  });

  it('acha pelo código ALTERNATIVO — o mesmo produto chega com código diferente', () => {
    expect(buscarProdutos(CATALOGO, '0007896004400112')[0].id).toBe('2');
  });

  it('pedaço de código NÃO casa — senão "789" traria meio catálogo', () => {
    expect(buscarProdutos(CATALOGO, '789').map((p) => p.id)).toEqual([]);
  });
});

describe('Ler o código pela câmera', () => {
  it('acha o produto do código lido, com ou sem separador', () => {
    expect(produtoPorCodigo(CATALOGO, '7891000100103')?.id).toBe('1');
    expect(produtoPorCodigo(CATALOGO, '789 1000-100103')?.id).toBe('1');
  });

  it('código desconhecido devolve null — é o que abre o fluxo manual', () => {
    expect(produtoPorCodigo(CATALOGO, '7895421544')).toBeNull();
  });

  it('código repetido em DOIS produtos também devolve null', () => {
    /* Erro de cadastro. Escolher um deles no escuro colocaria o item errado no
       pedido, e o gerente só descobriria quando a caixa chegasse. */
    const duplicado = [...CATALOGO, { id: '99', name: 'Clone', category: 'Geral', measure: 'un', barcode: '7894900011517' }];
    expect(produtoPorCodigo(duplicado, '7894900011517')).toBeNull();
  });
});

describe('A quantidade sugerida usa MEDIANA', () => {
  it('a mediana ignora o pedido atípico que a média engoliria', () => {
    /* 4, 4, 5 e um mutirão de 40: a média manda pedir 13; a mediana continua
       dizendo o que é rotina. */
    expect(mediana([4, 4, 5, 40])).toBe(4.5);
    const media = (4 + 4 + 5 + 40) / 4;
    expect(media).toBeGreaterThan(13);
  });

  it('casos simples', () => {
    expect(mediana([4, 5, 4])).toBe(4);
    expect(mediana([2, 4])).toBe(3);
    expect(mediana([7])).toBe(7);
    expect(mediana([])).toBe(0);
  });
});
