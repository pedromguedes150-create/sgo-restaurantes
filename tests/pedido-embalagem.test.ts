import { describe, it, expect } from 'vitest';
import {
  ROTULO_CURTO, UNIDADES_DE_PEDIDO, rotuloDaQuantidade, unidadeValida,
} from '@/lib/products/embalagem-pedido';

/**
 * COMO O GERENTE PEDIU.
 *
 * O pedido é explícito no que este módulo NÃO pode fazer: não converter para
 * unidades e não consultar o cadastro para saber quantas vêm dentro do fardo.
 * O gerente registra "2 fardos"; quem separa lê "2 fardos" e separa 2 fardos.
 */

describe('O caso do pedido', () => {
  it('"Coca-Cola 350ml — 2 fardos"', () => {
    expect(rotuloDaQuantidade(2, 'FARDO')).toBe('2 fardos');
  });

  it('bala e chiclete por display', () => {
    expect(rotuloDaQuantidade(3, 'DISPLAY')).toBe('3 displays');
  });

  it('as quatro opções da tira, nesta ordem', () => {
    expect(UNIDADES_DE_PEDIDO).toEqual(['UN', 'FARDO', 'DISPLAY', 'CAIXA']);
    expect(Object.values(ROTULO_CURTO)).toEqual(['Unidade', 'Fardo', 'Display', 'Caixa']);
  });
});

describe('Singular e plural', () => {
  it('um fardo é "1 fardo"', () => {
    expect(rotuloDaQuantidade(1, 'FARDO')).toBe('1 fardo');
    expect(rotuloDaQuantidade(1, 'CAIXA')).toBe('1 caixa');
    expect(rotuloDaQuantidade(1, 'DISPLAY')).toBe('1 display');
  });

  it('fração usa o plural — "0,5 fardos", e não "0,5 fardo"', () => {
    expect(rotuloDaQuantidade(0.5, 'FARDO')).toBe('0,5 fardos');
  });

  it('zero também é plural', () => {
    expect(rotuloDaQuantidade(0, 'CAIXA')).toBe('0 caixas');
  });
});

describe('Unidade avulsa respeita a medida do produto', () => {
  it('usa a medida do cadastro quando é UN', () => {
    /* É o comportamento que já existia: "3 kg", "2 cx". */
    expect(rotuloDaQuantidade(3, 'UN', 'kg')).toBe('3 kg');
    expect(rotuloDaQuantidade(2, 'UN', 'cx')).toBe('2 cx');
  });

  it('sem medida cadastrada, cai em "un"', () => {
    expect(rotuloDaQuantidade(5, 'UN', null)).toBe('5 un');
    expect(rotuloDaQuantidade(5, 'UN', '  ')).toBe('5 un');
  });

  it('a medida do cadastro NÃO vale para fardo/display/caixa', () => {
    /* Se valesse, "2 fardos" apareceria como "2 kg" para quem separa — que é
       exatamente o engano que a tira de embalagem existe para evitar. */
    expect(rotuloDaQuantidade(2, 'FARDO', 'kg')).toBe('2 fardos');
  });
});

describe('Nada é convertido', () => {
  it('"2 fardos" continua 2, e não vira 24', () => {
    /* O pedido diz para NÃO calcular nem exigir quantas unidades vêm dentro.
       O rótulo só descreve o que foi pedido. */
    expect(rotuloDaQuantidade(2, 'FARDO')).not.toContain('24');
    expect(rotuloDaQuantidade(2, 'FARDO')).toBe('2 fardos');
  });

  it('a função não aceita nem recebe "quantas vêm dentro"', () => {
    /* Trava de desenho: três parâmetros, e nenhum deles é o fator. */
    expect(rotuloDaQuantidade.length).toBe(3);
  });
});

describe('Valor inválido cai em UN, e não quebra', () => {
  it('lixo vira UN', () => {
    expect(unidadeValida('')).toBe('UN');
    expect(unidadeValida(null)).toBe('UN');
    expect(unidadeValida('PALETE')).toBe('UN');
    expect(unidadeValida(42)).toBe('UN');
  });

  it('aceita minúsculo, porque o corpo da requisição não é confiável', () => {
    expect(unidadeValida('fardo')).toBe('FARDO');
    expect(unidadeValida('display')).toBe('DISPLAY');
  });

  it('quantidade não numérica não vira NaN na tela', () => {
    expect(rotuloDaQuantidade(Number('abc'), 'FARDO')).toBe('0 fardos');
  });
});
