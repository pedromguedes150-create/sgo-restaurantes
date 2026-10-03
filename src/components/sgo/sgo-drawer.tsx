'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBodyPortal, useDialogBehavior } from '@/components/ui/ds/modal';

/**
 * SgoDrawer — painel lateral do kit (3-componentes-sgo/SgoDrawer.tsx).
 *
 * Irmão do SgoModal: mesma anatomia (plumagem, cápsula, título, subtítulo,
 * corpo rolável, rodapé) e as mesmas classes .sgo-modal__*. O que muda é a
 * casca — cola na borda, ocupa a altura toda, plumagem na aresta de encosto.
 * No celular (< 640px) o CSS do kit o transforma em folha de baixo.
 *
 *   • SgoModal  → criar/editar (exige decisão, bloqueia o fundo)
 *   • SgoDrawer → consultar (ficha, histórico, mantendo a tela atrás)
 */
export type SgoDrawerTone = 'brand' | 'blue' | 'green' | 'amber' | 'red';
export type SgoDrawerSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<SgoDrawerSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-2xl',
};

export interface SgoDrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: SgoDrawerTone;
  size?: SgoDrawerSize;
  side?: 'right' | 'left';
  footer?: React.ReactNode;
  footerLeft?: React.ReactNode;
  headerExtra?: React.ReactNode;
  flushBody?: boolean;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  'data-testid'?: string;
}

export function SgoDrawer({
  open, onClose, title, subtitle, icon, tone = 'blue', size = 'md', side = 'right', footer, footerLeft, headerExtra,
  flushBody, children, className, bodyClassName, 'data-testid': dataTestId,
}: SgoDrawerProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const show = useBodyPortal(open);
  useDialogBehavior(open, onClose, ref);
  if (!show) return null;

  return createPortal(
    <div
      className={cn('fixed inset-0 flex bg-black/40 print:hidden', side === 'right' ? 'justify-end' : 'justify-start')}
      style={{ zIndex: 'var(--sgo-z-modal)' as unknown as number }}
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        data-testid={dataTestId}
        className={cn('sgo-app sgo-form-scope sgo-drawer sgo-sheet-enter flex h-full w-full flex-col outline-none', side === 'left' && 'sgo-drawer--left', SIZE_CLASS[size], className)}
      >
        <div className="sgo-drawer__plume" aria-hidden="true" />
        <div className="sgo-modal__hdr">
          {icon && <div className={`sgo-modal__ic sgo-modal__ic--${tone}`} aria-hidden="true">{icon}</div>}
          <div className="sgo-modal__head">
            <h2 id={titleId} className="sgo-modal__title">{title}</h2>
            {subtitle ? <div className="sgo-modal__sub">{subtitle}</div> : null}
          </div>
          {headerExtra && <div className="sgo-modal__hdr-extra">{headerExtra}</div>}
          <button type="button" className="sgo-modal__x" onClick={onClose} aria-label="Fechar" data-testid="button-close-drawer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={cn('sgo-modal__body', flushBody && 'sgo-modal__body--flush', bodyClassName)}>{children}</div>
        {footer !== undefined && footer !== null && (
          <div className="sgo-modal__ftr">
            <div className="sgo-modal__ftr-l">{footerLeft}</div>
            <div className="sgo-modal__ftr-r">{footer}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
