import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/separacao/p1',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { SeparacaoClient, type ItemNaSeparacao } from '@/components/products/separacao-client';

/**
 * A TELA DO SEPARADOR.
 *
 * O que se mede aqui é o que a pessoa vê de pé no corredor do CD: o que já foi
 * conferido tem de estar visível como conferido (senão ela reconfere), a falta
 * tem de dizer quanto faltou e por quê (senão a unidade recebe a menos sem
 * explicação), e o pedido já enviado não pode oferecer botão nenhum.
 */

const item = (over: Partial<ItemNaSeparacao> = {}): ItemNaSeparacao => ({
  id: 'i1', name: 'Coca-Cola 2L', category: 'Bebidas', measure: 'fardo',
  qtyRequested: 5, qtySeparated: null, missingLabel: null, separadoPor: null, faltando: 0,
  ...over,
});

const render = (itens: ItemNaSeparacao[], bloqueado = false) =>
  renderToString(React.createElement(SeparacaoClient, { itens, bloqueado })).split('<!-- -->').join('');

describe('O item ainda não separado', () => {
  it('mostra o que foi pedido e as duas saídas: confirmar ou informar falta', () => {
    const html = render([item()]);
    expect(html).toContain('Coca-Cola 2L');
    expect(html).toContain('5');
    expect(html).toContain('Confirmar separado');
    expect(html).toContain('Informar falta');
  });

  it('não oferece "Refazer" no que ninguém tocou', () => {
    expect(render([item()])).not.toContain('Refazer');
  });
});

describe('O item já separado', () => {
  it('aparece conferido, com quem conferiu — para ninguém reconferir', () => {
    const html = render([item({ qtySeparated: 5, separadoPor: 'Carlos' })]);
    expect(html).toContain('Separado');
    expect(html).toContain('Carlos');
    /* E sai do modo de lançamento: o botão de confirmar não fica mais na tela. */
    expect(html).not.toContain('Confirmar separado');
    expect(html).toContain('Refazer');
  });

  it('a falta diz quanto faltou E o motivo', () => {
    /* "Faltou" sozinho obriga a unidade a ligar para o CD perguntar por quê. */
    const html = render([item({ qtySeparated: 2, faltando: 3, missingLabel: 'Sem estoque', separadoPor: 'Carlos' })]);
    expect(html).toContain('3');
    expect(html).toContain('Sem estoque');
  });
});

describe('Pedido que já saiu do CD', () => {
  it('não oferece botão nenhum — virou registro', () => {
    const html = render([item({ qtySeparated: 5, separadoPor: 'Carlos' }), item({ id: 'i2', name: 'Suco de uva' })], true);
    expect(html).not.toContain('Confirmar separado');
    expect(html).not.toContain('Informar falta');
    expect(html).not.toContain('Refazer');
    /* Mas continua contando a história: o que saiu e o que não saiu. */
    expect(html).toContain('Separado');
    expect(html).toContain('Não separado');
  });
});
