import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pedidos',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { NovoPedidoClient } from '@/components/pedidos/novo-pedido-client';
import { RecebidosClient } from '@/components/pedidos/recebidos-client';
import { BlocosDoPedido, CabecalhoDoPedido } from '@/components/pedidos/bloco-do-pedido';
import type { PedidoDaTela } from '@/lib/pedidos/pedidos';

/** Pedidos por setor (v1.185.0): o que as telas dizem antes de qualquer clique. */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const pedido: PedidoDaTela = {
  id: 'p1', number: 12, unitId: 'u1', unitName: 'Beija Flor Centro', destino: 'CD', status: 'RECEBIDO', note: 'entregar até sexta', createdByName: 'Ana', sentAt: '2026-11-04T13:00:00Z', attendedAt: null,
  secoes: [
    { id: 's1', sectorId: 'a', sectorName: 'CÂMARAS FRIAS', lines: ['2 requeijão moedense balcão', '10 mussarela fatiado'], status: 'RECEBIDO', receivedByName: 'Sep A', receivedAt: '2026-11-04T14:00:00Z', attendedByName: null, attendedAt: null },
    { id: 's2', sectorId: 'b', sectorName: 'SALGADOS', lines: ['1 cx coxinha camarão'], status: 'ENVIADO', receivedByName: null, receivedAt: null, attendedByName: null, attendedAt: null },
  ],
};

describe('Pedidos por setor', () => {
  it('novo pedido: um campo por setor, destino, resumo e o botão desligado sem item', () => {
    const html = semSeparadores(renderToString(<NovoPedidoClient units={[{ id: 'u1', name: 'Beija Flor Centro' }]} setores={[{ id: 'a', name: 'Câmaras Frias' }, { id: 'b', name: 'Salgados' }]} unitPadrao="u1" />));
    expect(html).toContain('data-testid="novo-pedido"');
    expect(html).toContain('CÂMARAS FRIAS');
    expect(html).toContain('data-testid="texto-a"');
    expect(html).toContain('data-testid="texto-b"');
    expect(html).toContain('Uma linha por item');
    expect(html).toContain('Centro de Distribuição (CD)');
    expect(html).toContain('Escreva pelo menos um item em algum setor.');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="btn-enviar"/);
    expect(html).not.toContain('aria-label="Unidade"'); // uma unidade só: sem seletor
  });
  it('caixa de entrada: cabeçalho, blocos com as linhas numeradas, quem recebeu, e os botões certos por situação', () => {
    const html = semSeparadores(renderToString(<RecebidosClient pedidos={[pedido]} podeMarcar />));
    expect(html).toContain('Pedido nº 12 · Beija Flor Centro → CD');
    expect(html).toContain('entregar até sexta');
    expect(html).toContain('2 requeijão moedense balcão');
    expect(html).toContain('Recebido por Sep A');
    expect(html).not.toContain('data-testid="receber-s1"'); // já recebido: só atender
    expect(html).toContain('data-testid="atender-s1"');
    expect(html).toContain('data-testid="receber-s2"');
    expect(html).toContain('data-testid="atender-s2"');
    const soLeitura = semSeparadores(renderToString(<RecebidosClient pedidos={[pedido]} podeMarcar={false} />));
    expect(soLeitura).not.toContain('data-testid="atender-s1"');
    expect(semSeparadores(renderToString(<RecebidosClient pedidos={[]} podeMarcar />))).toContain('Nenhum pedido nesta situação.');
  });
  it('as peças do pedido impresso', () => {
    const html = semSeparadores(renderToString(<><CabecalhoDoPedido pedido={pedido} /><BlocosDoPedido pedido={pedido} /></>));
    expect(html).toContain('data-testid="cabecalho-pedido"');
    expect((html.match(/data-testid="bloco-setor"/g) ?? []).length).toBe(2);
    expect(html).toContain('SALGADOS');
    expect(html).toContain('1 cx coxinha camarão');
  });
});
