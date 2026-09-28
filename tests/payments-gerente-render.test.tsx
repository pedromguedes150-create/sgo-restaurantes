import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pagamentos',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { PaymentsClient, type PayReq } from '@/components/payments/payments-client';

/**
 * Navegação de Pagamentos (v1.130.0): o GERENTE vê Nova · Minhas solicitações ·
 * Solicitações da unidade; o SUPERVISOR segue com a tela de sempre.
 */
const units = [{ id: 'u1', name: 'Moreira' }];
const he: PayReq = {
  id: 'p1', type: 'OVERTIME', status: 'PENDING', amount: 110, unit: 'Moreira', unitId: 'u1', requestedBy: 'Ana', title: 'João',
  requestedAt: '2026-09-28T10:00:00Z', day: '2026-09-20',
  detail: {
    workDate: '2026-09-20', shift: null, workStartTime: '22:00', workEndTime: '02:00', hours: 4, transportValue: 10, coverageSector: null,
    hourlyRate: 25, collaboratorId: 'c1', collaboratorName: 'João', reason: 'Evento', beneficiary: null, description: null,
    pixKey: null, supplierName: null, miscTypeName: null, approvedBy: null, approvedAt: null, paidBy: null, paidAt: null, hasAttachment: false, attachmentPath: null,
  },
};

function render(props: Record<string, unknown> = {}) {
  return renderToString(
    React.createElement(PaymentsClient, {
      isFinanceView: false, units, freelancers: [], miscTypes: [], mine: [], toApprove: [], toPay: [], history: [], ...props,
    } as React.ComponentProps<typeof PaymentsClient>),
  );
}

describe('Pagamentos — navegação do gerente', () => {
  it('gerente: Nova, Minhas solicitações e Solicitações da unidade — sem Histórico nem Para Aprovar vazio', () => {
    const html = render({ isManagerView: true, unitRequests: [he] });
    expect(html).toContain('Nova');
    expect(html).toContain('Minhas solicitações');
    expect(html).toContain('Solicitações da unidade');
    expect(html).not.toContain('Histórico');
    expect(html).not.toContain('Para Aprovar');
  });

  it('gerente que é aprovador de algo pendente ganha a aba Para Aprovar', () => {
    const html = render({ isManagerView: true, toApprove: [he] });
    expect(html).toContain('Para Aprovar');
  });

  it('supervisor: a tela de sempre (Nova, Minhas, Para Aprovar, Histórico) e sem a aba da unidade', () => {
    const html = render();
    expect(html).toContain('Minhas');
    expect(html).toContain('Para Aprovar');
    expect(html).toContain('Histórico');
    expect(html).not.toContain('Solicitações da unidade');
    expect(html).not.toContain('Minhas solicitações');
  });

  it('a linha da hora extra mostra horário, horas e valor/hora', () => {
    const html = render({ isManagerView: true, toApprove: [he] }); // abre em Para Aprovar, onde a linha é renderizada
    expect(html).toContain('22:00–02:00');
    expect(html).toContain('4h');
    expect(html).toContain('/h');
  });
});
