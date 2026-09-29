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
 * Central de Pagamentos (v1.133.0): o filtro "Tipo de pagamento" aparece em
 * cima das listas (não na aba Nova) e a aba Pagar obedece `podePagar`
 * + a matriz — sem perfil fixo no componente.
 */
const units = [{ id: 'u1', name: 'Moreira' }];
const detail = {
  workDate: '2026-09-20', shift: null, workStartTime: null, workEndTime: null, hours: null, transportValue: null, coverageSector: null,
  hourlyRate: null, collaboratorId: null, collaboratorName: null, reason: null, beneficiary: null, description: null,
  pixKey: null, supplierName: null, miscTypeName: null, approvedBy: null, approvedAt: null, paidBy: null, paidAt: null, hasAttachment: false, attachmentPath: null,
};
const fl: PayReq = { id: 'f1', type: 'FREELANCER', status: 'PENDING', amount: 102.3, unit: 'Moreira', unitId: 'u1', requestedBy: 'Grazieli', title: 'VALDIRENE QUINTINO', requestedAt: '2026-09-29T10:00:00Z', day: '2026-09-29', detail };
const he: PayReq = { id: 'h1', type: 'OVERTIME', status: 'PENDING', amount: 45, unit: 'Moreira', unitId: 'u1', requestedBy: 'Grazieli', title: 'JELBERT LUCAS', requestedAt: '2026-09-29T10:00:00Z', day: '2026-09-29', detail: { ...detail, hours: 3, hourlyRate: 15, workStartTime: '18:00', workEndTime: '21:00', collaboratorName: 'JELBERT LUCAS' } };
const abas = { nova: true, minhas: true, aprovar: true, pagar: true, historico: true, unidade: true } as unknown as React.ComponentProps<typeof PaymentsClient>['abas'];

function render(props: Record<string, unknown> = {}) {
  return renderToString(
    React.createElement(PaymentsClient, {
      podePagar: false, units, freelancers: [], miscTypes: [], mine: [], toApprove: [], toPay: [], history: [], abas, ...props,
    } as React.ComponentProps<typeof PaymentsClient>),
  );
}

describe('Central de Pagamentos — filtro de tipo e aba Pagar', () => {
  it('com pendências abre em Para Aprovar, com o filtro Todos · Freelancer · Hora Extra · Avulso e os dois tipos na lista', () => {
    const html = render({ toApprove: [fl, he] });
    expect(html).toContain('Tipo de pagamento');
    for (const r of ['Todos', 'Freelancer', 'Hora Extra', 'Avulso']) expect(html).toContain(r);
    expect(html).toContain('VALDIRENE QUINTINO');
    expect(html).toContain('JELBERT LUCAS');
    expect(html).toContain('3h'); // horas × valor/hora na linha da HE
  });

  it('a aba Pagar só existe para quem pode pagar (Coordenador/Financeiro/Admin) — o perfil não é comparado no componente', () => {
    const sem = render({ toPay: [fl] });
    expect(sem).not.toContain('>Pagar<');
    const com = render({ toPay: [fl], podePagar: true });
    expect(com).toContain('Pagar');
  });

  it('na aba Nova o filtro não aparece (não há lista para filtrar)', () => {
    const html = render(); // sem pendências → abre em Nova
    expect(html).not.toContain('Tipo de pagamento');
  });
});
