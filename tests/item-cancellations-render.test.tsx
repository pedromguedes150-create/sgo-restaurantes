import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/cancelamentos/itens',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ItemCancellationsClient, type ItemRow } from '@/components/cancellations/item-cancellations-client';

const units = [{ id: 'u1', name: 'Moreira' }];
const reasons = [{ id: 'r1', name: 'Erro de lançamento do garçom' }];

const linha = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: 'i1', unit: 'Moreira', product: 'Coca-Cola lata', quantity: 1, value: 8,
  waiter: 'João', table: '12', reason: 'Erro de lançamento do garçom',
  delivered: false, photo: null, canceledAt: '2026-08-25T19:42:00.000Z',
  authorizedBy: 'Alan', note: null, ...over,
});

const render = (rows: ItemRow[] = [linha()]) =>
  renderToString(React.createElement(ItemCancellationsClient, { units, reasons, rows }));

describe('Tela de cancelamento de itens', () => {
  it('a tela diz para usar a TROCA quando for troca', () => {
    /* Se a troca resolve e mantém a venda, a tela tem de dizer isso antes de a
       pessoa cancelar por hábito. */
    const html = render();
    expect(html).toContain('troca');
    expect(html).toContain('Teknisa');
  });

  it('a pergunta que decide tudo está na tela', () => {
    expect(render()).toContain('já tinha saído da cozinha');
  });

  it('item cancelado antes de sair aparece como tal', () => {
    const html = render([linha()]);
    expect(html).toContain('Cancelado antes de sair da cozinha');
    expect(html).not.toContain('Produto já tinha saído');
  });

  it('item já entregue vem destacado, com a foto', () => {
    const html = render([linha({ delivered: true, photo: 'uploads/u1/i1.jpg', product: 'Picanha', value: 90 })]);
    expect(html).toContain('Produto já tinha saído da cozinha');
    expect(html).toContain('/uploads/u1/i1.jpg');
  });

  it('sem registros no mês, a tela continua montando', () => {
    expect(render([])).toContain('Nenhum cancelamento de item registrado');
  });

  it('sem motivos cadastrados, não estoura', () => {
    expect(renderToString(React.createElement(ItemCancellationsClient, { units, reasons: [], rows: [] }))).toBeTruthy();
  });
});
