import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/cancelamentos',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { CancellationsClient } from '@/components/cancellations/cancellations-client';

const units = [{ id: 'u1', name: 'Moreira' }];
const reasons = [{ id: 'r1', name: 'Erro de digitação' }, { id: 'r2', name: 'Cliente desistiu' }];
const pendente = { id: 'c1', unit: 'Moreira', coupon: '44821', operator: 'Maria', value: 87.5 };

function render(props: Record<string, unknown> = {}) {
  return renderToString(
    React.createElement(CancellationsClient, {
      isAdmin: false, units, reasons, pending: [pendente], ...props,
    } as React.ComponentProps<typeof CancellationsClient>),
  );
}

describe('Tela de Cancelamentos — registro com foto', () => {
  it('o gerente vê o botão de registrar', () => {
    const html = render();
    expect(html).toContain('Registrar cancelamento');
    expect(html).toContain('44821');
  });

  it('o gerente NÃO vê a importação do Teknisa (é do Admin)', () => {
    expect(render()).not.toContain('Importar Teknisa');
  });

  it('o Admin vê os dois', () => {
    const html = render({ isAdmin: true });
    expect(html).toContain('Registrar cancelamento');
    expect(html).toContain('Importar Teknisa');
  });

  it('sem pendências, a tela continua montando', () => {
    expect(render({ pending: [] })).toContain('Registrar cancelamento');
  });

  it('sem motivos cadastrados, não estoura', () => {
    /* Unidade nova, antes de o Admin cadastrar os motivos. */
    expect(render({ reasons: [] })).toBeTruthy();
  });
});

describe('A foto aparece onde o cancelamento aparece', () => {
  it('com foto: link para ver, e a hora do cancelamento', () => {
    const html = render({
      pending: [{ ...pendente, photo: 'uploads/u1/canc-1.jpg', canceledAt: '2026-08-25T15:10:00.000Z' }],
    });
    expect(html).toContain('Ver foto do cupom');
    expect(html).toContain('/uploads/u1/canc-1.jpg');
    expect(html).not.toContain('Sem foto do cupom');
  });

  it('sem foto: a tela DIZ que falta — é o que a conciliação vai cobrar', () => {
    /* Cancelamento que veio só do Teknisa e ninguém fotografou. Deixar em
       branco esconderia exatamente o caso que interessa. */
    const html = render({ pending: [pendente] });
    expect(html).toContain('Sem foto do cupom');
    expect(html).not.toContain('Ver foto do cupom');
  });
});
