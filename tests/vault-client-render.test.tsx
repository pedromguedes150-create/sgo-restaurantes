import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { VaultClient, type VaultUI } from '@/components/cash/vault-client';

/**
 * Renderiza a tela de Troco.
 *
 * Existe por um defeito meu que foi para produção em 21/08/2026: eu usei a
 * variável `chegou` quatro linhas ANTES do `useState` que a declara. Const lida
 * antes da própria declaração estoura na hora, e a tela morria ao montar — toda
 * vez, para todo mundo. O TypeScript não pegou porque a leitura acontecia dentro
 * do callback de um `reduce`, e nenhum dos 265 testes montava uma tela de Troco.
 *
 * Este teste monta. Se alguém repetir o erro, ele para aqui.
 */

const denominacoes = [
  { key: '200', label: 'Nota R$ 200,00', value: 200, kind: 'NOTE' as const, isSmall: false, isBig: true, countsAsBigIndicator: true },
  { key: '100', label: 'Nota R$ 100,00', value: 100, kind: 'NOTE' as const, isSmall: false, isBig: true, countsAsBigIndicator: true },
  { key: '10', label: 'Nota R$ 10,00', value: 10, kind: 'NOTE' as const, isSmall: true, isBig: false, countsAsBigIndicator: false },
  { key: '0.50', label: 'Moeda R$ 0,50', value: 0.5, kind: 'COIN' as const, isSmall: true, isBig: false, countsAsBigIndicator: false },
  { key: 'outros', label: 'Outros (PIX/caixinha)', value: null, kind: 'OTHER' as const, isSmall: false, isBig: false, countsAsBigIndicator: false },
];

function cofre(extra: Partial<VaultUI> = {}): VaultUI {
  return {
    balances: { '200': 0, '100': 8000, '10': 30, '0.50': 90, outros: 0 },
    total: 8120,
    denominations: denominacoes,
    bigNotesTotal: 8000,
    bigNotesPct: 98,
    buckets: [{ id: 'b1', name: 'POTE ANGELICA', targetValue: 500, active: true }],
    recentMovements: [],
    changeRequests: [],
    openChangeCount: 0,
    monthWithdrawals: 0,
    lastCountAt: '2026-08-21T09:00:00.000Z',
    ...extra,
  } as VaultUI;
}

function render(vault: VaultUI) {
  return renderToString(
    React.createElement(VaultClient, {
      units: [{ id: 'u1', name: 'Moreira' }],
      selectedUnitId: 'u1',
      vault,
      alerts: null,
      openRequestsNetwork: [],
      canOperate: true,
      canManageBuckets: true,
      canResolve: true,
    } as React.ComponentProps<typeof VaultClient>),
  );
}

describe('Tela de Troco — monta sem estourar', () => {
  it('cofre sem pedido nenhum', () => {
    expect(render(cofre())).toContain('Cofre da unidade');
  });

  it('com pedido AGUARDANDO o escritório', () => {
    const html = render(cofre({
      changeRequests: [{
        id: 'r1', unitId: 'u1', amount: 100, note: 'para os potes', status: 'OPEN',
        requestedByName: 'Ger', createdAt: '2026-08-21T09:00:00.000Z',
        resolvedByName: null, resolvedNote: null, resolvedAt: null,
        need: { '0.50': 100 }, give: { '100': 100 }, needTotal: 100, giveTotal: 100, autoApply: true,
        sent: {}, sentTotal: 0, sentByName: null, sentAt: null, sentNote: null,
        received: {}, receivedTotal: 0, receivedByName: null, receivedAt: null, divergent: false,
      }],
      openChangeCount: 1,
    } as Partial<VaultUI>));
    expect(html).toContain('aguardando o escritório');
  });

  it('com troco A CAMINHO — o caso que quebrou em produção', () => {
    const html = render(cofre({
      changeRequests: [{
        id: 'r2', unitId: 'u1', amount: 100, note: '', status: 'SENT',
        requestedByName: 'Ger', createdAt: '2026-08-21T09:00:00.000Z',
        resolvedByName: null, resolvedNote: null, resolvedAt: null,
        need: { '0.50': 100 }, give: { '100': 100 }, needTotal: 100, giveTotal: 100, autoApply: true,
        sent: { '0.50': 100 }, sentTotal: 100, sentByName: 'Sup', sentAt: '2026-08-21T11:00:00.000Z', sentNote: 'malote das 14h',
        received: {}, receivedTotal: 0, receivedByName: null, receivedAt: null, divergent: false,
      }],
    } as Partial<VaultUI>));
    expect(html).toContain('Chegou troco do escritório');
  });

  it('com troco já RECEBIDO (não aparece na lista de abertos, mas a tela monta)', () => {
    const html = render(cofre({
      changeRequests: [{
        id: 'r3', unitId: 'u1', amount: 100, note: '', status: 'RECEIVED',
        requestedByName: 'Ger', createdAt: '2026-08-21T09:00:00.000Z',
        resolvedByName: null, resolvedNote: null, resolvedAt: null,
        need: { '0.50': 100 }, give: { '100': 100 }, needTotal: 100, giveTotal: 100, autoApply: true,
        sent: { '0.50': 100 }, sentTotal: 100, sentByName: 'Sup', sentAt: '2026-08-21T11:00:00.000Z', sentNote: null,
        received: { '0.50': 90 }, receivedTotal: 90, receivedByName: 'Ger', receivedAt: '2026-08-21T15:00:00.000Z', divergent: true,
      }],
    } as Partial<VaultUI>));
    expect(html).toContain('Cofre da unidade');
  });
});
