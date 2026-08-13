'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDialogBehavior, useBodyPortal } from './modal';

/**
 * Sheet do design system (Onda 2): sobe de baixo e o conteúdo ATRÁS recua
 * para scale(.94) — o gesto de "camada" do iOS.
 *
 * O recuo é opt-in: enquanto o sheet está aberto, marcamos
 * data-sheet-open="true" no <html> e o CSS (sgo-design-system.css) escala o
 * elemento marcado com [data-sheet-scales]. Assim o Sheet não precisa
 * conhecer a árvore da página.
 */
export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const show = useBodyPortal(open);
  useDialogBehavior(open, onClose, ref);

  React.useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.sheetOpen = 'true';
    return () => { delete document.documentElement.dataset.sheetOpen; };
  }, [open]);

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 print:hidden" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'sgo-sheet-enter flex max-h-[90vh] w-full flex-col rounded-t-sheet border border-line bg-sgo-surface pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none sm:max-w-lg',
        )}
      >
        {/* Puxador: afordância de arrastar (decorativo). */}
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-1 w-9 rounded-pill bg-line-strong" />
        </div>
        <div className="flex items-start justify-between gap-3 p-4 pb-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
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
        {children && <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-line p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
