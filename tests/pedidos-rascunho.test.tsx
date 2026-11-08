import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pedidos',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { NovoPedidoClient } from '@/components/pedidos/novo-pedido-client';
import { chaveDoRascunhoDoPedido, horaDoRascunho, rascunhoVazio } from '@/lib/pedidos/rascunho';

/**
 * RASCUNHO DO PEDIDO (v1.194.0) — "deu 10h, o gerente sai para o checklist e
 * perde tudo o que digitou" (Pedro, 08/11). O texto por setor e a observação
 * ficam guardados no aparelho até o envio.
 */
describe('as regras do rascunho', () => {
  it('uma chave por unidade no pedido novo e por pedido na edição', () => {
    expect(chaveDoRascunhoDoPedido('u1')).toBe('pedido:novo:u1');
    expect(chaveDoRascunhoDoPedido('u1', null)).toBe('pedido:novo:u1');
    expect(chaveDoRascunhoDoPedido('u1', 'p9')).toBe('pedido:edicao:p9');
    expect(chaveDoRascunhoDoPedido('u1')).not.toBe(chaveDoRascunhoDoPedido('u2'));
  });
  it('rascunho sem nada escrito é vazio (espaços não contam); uma linha num setor ou uma observação já não é', () => {
    expect(rascunhoVazio({ textos: {}, observacao: '' })).toBe(true);
    expect(rascunhoVazio({ textos: { a: '   \n ' }, observacao: '  ' })).toBe(true);
    expect(rascunhoVazio({ textos: { a: '2 cxs alcatra' }, observacao: '' })).toBe(false);
    expect(rascunhoVazio({ textos: {}, observacao: 'entregar sexta' })).toBe(false);
  });
  it('a hora do rascunho sai em pt-BR, com dia e hora', () => {
    expect(horaDoRascunho(Date.UTC(2026, 10, 6, 13, 5))).toMatch(/06\/11,? \d{2}:\d{2}/);
  });
});

describe('a folha do pedido', () => {
  it('monta no servidor sem o aviso de rascunho (ele só nasce depois de ler o aparelho) e diz que o texto fica guardado', () => {
    const html = renderToString(React.createElement(NovoPedidoClient, { units: [{ id: 'u1', name: 'Beija Flor Centro' }], setores: [{ id: 'a', name: 'Bebidas', destination: 'CD' }], unitPadrao: 'u1' }));
    expect(html).not.toContain('data-testid="rascunho-recuperado"');
    expect(html).toContain('fica guardado neste aparelho até enviar');
  });
  it('o código grava a cada mudança, só depois de ter lido o guardado, e apaga ao enviar e ao descartar', () => {
    const src = readFileSync('src/components/pedidos/novo-pedido-client.tsx', 'utf8');
    expect(src).toContain("from '@/lib/rascunho-local'");
    expect(src).toMatch(/if \(!rascunhoPronto\) return;/); // senão o estado vazio inicial sobrescreveria o rascunho antes de ser lido
    expect(src).toMatch(/gravarRascunho<RascunhoDoPedido>\(chaveRascunho/);
    expect(src).toMatch(/if \(!res\.ok\) \{[^}]*\}\s*apagarRascunho\(chaveRascunho\);/); // apaga SÓ depois de o servidor aceitar
    expect(src).toContain('data-testid="descartar-rascunho"');
    expect(src).toMatch(/useState<Record<string, string>>\(edicao\?\.textos \?\? \{\}\)/); // estado inicial igual ao do servidor (hidratação)
  });
});
