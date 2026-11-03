import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { Select } from '@/components/ui/ds/select';

/**
 * v1.182.1 — a lista do Select deixou de ter a largura do botão e de viver
 * dentro de ancestrais com overflow (print do Pedro: "Em homologação" e a
 * dica saíam cortados no seletor de status, pior no celular).
 */
describe('Select — a lista cabe no conteúdo e não é cortada', () => {
  const src = readFileSync('src/components/ui/ds/select.tsx', 'utf8');

  it('no navegador a lista vai para um portal com posição fixa, largura mínima = botão, teto = 28rem ou a tela, texto quebrando', () => {
    expect(src).toContain("import { createPortal } from 'react-dom';");
    expect(src).toContain('montado ? createPortal(lista, document.body) : lista');
    expect(src).toContain('usePopoverFixo(open, rootRef, popRef, close');
    expect(src).toContain("from './popover-fixo'");
    expect(src).toContain('whitespace-normal break-words');
    /* o clique dentro da lista (fora do rootRef, agora) não pode fechar; rolar reposiciona */
    expect(src).toContain('popRef.current?.contains(alvo)');
  });

  it('no servidor (sem portal) a lista sai inline como sempre — o que os testes de render e o primeiro desenho veem', () => {
    const html = renderToString(React.createElement(Select, {
      'aria-label': 'Status', defaultOpen: true, value: 'MONITORAMENTO', onValueChange: () => {},
      options: [{ value: 'HOMOLOGACAO', label: 'Em homologação', hint: 'Medido e mostrado "em observação", com a nota que a unidade teria se contasse — não entra na bonificação.' }],
    }));
    expect(html).toContain('role="listbox"');
    expect(html).toContain('Em homologação');
    expect(html).toContain('não entra na bonificação');
    expect(html).toContain('absolute left-0 top-full');
    expect(html).toContain('whitespace-normal break-words');
  });
});
