import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/notas',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { NotesClient } from '@/components/notes/notes-client';

/**
 * Renderiza a tela de Notas Recebidas.
 *
 * A lição de 21/08: eu tinha 265 testes de cálculo e banco, e nenhum montava uma
 * tela — foi assim que a tela de Troco foi para produção quebrada. Toda tela que
 * eu mexer passa a ter isto.
 */

const unidades = [{ id: 'u1', name: 'Moreira' }];
const fornecedores = [
  { id: 's1', name: 'Distribuidora Sul', cnpj: '12345678000199', isGas: false },
  { id: 's2', name: 'Gás Butano', cnpj: '98765432000155', isGas: true },
];

const nota = (over: Record<string, unknown> = {}) => ({
  id: 'n1', unit: 'Moreira', supplier: 'Distribuidora Sul', value: 3000, status: 'RECEIVED',
  number: '44821', problemNote: null, cnpj: '12345678000199',
  issueDate: '2026-08-01', dueDate: '2026-08-31', productType: 'Alimentos', observation: '',
  requestedAt: '2026-08-01T10:00:00.000Z', entryDate: null, dateEdited: false, dateEditedByName: null,
  supervisorLaunched: false, createdByName: 'Ger',
  ...over,
});

function render(props: Record<string, unknown> = {}) {
  return renderToString(
    React.createElement(NotesClient, {
      aba: 'lista',
      canManage: true,
      canEditDate: true,
      sinceDays: 60,
      units: unidades,
      suppliers: fornecedores,
      notes: [nota()],
      ...props,
    } as React.ComponentProps<typeof NotesClient>),
  );
}

describe('Tela de Notas Recebidas — monta sem estourar', () => {
  it('lista com uma nota', () => {
    expect(render()).toContain('Distribuidora Sul');
  });

  it('lista vazia', () => {
    expect(render({ notes: [] })).toBeTruthy();
  });

  it('sem permissão de gestão (gerente)', () => {
    expect(render({ canManage: false, canEditDate: false })).toBeTruthy();
  });

  it('aba de vencimentos', () => {
    expect(render({ aba: 'venc' })).toBeTruthy();
  });

  it('nota com vários boletos (mais de três)', () => {
    /* A tela recebe as parcelas para poder editá-las; nota parcelada não pode
       quebrar a lista de quem só está olhando. */
    const parcelada = nota({
      installments: [10, 20, 30, 40, 50].map((d, i) => ({ seq: i + 1, dueDate: `2026-09-${String(d).padStart(2, '0')}`, value: 600 })),
    });
    expect(render({ notes: [parcelada] })).toContain('Distribuidora Sul');
  });

  it('nota com problema', () => {
    expect(render({ notes: [nota({ status: 'PROBLEM', problemNote: 'veio faltando item' })] })).toBeTruthy();
  });
});
