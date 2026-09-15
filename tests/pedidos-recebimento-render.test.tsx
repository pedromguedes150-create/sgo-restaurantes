import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/produtos/pedido/p1',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { RecebimentoClient, type ItemParaConferir } from '@/components/products/recebimento-client';
import { EnvioClient } from '@/components/products/envio-client';

/**
 * As duas telas da última perna: o CD dando saída e a unidade conferindo.
 *
 * O que se mede aqui é sobretudo o DESENHO — a conferência começa em "tudo
 * certo" e o envio bloqueado explica por quê. Os dois pontos existem porque o
 * contrário (marcar trinta itens como OK; um botão que some) faz a conferência
 * deixar de acontecer.
 */

const ITENS: ItemParaConferir[] = [
  { id: 'i1', name: 'Coca-Cola 2L', measure: 'fardo', qtyRequested: 5, qtySeparated: 5, missingLabel: null },
  { id: 'i2', name: 'Suco de uva', measure: 'caixa', qtyRequested: 2, qtySeparated: 0, missingLabel: 'Sem estoque' },
];

const limpo = (n: React.ReactElement) => renderToString(n).split('<!-- -->').join('');

describe('A conferência do recebimento', () => {
  it('abre com UM botão, não com o formulário inteiro', () => {
    const html = limpo(React.createElement(RecebimentoClient, { requestId: 'p1', itens: ITENS }));
    expect(html).toContain('Conferir recebimento');
    /* Trinta linhas de formulário na abertura é o que faz ninguém conferir. */
    expect(html).not.toContain('Qualidade dos produtos');
  });
});

describe('A saída da carga', () => {
  it('com a separação pronta, oferece confirmar e avisa o que acontece depois', () => {
    const html = limpo(React.createElement(EnvioClient, { requestId: 'p1', pronto: true, faltam: 0 }));
    expect(html).toContain('Confirmar envio para a unidade');
    expect(html).toContain('não pode mais ser alterada');
  });

  it('faltando item, DIZ quantos faltam em vez de sumir com o botão', () => {
    /* O separador que terminou a parte dele precisa saber que está esperando
       outro setor — e não que o sistema quebrou. */
    const html = limpo(React.createElement(EnvioClient, { requestId: 'p1', pronto: false, faltam: 4 }));
    expect(html).toContain('faltam 4 itens');
    expect(html).not.toContain('Confirmar envio para a unidade');
  });

  it('um item que falta é dito no singular', () => {
    const html = limpo(React.createElement(EnvioClient, { requestId: 'p1', pronto: false, faltam: 1 }));
    expect(html).toContain('falta 1 item');
  });
});
