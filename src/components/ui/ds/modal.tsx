'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Portal para o <body>: evita que um ancestral com transform (ex.: o recuo do
 *  Sheet) quebre o position:fixed do overlay. */
export function useBodyPortal(open: boolean) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return open && mounted;
}

/**
 * Modal do design system (Onda 2). Comportamento de diálogo de verdade:
 * Esc fecha, foco é levado para dentro e CIRCULA (Tab não escapa), rolagem do
 * fundo trava e o foco volta para quem abriu ao fechar.
 * O hook é exportado porque o Sheet usa exatamente o mesmo comportamento.
 */
const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDialogBehavior(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement>) {
  /**
   * `onClose` guardado em ref DE PROPÓSITO.
   *
   * Quase todo chamador passa uma função inline (`onClose={() => setX(false)}`),
   * que tem identidade NOVA a cada renderização. Com `onClose` na lista de
   * dependências, o efeito era desmontado e remontado a cada render do pai — e
   * em formulário cujo estado vive no pai, isso é A CADA TECLA. O efeito então
   * chamava `focusFirst()` de novo e o cursor pulava do campo para o primeiro
   * elemento focável, que é o botão de FECHAR.
   *
   * Era exatamente o que acontecia no cadastro de fornecedor: digitar uma letra
   * jogava o foco no "X". O efeito passa a depender só de `open`, e lê sempre a
   * versão mais recente de `onClose` pela ref.
   */
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; });

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Trava a rolagem do fundo sem "pular" pela sumiço da barra de rolagem.
    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    const focusFirst = () => {
      const el = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      (el ?? ref.current)?.focus();
    };
    const id = window.setTimeout(focusFirst, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(id);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previouslyFocused?.focus?.();
    };
  }, [open, ref]);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const show = useBodyPortal(open);
  useDialogBehavior(open, onClose, ref);
  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn('sgo-page-enter max-h-[85vh] w-full overflow-hidden rounded-sheet border border-line bg-surface shadow-2xl outline-none', sizes[size])}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="sgo-type-17 font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-500 outline-none hover:bg-sunken hover:text-ink-900 focus-visible:shadow-sgo-focus"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children && <div className="max-h-[60vh] overflow-auto p-4">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-line p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
