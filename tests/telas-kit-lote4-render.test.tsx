import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/produtos',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ProductsClient } from '@/components/products/products-client';
import { EstoqueClient } from '@/components/stock/estoque-client';

/**
 * FASE 4 DO KIT — lote 4: Comandas, Desperdícios e Metas são páginas de
 * servidor (só trocaram cabeçalho, filtros e painéis); aqui se travam os dois
 * clientes com abas de ESTADO que ganharam o cabeçalho do kit.
 */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('Solicitação de Produtos no kit', () => {
  it('cabeçalho com Novo pedido / Meus pedidos / Fábrica-CD (ativa por estado) e lista em painel sólido', () => {
    const h = semSeparadores(renderToString(
      <ProductsClient
        isOps
        abas={{ novo: { ver: true, editar: true }, meus: { ver: true, editar: true }, ops: { ver: true, editar: true } } as never}
        myRequests={[{ id: 'r1', origin: 'CD', number: 7, status: 'NEW', createdByName: 'Gabriel', note: null, createdAt: '2026-10-01T10:00:00.000Z', items: [{ name: 'Arroz', category: 'Secos', measure: 'kg', qty: 2 }] }]}
        incoming={[]}
        novoPedido={<div data-testid="novo-pedido">pedido</div>}
        subtitulo="família"
      />,
    ));
    expect(h).toContain('<h1 class="sgo-phdr__title">Solicitação de Produtos</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-novo"/);
    expect(h).toContain('Meus pedidos (1)');
    expect(h).toContain('Fábrica/CD (0)');
    expect(h).toContain('data-testid="novo-pedido"');
  });
});

describe('Estoque no kit', () => {
  it('cabeçalho com Bipar / Estoque / Validade (ativa por estado) e o aviso de recebimento em .sgo-aviso', () => {
    const estoque = { hoje: '2026-10-05', linhas: [], pendencias: [], contagens: { total: 0, lotes: 0, vencidos: 0, criticos: 0, atencao: 0, proximos: 0 } };
    const h = semSeparadores(renderToString(
      <EstoqueClient podeLancar units={[{ id: 'u1', name: 'Centro' }]} unitId="u1" estoque={estoque as never} subtitulo="x"
        recebimentosPendentes={[{ requestId: 'r9', rotulo: 'PED-2026-000042', recebidoEm: '01/10/2026', itensPendentes: 3 }]} />,
    ));
    expect(h).toContain('<h1 class="sgo-phdr__title">Estoque</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-bipar"/);
    expect(h).toContain('Estoque (0)');
    expect(h).toContain('sgo-aviso sgo-aviso--atencao');
    expect(h).toContain('PED-2026-000042');
  });
});
