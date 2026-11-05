import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { ListRow } from '@/components/ui/ds/list-row';

/**
 * v1.182.1 — levantamento a 375px em todas as telas (pedido do Pedro: "deixe
 * ver o que está escrito por completo"): nenhuma tela transbordava na
 * horizontal; o que cortava texto era SEMPRE reticência (`truncate` do
 * Tailwind e `.sgo-row__*` do kit) e lista suspensa com a largura do botão.
 * Estes testes travam as três correções de base.
 */
describe('texto inteiro no celular', () => {
  it('ListRow quebra o título e o subtítulo em vez de cortar com reticências', () => {
    const html = renderToString(React.createElement(ListRow, { title: 'Lançamento de Perdas/Desperdício do dia', subtitle: 'Extraviada; baixa definitiva registrada pelo gerente' }));
    expect(html).toContain('break-words');
    expect(html).not.toContain('truncate');
  });
  it('abaixo de 768px, todo `truncate` e as linhas do kit passam a quebrar (CSS global), com `.truncate-sempre` como exceção', () => {
    const css = readFileSync('src/styles/globals.css', 'utf8');
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('.truncate:not(.truncate-sempre)');
    expect(css).toContain('.sgo-row__sub');
    expect(css).toContain('overflow-wrap: anywhere');
  });
  it('Select, TimePicker e ActionMenu usam o mesmo popover fixo (portal), que nunca é cortado por um ancestral com overflow', () => {
    for (const f of ['src/components/ui/ds/select.tsx', 'src/components/ui/ds/time-picker.tsx', 'src/components/ui/ds/action-menu.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain("from './popover-fixo'");
      expect(src, f).toContain('createPortal(');
    }
    const hook = readFileSync('src/components/ui/ds/popover-fixo.ts', 'utf8');
    expect(hook).toContain("window.innerWidth - 2 * M");
    expect(hook).toContain("ancora === 'direita' ? rect.right - largura : rect.left");
    expect(hook).toContain("zIndex: 'var(--sgo-z-dropdown-in-modal)'");
  });
});

/* v1.189.0 — print do gerente (aba Freelancer no celular): com três crachás à direita o texto da linha era
   espremido a ~0 e quebrava UMA LETRA POR LINHA. O texto tem largura mínima e os crachás descem de linha. */
describe('ListRow: os crachás da direita não esmagam o texto', () => {
  it('o bloco de texto tem largura mínima e a linha quebra os crachás para baixo quando não cabem', () => {
    const fonte = readFileSync('src/components/ui/ds/list-row.tsx', 'utf8');
    expect(fonte).toContain('min-w-[10rem] flex-1 basis-0');
    expect(fonte).toContain("w-full flex-wrap items-center gap-x-3 gap-y-1");
    expect(fonte).toContain('ml-auto flex max-w-full flex-wrap items-center justify-end gap-2');
    expect(fonte).not.toContain('<span className="flex shrink-0 items-center gap-2">{trailing}</span>');
  });
  /* v1.189.1 — a varredura (121 rotas × 360px) achou o mesmo padrão em outras linhas e nas tabelas */
  it('as outras linhas "texto × ações" têm largura mínima, as tabelas do kit não quebram o cabeçalho e as roscas quebram a legenda para baixo', () => {
    expect(readFileSync('src/components/admin/templates-admin.tsx', 'utf8')).toContain('<div className="min-w-[10rem] flex-1">');
    expect(readFileSync('src/app/(app)/modulos/desperdicios/page.tsx', 'utf8')).toContain('<summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">');
    expect(readFileSync('src/components/notes/notes-client.tsx', 'utf8')).toContain('min-w-[10rem] flex-1 truncate font-semibold');
    expect(readFileSync('src/components/people/evaluation-client.tsx', 'utf8')).toContain('<span className="flex min-w-[10rem] flex-1 items-center gap-2">');
    expect(readFileSync('src/components/admin/freelancer-rates-config.tsx', 'utf8')).toContain('grid grid-cols-1 gap-2 sm:grid-cols-3');
    expect(readFileSync('src/styles/globals.css', 'utf8')).toContain('.sgo-tbl th, .sgo-tbl thead th { white-space: nowrap; }');
    expect(readFileSync('src/components/metas/graficos-metas.tsx', 'utf8')).toContain('<div className="flex flex-wrap items-center gap-4" data-testid="rosca-meta">');
    expect(readFileSync('src/components/people/manager-schedule-client.tsx', 'utf8')).toContain('min-w-[7rem] max-w-44 truncate truncate-sempre');
  });
});
