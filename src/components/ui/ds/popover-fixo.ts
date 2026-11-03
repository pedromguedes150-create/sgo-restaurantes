'use client';

import * as React from 'react';

/**
 * POPOVER FIXO (v1.182.1) — a regra de posição que Select, TimePicker e
 * ActionMenu compartilham.
 *
 * Por que existe: as listas suspensas eram `position: absolute` dentro do
 * próprio campo — tinham a largura do botão e eram cortadas por qualquer
 * ancestral com `overflow` (tabela rolável, painel, Sheet). No celular isso
 * virava texto pela metade ("Em homologaç…") e menu que sumia atrás da borda
 * (print do Pedro). Com o popover num portal e `position: fixed` calculado a
 * partir do retângulo do gatilho, nada o corta; aqui mora a conta:
 *
 * - largura: no mínimo a do gatilho (ou `minWidth`), cresce até o conteúdo,
 *   teto = `maxWidth` ou a tela menos as margens;
 * - horizontal: ancorado à esquerda (ou à direita, para o "···"), sempre
 *   dentro da tela;
 * - vertical: abre para baixo; vira para cima quando falta espaço embaixo e
 *   sobra em cima; `maxHeight` é o que cabe;
 * - rolar qualquer contêiner reposiciona, e fecha se o gatilho saiu da tela.
 *
 * O DatePicker tem a própria conta (largura fixa e altura que muda com o mês)
 * e ficou como está.
 */
export interface CoordsDoPopover { top: number; left: number; minWidth: number; maxWidth: number; maxHeight: number }
export interface OpcoesDoPopover {
  /** Lado do gatilho em que o popover se alinha. */
  ancora?: 'esquerda' | 'direita';
  /** Teto de largura em px (padrão 28rem). */
  maxWidth?: number;
  /** Largura mínima em px (padrão = a do gatilho). */
  minWidth?: number;
  /** Teto de altura em px (padrão 320). */
  maxHeight?: number;
}
export const MARGEM_DO_POPOVER = 8;

export function usePopoverFixo(
  open: boolean,
  gatilhoRef: React.RefObject<HTMLElement>,
  popRef: React.RefObject<HTMLElement>,
  fechar: () => void,
  opcoes: OpcoesDoPopover = {},
  /** Qualquer valor que, ao mudar, pede recálculo (o tamanho da lista filtrada, por exemplo). */
  dependencia?: unknown,
) {
  const { ancora = 'esquerda', maxWidth: tetoLargura = 28 * 16, minWidth: minimoLargura, maxHeight: tetoAltura = 320 } = opcoes;
  const [coords, setCoords] = React.useState<CoordsDoPopover | null>(null);
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);

  const reposicionar = React.useCallback(() => {
    const rect = gatilhoRef.current?.getBoundingClientRect();
    if (!rect) return;
    const M = MARGEM_DO_POPOVER;
    const maxWidth = Math.min(tetoLargura, window.innerWidth - 2 * M);
    const minWidth = Math.min(minimoLargura ?? rect.width, maxWidth);
    const largura = Math.min(Math.max(popRef.current?.offsetWidth ?? minWidth, minWidth), maxWidth);
    const altura = popRef.current?.offsetHeight ?? 280;
    const abaixo = window.innerHeight - rect.bottom - M;
    const acima = rect.top - M;
    const paraCima = abaixo < Math.min(altura, 200) && acima > abaixo;
    const maxHeight = Math.max(120, Math.min(tetoAltura, (paraCima ? acima : abaixo) - 4));
    const top = paraCima ? Math.max(M, rect.top - 4 - Math.min(altura, maxHeight)) : rect.bottom + 4;
    const esquerda = ancora === 'direita' ? rect.right - largura : rect.left;
    const left = Math.max(M, Math.min(esquerda, window.innerWidth - M - largura));
    setCoords({ top, left, minWidth, maxWidth, maxHeight });
  }, [gatilhoRef, popRef, ancora, tetoLargura, minimoLargura, tetoAltura]);

  React.useLayoutEffect(() => { if (open) reposicionar(); }, [open, dependencia, reposicionar]);

  React.useEffect(() => {
    if (!open) return;
    const aoRolar = () => {
      const rect = gatilhoRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) { fechar(); return; }
      reposicionar();
    };
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', aoRolar);
    return () => {
      window.removeEventListener('scroll', aoRolar, true);
      window.removeEventListener('resize', aoRolar);
    };
  }, [open, gatilhoRef, fechar, reposicionar]);

  /** Estilo do popover quando montado no navegador; no servidor fica `undefined` (sai inline). */
  const estilo: React.CSSProperties | undefined = montado
    ? {
      position: 'fixed', top: coords?.top ?? -9999, left: coords?.left ?? -9999,
      minWidth: coords?.minWidth, maxWidth: coords?.maxWidth ?? `calc(100vw - ${2 * MARGEM_DO_POPOVER}px)`, width: 'max-content',
      zIndex: 'var(--sgo-z-dropdown-in-modal)' as unknown as number,
    }
    : undefined;
  return { montado, coords, estilo, reposicionar };
}
