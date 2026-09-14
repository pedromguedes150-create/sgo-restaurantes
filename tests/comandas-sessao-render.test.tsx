import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/comandas/conferencias/abc',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { SessaoClient, type SessaoNaTela } from '@/components/commands/sessao-client';

/**
 * A TELA da conferência em andamento.
 *
 * O que se mede é o que o caixa vê no meio do turno: quanto falta, o leitor
 * aparecendo só quando o método pede, os filtros, e — o mais importante — que a
 * grade mostra **as marcas desta sessão**, e só elas.
 */

function sessao(over: Partial<SessaoNaTela> = {}): SessaoNaTela {
  const escopo = [1, 2, 3, 4, 5];
  const conferidas = [1, 2];
  const emUso = [3];
  return {
    id: 's1', unitName: 'Moreira',
    tipo: 'Completa', metodo: 'Manual + Leitor', metodoId: 'MISTO',
    iniciadaEm: '14/09/2026 14:20', responsavel: 'João Silva',
    escopo, conferidas, emUso,
    faltando: [4, 5], pct: 60,
    ...over,
  };
}

const render = (s: SessaoNaTela, podeEditar = true) =>
  renderToString(React.createElement(SessaoClient, { sessao: s, podeEditar })).split('<!-- -->').join('');

describe('O progresso', () => {
  it('diz quanto já foi e quanto falta, sem obrigar a contar', () => {
    const html = render(sessao());
    expect(html).toContain('3 de 5 conferidas');
    expect(html).toContain('60%');
    expect(html).toContain('Faltam: 2');
  });

  it('mostra tipo, método, hora de início e responsável', () => {
    const html = render(sessao());
    expect(html).toContain('Completa');
    expect(html).toContain('Manual + Leitor');
    expect(html).toContain('14/09/2026 14:20');
    expect(html).toContain('João Silva');
  });
});

describe('O leitor aparece conforme o método', () => {
  it('no método LEITOR, o campo de leitura está lá', () => {
    const html = render(sessao({ metodoId: 'LEITOR', metodo: 'Leitor' }));
    expect(html).toContain('Leitor conectado');
    expect(html).toContain('bipe a comanda');
  });

  it('no MISTO, leitor E grade convivem — é o que o método promete', () => {
    const html = render(sessao({ metodoId: 'MISTO' }));
    expect(html).toContain('Leitor conectado');
    expect(html).toContain('Não conferidas'); // o filtro só existe com a grade
  });

  it('no MANUAL não há leitor nenhum', () => {
    const html = render(sessao({ metodoId: 'MANUAL', metodo: 'Manual' }));
    expect(html).not.toContain('Leitor conectado');
    expect(html).toContain('Não conferidas');
  });
});

describe('A grade e os filtros', () => {
  it('oferece as quatro visões', () => {
    const html = render(sessao());
    for (const f of ['Todas', 'Conferidas', 'Não conferidas', 'Em uso']) expect(html, f).toContain(f);
  });

  it('mostra os números do escopo — e só eles', () => {
    /* A sessão é a dona das marcas: nada de comanda de outra contagem. */
    const html = render(sessao({ escopo: [10, 11, 12], conferidas: [10], emUso: [], faltando: [11, 12] }));
    expect(html).toContain('>10<');
    expect(html).toContain('>12<');
    expect(html).not.toContain('>99<');
  });

  it('a legenda explica que "em uso" conta como presente', () => {
    expect(render(sessao())).toContain('Em uso (conta como presente)');
  });

  it('diz quantas estão na visão atual', () => {
    expect(render(sessao())).toContain('5 de 5 comandas nesta visão');
  });
});

describe('Somente leitura', () => {
  it('sem permissão, não há leitor, nem marcar em lote, nem finalizar', () => {
    const html = render(sessao(), false);
    expect(html).not.toContain('Leitor conectado');
    expect(html).not.toContain('Finalizar conferência');
    expect(html).not.toContain('Marcar');
    /* Mas o progresso e a grade continuam visíveis — consultar é permitido. */
    expect(html).toContain('3 de 5 conferidas');
    expect(html).toContain('>1<');
  });

  it('com permissão, finalizar e cancelar existem', () => {
    const html = render(sessao(), true);
    expect(html).toContain('Finalizar conferência');
    expect(html).toContain('Cancelar');
  });
});
