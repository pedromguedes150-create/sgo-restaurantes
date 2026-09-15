import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/produtos',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { PedidoClient, type ProdutoNaTela, type SugestaoNaTela, type PedidoRecente } from '@/components/products/pedido-client';

/**
 * A TELA do gerente nos Pedidos Internos.
 *
 * O desenho antigo abria com a lista inteira de produtos e um `- 0 +` em cada
 * linha — no celular, no meio do salão, isso é rolagem infinita e toque errado.
 * A tela nova abre com UM botão, e o que se mede aqui é justamente isso: o que
 * aparece antes de o gerente pedir para ver.
 */

const PRODUTOS: ProdutoNaTela[] = [
  { id: '1', name: 'Muçarela fatiada', category: 'Refrigerados', measure: 'caixa', barcode: '7891000100103' },
  { id: '2', name: 'Arroz Tipo 1 5kg', category: 'Secos', measure: 'fardo', packSize: 6 },
];

const SUGESTOES: SugestaoNaTela[] = [
  { productId: '1', name: 'Muçarela fatiada', measure: 'caixa', qtySugerida: 4, ultimas: [4, 5, 4], vezes: 3 },
];

const RECENTES: PedidoRecente[] = [
  { id: 'p1', number: 1245, statusLabel: 'Separação em andamento', quando: '15/09/2026', itens: 20 },
];

const render = (over: Partial<React.ComponentProps<typeof PedidoClient>> = {}) =>
  renderToString(React.createElement(PedidoClient, {
    unitId: 'u1', unitName: 'Moreira',
    produtos: PRODUTOS, sugestoes: SUGESTOES, recentes: RECENTES,
    podeAssociarCodigo: true,
    ...over,
  })).split('<!-- -->').join('');

describe('A tela inicial', () => {
  it('abre com "Iniciar pedido", e NÃO com a lista de produtos', () => {
    const html = render();
    expect(html).toContain('Iniciar pedido');
    /* O nome do produto não pode estar na tela inicial: era o desenho antigo. */
    expect(html).not.toContain('Arroz Tipo 1 5kg');
  });

  it('mostra os últimos pedidos com número e situação', () => {
    const html = render();
    expect(html).toContain('1245');
    expect(html).toContain('Separação em andamento');
  });

  it('sem pedido nenhum, diz isso em vez de mostrar uma lista vazia', () => {
    expect(render({ recentes: [] })).toContain('Nenhum pedido ainda');
  });
});

describe('A sugestão pelo histórico', () => {
  it('mostra a quantidade e DE ONDE ela veio', () => {
    /* Sugestão sem origem é palpite, e ninguém confia num palpite para pedir
       quatro caixas de muçarela. */
    const html = render();
    expect(html).toContain('normalmente 4 caixa');
    expect(html).toContain('4 | 5 | 4');
  });

  it('deixa explícito que nada é enviado sozinho', () => {
    expect(render()).toContain('Nada é enviado sozinho');
  });

  it('sem histórico, o bloco de sugestão nem aparece', () => {
    const html = render({ sugestoes: [] });
    expect(html).not.toContain('Sugestão para o seu próximo pedido');
    /* Mas o botão de iniciar continua lá: dá para pedir sem sugestão nenhuma. */
    expect(html).toContain('Iniciar pedido');
  });
});

describe('O que a tela NÃO faz sozinha', () => {
  it('não abre o pedido já montado — o carrinho começa vazio', () => {
    const html = render();
    expect(html).not.toContain('Revisar pedido');
    expect(html).not.toContain('Enviar pedido ao CD');
  });
});
