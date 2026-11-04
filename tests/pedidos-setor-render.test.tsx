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
import { CdSectorsAdmin } from '@/components/products/cd-sectors-admin';
import type { PedidoDaTela } from '@/lib/pedidos/pedidos';

/** Pedidos por setor (v1.185.0 · v1.187.0): o que as telas dizem antes de qualquer clique. */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const pedido: PedidoDaTela = {
  id: 'p1', number: 12, unitId: 'u1', unitName: 'Beija Flor Centro', status: 'RECEBIDO', note: 'entregar até sexta', createdByName: 'Ana', sentAt: '2026-11-04T13:00:00Z', attendedAt: null,
  destinos: ['FABRICA', 'CD'],
  secoes: [
    { id: 's1', sectorId: 'a', sectorName: 'CÂMARAS FRIAS', destination: 'FABRICA', lines: ['2 requeijão moedense balcão', '10 mussarela fatiado'], status: 'RECEBIDO', receivedByName: 'Sep A', receivedAt: '2026-11-04T14:00:00Z', attendedByName: null, attendedAt: null },
    { id: 's2', sectorId: 'b', sectorName: 'BEBIDAS', destination: 'CD', lines: ['6 cx coca'], status: 'ENVIADO', receivedByName: null, receivedAt: null, attendedByName: null, attendedAt: null },
  ],
};

describe('Pedidos por setor', () => {
  it('novo pedido: SEM seletor de destino, setores agrupados pelo destino do cadastro, um campo por setor, e o botão ligado mesmo sem item', () => {
    const html = semSeparadores(renderToString(<NovoPedidoClient units={[{ id: 'u1', name: 'Beija Flor Centro' }]} setores={[{ id: 'a', name: 'Câmaras Frias', destination: 'FABRICA' }, { id: 'b', name: 'Bebidas', destination: 'CD' }, { id: 'c', name: 'Almoxarifado', destination: 'ALMOXARIFADO' }]} unitPadrao="u1" />));
    expect(html).toContain('data-testid="novo-pedido"');
    expect(html).not.toContain('aria-label="Destino"');
    expect(html).not.toContain('Centro de Distribuição (CD)');
    expect(html.indexOf('data-testid="grupo-FABRICA"')).toBeLessThan(html.indexOf('data-testid="grupo-CD"'));
    expect(html.indexOf('data-testid="grupo-CD"')).toBeLessThan(html.indexOf('data-testid="grupo-ALMOXARIFADO"'));
    expect(html).toContain('CÂMARAS FRIAS');
    expect(html).toContain('data-testid="texto-a"');
    expect(html).toContain('data-testid="texto-c"');
    expect(html).toContain('Uma linha por item');
    expect(html).toContain('Nenhum item escrito ainda — o pedido vai com a observação.');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="btn-enviar"/); // v1.187.0: nada obrigatório
    expect(html).not.toContain('aria-label="Unidade"'); // uma unidade só: sem seletor
  });
  it('caixa de entrada: cabeçalho com os destinos, blocos agrupados por destino com o crachá, quem recebeu, e os botões certos por situação', () => {
    const html = semSeparadores(renderToString(<RecebidosClient pedidos={[pedido]} podeMarcar />));
    expect(html).toContain('Pedido nº 12 · Beija Flor Centro → Fábrica · CD');
    expect(html).toContain('entregar até sexta');
    expect(html).toContain('2 requeijão moedense balcão');
    expect(html).toContain('Recebido por Sep A');
    expect((html.match(/data-testid="destino-do-bloco"/g) ?? []).length).toBe(2);
    expect(html.indexOf('data-testid="grupo-FABRICA"')).toBeLessThan(html.indexOf('data-testid="grupo-CD"'));
    expect(html).not.toContain('data-testid="receber-s1"'); // já recebido: só atender
    expect(html).toContain('data-testid="atender-s1"');
    expect(html).toContain('data-testid="receber-s2"');
    expect(html).toContain('data-testid="atender-s2"');
    const soLeitura = semSeparadores(renderToString(<RecebidosClient pedidos={[pedido]} podeMarcar={false} />));
    expect(soLeitura).not.toContain('data-testid="atender-s1"');
    expect(semSeparadores(renderToString(<RecebidosClient pedidos={[]} podeMarcar />))).toContain('Nenhum pedido nesta situação.');
  });
  it('as peças do pedido impresso; pedido só com observação diz isso', () => {
    const html = semSeparadores(renderToString(<><CabecalhoDoPedido pedido={pedido} /><BlocosDoPedido pedido={pedido} /></>));
    expect(html).toContain('data-testid="cabecalho-pedido"');
    expect((html.match(/data-testid="bloco-setor"/g) ?? []).length).toBe(2);
    expect(html).toContain('BEBIDAS');
    expect(html).toContain('6 cx coca');
    const vazio = semSeparadores(renderToString(<BlocosDoPedido pedido={{ ...pedido, destinos: [], secoes: [] }} />));
    expect(vazio).toContain('data-testid="sem-blocos"');
  });
  it('Setores do CD: cada linha mostra o destino e o novo setor nasce com o destino que o nome sugere', () => {
    const html = semSeparadores(renderToString(<CdSectorsAdmin setores={[
      { id: 'a', name: 'Câmaras Frias', active: true, destination: 'FABRICA', produtos: 0, separadores: 1, itensEmPedidos: 0 },
      { id: 'b', name: 'Bebidas', active: true, destination: 'CD', produtos: 3, separadores: 0, itensEmPedidos: 0 },
    ]} />));
    expect(html).toContain('aria-label="Destino de Câmaras Frias"');
    expect(html).toMatch(/aria-label="Destino de Câmaras Frias"[^>]*>[\s\S]*?Fábrica/);
    expect(html).toContain('aria-label="Destino do novo setor"');
    expect(html).toContain('Mudar o destino vale para os pedidos novos');
  });
});
