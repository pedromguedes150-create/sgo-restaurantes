import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/comandas/conferencias/s1',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { SessaoClient } from '@/components/commands/sessao-client';

/**
 * v1.193.1 — a conta da sessão é sobre as JULGADAS: a baixada fica na grade (para
 * poder ser recuperada) mas não conta como esperada nem como faltante. O caso
 * real: "475 de 699, faltam 224" com 48 baixadas — o certo é 475 de 651, 176.
 */
const render = (over: Partial<React.ComponentProps<typeof SessaoClient>['sessao']> = {}) =>
  renderToString(React.createElement(SessaoClient, {
    podeEditar: true,
    sessao: {
      id: 's1', unitName: 'Moreira', tipo: 'Completa', metodo: 'Leitor + Manual', metodoId: 'MISTO', iniciadaEm: '06/11/2026, 10:30', responsavel: 'Taliana',
      escopo: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], conferidas: [1, 2, 4, 5], emUso: [], faltando: [], pct: 0,
      emApuracao: [7], baixadas: [3, 9],
      ...over,
    },
  })).split('<!-- -->').join('');

describe('a conta da conferência', () => {
  it('baixadas ficam na grade (riscadas) mas não entram em "X de Y" nem em "Faltam"', () => {
    const html = render();
    expect(html).toContain('4 de 8 conferidas — 50%'); // 10 − 2 baixadas = 8
    expect(html).toContain('Faltam: 4'); // 6, 7, 8, 10 — a 3 e a 9 não
    expect(html).toContain('(1 já em apuração)'); // a 7
    expect(html).toContain('data-situacao="baixada"');
    expect(html).toContain('data-situacao="apuracao"');
    expect(html).toContain('10 de 10 comandas nesta visão.'); // a grade mostra todas
  });

  it('baixada marcada passa a contar', () => {
    const html = render({ conferidas: [1, 2, 3, 4, 5] });
    expect(html).toContain('5 de 9 conferidas');
  });
});
