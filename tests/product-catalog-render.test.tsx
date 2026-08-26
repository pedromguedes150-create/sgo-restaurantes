import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/configuracoes/produtos',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ProductCatalogAdmin } from '@/components/products/product-catalog-admin';

type Prod = React.ComponentProps<typeof ProductCatalogAdmin>['products'][number];

const bebida = (over: Partial<Prod> = {}): Prod => ({
  id: 'p1', name: 'CERVEJA BRAHMA 600ML', origin: 'CD', category: 'BEBIDAS',
  measure: 'un', packSize: 24, barcode: '7891149010400', active: true, ...over,
});

const render = (products: Prod[] = [bebida()]) =>
  renderToString(React.createElement(ProductCatalogAdmin, { products }));

describe('Catálogo de Produtos — a tela conta o que a planilha aceita', () => {
  it('a origem da planilha é uma escolha visível', () => {
    /* A lista do fornecedor não fala de Fábrica ou CD; escolher em silêncio
       jogaria o catálogo inteiro para o lado errado. */
    expect(render()).toContain('Origem da planilha');
  });

  it('a explicação cita o formato REAL do fornecedor', () => {
    const html = render();
    expect(html).toContain('QUANT');
    expect(html).toContain('COD. BARRAS');
    expect(html).toContain('BEBIDAS');
  });

  it('o produto mostra embalagem e código de barras', () => {
    const html = render();
    expect(html).toContain('cx com 24');
    expect(html).toContain('7891149010400');
  });

  it('produto sem embalagem nem código não mostra sobras', () => {
    const html = render([bebida({ packSize: null, barcode: null })]);
    expect(html).not.toContain('cx com');
    expect(html).toContain('BEBIDAS');
  });

  it('catálogo vazio continua montando', () => {
    expect(render([])).toContain('Origem da planilha');
  });

  it('o export é apresentado como modelo', () => {
    /* Exportar com o catálogo vazio devolve só o cabeçalho — a planilha para
       preencher. Se a tela não disser isso, ninguém descobre. */
    expect(render()).toContain('Exportar Excel (modelo)');
  });
});
