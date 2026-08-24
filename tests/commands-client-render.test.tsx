import { describe, it, expect, vi } from 'vitest';

/* O componente usa useRouter, que só existe dentro do Next. Fora dele, um
   substituto basta: o que interessa aqui é a MONTAGEM, não a navegação. */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));
import { renderToString } from 'react-dom/server';
import React from 'react';
import { CommandsClient } from '@/components/commands/commands-client';

/**
 * Renderiza a tela de Comandas com as props que a Moreira produz hoje.
 *
 * Existe porque a tela quebrou em produção com "Application error: a client-side
 * exception" e eu não conseguia reproduzir sem sessão. Renderizar o componente
 * fora do navegador pega exatamente esse tipo de erro — o que estoura na
 * montagem — sem precisar entrar no sistema.
 */

/** Moreira: 699 ativas (2–700), 48 baixadas, 3 em apuração, faixa de madrugada. */
const ativas = Array.from({ length: 699 }, (_, i) => i + 2);
const baixadas = [7, 14, 47, 49, 53, 56, 57, 60, 65, 80, 81, 88];
const divergencias = [37, 82, 84].map((n) => ({
  id: `d${n}`, number: n, status: 'INVESTIGATING' as const, observation: 'Extraviadas', reporter: 'Ger',
}));

function render(props: Partial<React.ComponentProps<typeof CommandsClient>>) {
  return renderToString(
    React.createElement(CommandsClient, {
      unitId: 'u1',
      canResolve: true,
      isAdmin: true,
      hasConfig: true,
      todayDone: true,
      activeNumbers: ativas,
      lostNumbers: baixadas,
      openDivergences: divergencias,
      ...props,
    } as React.ComponentProps<typeof CommandsClient>),
  );
}

describe('Tela de Comandas — monta sem estourar', () => {
  it('com faixa de madrugada e contagem completa antiga', () => {
    const html = render({
      temFaixaMadrugada: true,
      ultimaCompleta: { date: '2026-08-10', days: 11, overdue: true, never: false },
      ultimaContagem: { data: '2026-08-21', deHoje: true, conferidas: ativas.slice(0, 299), emUso: [] },
    });
    expect(html).toContain('Conferência em grade');
  });

  it('com faixa de madrugada e NENHUMA contagem completa', () => {
    const html = render({
      temFaixaMadrugada: true,
      ultimaCompleta: { date: null, days: null, overdue: true, never: true },
      ultimaContagem: null,
    });
    expect(html).toContain('Nunca houve');
  });

  it('sem faixa de madrugada (a maioria das unidades)', () => {
    const html = render({ temFaixaMadrugada: false, ultimaCompleta: undefined, ultimaContagem: null });
    expect(html).toContain('Conferência em grade');
  });

  it('com o bloco de limpeza em lote (muitas divergências abertas)', () => {
    const muitas = Array.from({ length: 416 }, (_, i) => ({
      id: `x${i}`, number: i + 2, status: 'OPEN' as const, observation: null, reporter: null,
    }));
    const html = render({
      openDivergences: muitas,
      abertasPorDia: [{ date: '2026-08-20', count: 413 }, { date: '2026-08-15', count: 3 }],
      temFaixaMadrugada: true,
      ultimaCompleta: { date: '2026-08-10', days: 11, overdue: true, never: false },
    });
    expect(html).toContain('20/08/2026');
  });

  it('sem sequência configurada', () => {
    const html = render({ hasConfig: false });
    expect(html).toContain('ainda não configurada');
  });
});

describe('Faixa do dia na grade', () => {
  /* Moreira: usa 2–300 no meio da semana; o resto fica guardado. */
  const doDia = Array.from({ length: 299 }, (_, i) => i + 2);

  it('abre na faixa do dia e não mostra as guardadas', () => {
    const html = render({ nightlyNumbers: doDia, temFaixaMadrugada: true });
    expect(html).toContain('Faixa do dia');
    // 301 está guardada — não pode aparecer como botão da grade
    expect(html).not.toContain('>301<');
    // 300 é o fim da faixa e tem de estar lá
    expect(html).toContain('>300<');
  });

  it('o contador fala do universo do dia, não das 700', () => {
    const html = render({ nightlyNumbers: doDia, temFaixaMadrugada: true });
    /* 299 da faixa − 2 em apuração (37, 82) − 8 baixadas dentro da faixa = 289.
       O que importa é NÃO aparecer o total da sequência inteira. */
    expect(html).not.toContain('/ 699');
  });

  it('sem faixa configurada, a grade segue mostrando tudo', () => {
    const html = render({ nightlyNumbers: [], temFaixaMadrugada: false });
    expect(html).not.toContain('Faixa do dia');
    expect(html).toContain('>301<');
  });
});
