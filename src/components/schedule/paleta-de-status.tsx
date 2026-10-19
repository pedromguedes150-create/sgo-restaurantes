'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Eraser, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DayStatus } from '@/lib/schedule/grade-filtros';
import { STATUS, STATUS_ORDER } from './status-visual';
import { useBodyPortal } from '@/components/ui/ds/modal';

/**
 * A PALETA DE STATUS — como o gerente marca o dia no Realizado (v1.173.0).
 *
 * Antes a célula abria um `Select` de 9 opções numa caixa de 64px, dentro de
 * um painel com `overflow-x-auto`: o menu nascia cortado pelo painel e virava
 * uma tira de rolagem de dois itens (print do Pedro). Agora a célula abre uma
 * paleta POR CIMA da tela (portal no body, como as janelas do kit): os oito
 * códigos como botões coloridos de 44px — tamanho de toque —, mais "Limpar".
 * Um toque escolhe e fecha. A gravação é a MESMA de sempre (`setCell`); só a
 * forma de escolher mudou.
 */
export interface PaletaProps {
  /** Quem e qual dia — vai no título e no `aria-label`. */
  nome: string;
  dia: number;
  valor: DayStatus | null;
  onEscolher: (s: DayStatus | 'CLEAR') => void;
  onClose: () => void;
}

/** O miolo, sem portal nem posição: é o que o teste de render consegue ver. */
export function CorpoDaPaleta({ nome, dia, valor, onEscolher, onClose }: PaletaProps) {
  return (
    <div role="dialog" aria-label={`Status de ${nome} no dia ${dia}`} className="w-[232px] rounded-card border border-line bg-surface p-2 shadow-sgo-pop" data-testid="paleta-de-status">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs text-ink-700"><span className="block truncate font-semibold text-ink-900">{nome}</span>Dia {dia}</p>
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-ink-500 hover:bg-sunken hover:text-ink-900">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {STATUS_ORDER.map((s) => {
          const ativo = valor === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onEscolher(s)}
              aria-label={STATUS[s].label}
              aria-pressed={ativo}
              title={STATUS[s].label}
              className={cn(
                'flex h-11 flex-col items-center justify-center rounded-control text-sm font-bold leading-none transition-shadow duration-sgo-1 ease-sgo-std hover:ring-2 hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand',
                STATUS[s].cls,
                ativo && 'ring-2 ring-brand ring-offset-1',
              )}
            >
              <span>{STATUS[s].code}</span>
              <span className="mt-0.5 text-[9px] font-medium opacity-80">{rotuloCurto(s)}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onEscolher('CLEAR')}
        className="mt-2 flex h-9 w-full items-center justify-center gap-1 rounded-control border border-dashed border-line-strong text-xs font-semibold text-ink-700 hover:border-brand hover:text-brand"
      >
        <Eraser className="h-3.5 w-3.5" aria-hidden /> Limpar o dia
      </button>
    </div>
  );
}

function rotuloCurto(s: DayStatus): string {
  switch (s) {
    case 'FALTA_INJUST': return 'Injust.';
    case 'FALTA_JUST': return 'Justif.';
    default: return STATUS[s].label;
  }
}

/**
 * A paleta posicionada embaixo (ou em cima, se não couber) da célula que a
 * abriu, presa à janela em `position: fixed`. Fecha com Esc, com clique fora
 * ou ao escolher. Não trava a rolagem do fundo: é um popover, não um modal —
 * o gerente pode rolar a grade e abrir a célula seguinte.
 */
export function PaletaDeStatus({ ancora, ...props }: PaletaProps & { ancora: HTMLElement | null }) {
  const pronto = useBodyPortal(true);
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const onCloseRef = React.useRef(props.onClose);
  React.useEffect(() => { onCloseRef.current = props.onClose; });

  React.useLayoutEffect(() => {
    if (!ancora || !pronto) return;
    const r = ancora.getBoundingClientRect();
    const LARGURA = 232; const ALTURA = 196; const FOLGA = 8;
    let left = r.left + r.width / 2 - LARGURA / 2;
    left = Math.max(FOLGA, Math.min(left, window.innerWidth - LARGURA - FOLGA));
    let top = r.bottom + 6;
    if (top + ALTURA > window.innerHeight - FOLGA) top = Math.max(FOLGA, r.top - ALTURA - 6);
    setPos({ top, left });
  }, [ancora, pronto]);

  React.useEffect(() => {
    if (!pronto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); } };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo) || ancora?.contains(alvo)) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('button[aria-pressed="true"], button')?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.clearTimeout(t);
    };
  }, [pronto, ancora]);

  if (!pronto || !pos) return null;
  return createPortal(
    <div ref={ref} className="fixed" style={{ top: pos.top, left: pos.left, zIndex: 'var(--sgo-z-dropdown-in-modal)' as unknown as number }}>
      <CorpoDaPaleta {...props} />
    </div>,
    document.body,
  );
}
