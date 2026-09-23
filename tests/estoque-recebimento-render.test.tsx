import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/produtos/pedido/x',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { EstoqueDoRecebimentoClient, type ItemParaEstoqueUI } from '@/components/stock/estoque-do-recebimento-client';

/**
 * O painel "Lançar no estoque" no pedido recebido (etapa 2).
 *
 * O que a tela PROMETE: a quantidade vem sugerida quando a embalagem bate e
 * vazia quando não bate (com o recebido escrito ao lado), a validade é cobrada
 * quando o produto controla, e o que já foi lançado não oferece o botão.
 */

const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

function item(over: Partial<ItemParaEstoqueUI> = {}): ItemParaEstoqueUI {
  return {
    itemId: 'i1', productId: 'p1', nome: 'Coca-Cola 2L', recebido: '3 fardos',
    tipoDoEstoque: 'FARDO', rotuloDoEstoque: 'fardos', unitsPerPack: 6,
    quantidadeSugerida: 3, exigeValidade: false, lancadoEm: null, bloqueio: null,
    ...over,
  };
}

const tela = (itens: ItemParaEstoqueUI[]) =>
  semSeparadores(renderToString(<EstoqueDoRecebimentoClient requestId="r1" unitId="u1" itens={itens} />));

describe('Lançar no estoque', () => {
  it('sugere a quantidade quando a embalagem pedida é a do estoque, e converte à vista', () => {
    const h = tela([item()]);
    expect(h).toContain('Lançar no estoque');
    expect(h).toContain('value="3"');
    expect(h).toContain('= 18 unidades');
    expect(h).toContain('Quantidade (fardos)');
  });

  it('sem sugestão, o campo vem vazio e diz em que embalagem informar', () => {
    const h = tela([item({ recebido: '12 un', quantidadeSugerida: null })]);
    expect(h).toContain('Recebido: 12 un — informe em fardos');
    expect(h).not.toContain('value="12"');
  });

  it('produto que controla validade pede a data e explica por quê', () => {
    const h = tela([item({ nome: 'Queijo', exigeValidade: true, tipoDoEstoque: 'UN', rotuloDoEstoque: 'unidades', unitsPerPack: 1, recebido: '8 un', quantidadeSugerida: 8 })]);
    expect(h).toContain('Validade do lote');
    expect(h).toContain('só entra com a data');
  });

  it('o que já foi lançado aparece marcado e sem botão; tudo lançado vira uma frase', () => {
    const h = tela([item({ lancadoEm: '23/09/2026' })]);
    expect(h).toContain('já estão no estoque da unidade');
    expect(h).toContain('1 já lançado(s)');
    expect(h).not.toContain('Quantidade (fardos)');
  });

  it('produto desativado é nomeado como bloqueado', () => {
    const h = tela([item({ nome: 'Antigo', bloqueio: 'PRODUTO_INATIVO' })]);
    expect(h).toContain('produto desativado');
    expect(h).toContain('Antigo');
  });

  it('sem itens não desenha nada', () => {
    expect(tela([])).toBe('');
  });
});
