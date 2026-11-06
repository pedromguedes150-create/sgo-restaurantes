import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/tarefas/abc',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ChecklistRunner } from '@/components/tasks/checklist-runner';

/** FOTO OBRIGATÓRIA NO ITEM (v1.191.0): o que o gerente vê ANTES de qualquer toque. */
const ITENS = [
  { id: 'i1', section: null, text: 'Ligar as luzes', requiresPhoto: false, aiCheck: false },
  { id: 'i2', section: null, text: 'Vitrine montada', requiresPhoto: true, aiCheck: false },
  { id: 'i3', section: null, text: 'Conferir caixa', requiresPhoto: false, aiCheck: false },
];
const render = () => renderToString(React.createElement(ChecklistRunner, {
  instanceId: 'inst-1', requiresEvidence: false, done: false, lateStatus: false, items: ITENS, initialAnswers: {}, photos: [],
})).split('<!-- -->').join('');

describe('a tela do checklist com item que exige foto', () => {
  it('o item diz "foto obrigatória", o campo abre a câmera (uma foto por toque) e os itens SEGUINTES nascem travados', () => {
    const html = render();
    expect(html).toContain('(foto obrigatória)');
    expect(html).toContain('data-testid="tirar-foto-i2"');
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*capture="environment"[^>]*>/);
    expect(html).not.toMatch(/<input[^>]*type="file"[^>]*multiple/);
    expect(html).toContain('obrigatória, tirada agora pela câmera');
    expect(html).toContain('data-testid="travado-i3"');
    expect(html).toContain('Tire a foto do item anterior para continuar.');
    expect(html).not.toContain('data-testid="travado-i1"'); // antes do item com foto nada trava
    expect(html).not.toContain('data-testid="travado-i2"');
    expect(html).toMatch(/data-testid="item-i3"[^>]*data-travado="1"/);
    expect(html).not.toContain('data-testid="alerta-foto"'); // o alerta só nasce no toque
  });
});
