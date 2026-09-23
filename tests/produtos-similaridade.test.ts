import { describe, it, expect } from 'vitest';
import { possiveisDuplicados, tokensDeProduto } from '@/lib/products/similaridade';

/**
 * A detecção de duplicidade é o que impede o quarto cadastro do mesmo
 * refrigerante. Os exemplos são os do pedido: "COCA COLA 2L" já existe como
 * "Coca-Cola PET 2 L".
 */

const catalogo = [
  { id: '1', name: 'Coca-Cola PET 2 L' },
  { id: '2', name: 'Coca-Cola lata 350ml' },
  { id: '3', name: 'Açúcar Cristal KG' },
  { id: '4', name: 'Açúcar Refinado 1kg' },
  { id: '5', name: 'Arroz Tio João 5kg' },
  { id: '6', name: 'Água Mineral 500ml' },
];

describe('tokensDeProduto', () => {
  it('ignora hífen, caixa, acento e ruído; cola número à medida', () => {
    expect([...tokensDeProduto('Coca-Cola PET 2 L')].sort()).toEqual(['2l', 'coca', 'cola']);
    expect([...tokensDeProduto('COCA COLA 2L')].sort()).toEqual(['2l', 'coca', 'cola']);
    expect([...tokensDeProduto('Açúcar Cristal KG')].sort()).toEqual(['acucar', 'cristal', 'kg']);
  });
});

describe('possiveisDuplicados', () => {
  it('o exemplo do pedido: "COCA COLA 2L" acha "Coca-Cola PET 2 L" em primeiro', () => {
    const r = possiveisDuplicados(catalogo, 'COCA COLA 2L');
    expect(r[0].produto.id).toBe('1');
    expect(r[0].grau).toBe(1);
  });

  it('número diferente derruba a semelhança: a lata de 350ml não é a garrafa de 2L', () => {
    const r = possiveisDuplicados(catalogo, 'COCA COLA 2L');
    const lata = r.find((x) => x.produto.id === '2');
    /* "coca" e "cola" batem (2 de 3), mas 2l ≠ 350ml → 0,67 / 2 = 0,33 < 0,5: fora. */
    expect(lata).toBeUndefined();
  });

  it('ordem independe: "Tio João Arroz 5kg" acha o arroz', () => {
    expect(possiveisDuplicados(catalogo, 'tio joao arroz 5kg')[0]?.produto.id).toBe('5');
  });

  it('açúcar cristal e refinado são parecidos, mas o exato vem primeiro', () => {
    const r = possiveisDuplicados(catalogo, 'acucar cristal');
    expect(r[0].produto.id).toBe('3');
    expect(r.map((x) => x.produto.id)).toContain('4');
  });

  it('nada parecido devolve vazio, e nome vazio também', () => {
    expect(possiveisDuplicados(catalogo, 'Biscoito XYZ 400g')).toEqual([]);
    expect(possiveisDuplicados(catalogo, '   ')).toEqual([]);
  });
});
