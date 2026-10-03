'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBodyPortal, useDialogBehavior } from '@/components/ui/ds/modal';

/**
 * SgoModal — casca ÚNICA de modal de criar/editar do kit de layout
 * (3-componentes-sgo/SgoModal.tsx, sgo-kit.css seção 17).
 *
 * Estrutura fixa: barrinha de plumagem → cabeçalho (cápsula de ícone + título
 * + subtítulo + fechar) → corpo rolável (grid de 2 colunas) → rodapé separado
 * em --sgo-panel-2 (Cancelar + ação primária).
 *
 * Adaptação: o kit envolve o Dialog do Radix; o Restaurante não tem Radix e já
 * tem foco preso, ESC, clique fora e portal em `useDialogBehavior`/`useBodyPortal`
 * (ds/modal.tsx). A casca por cima é a do kit, classe por classe.
 */
export type SgoModalTone = 'brand' | 'blue' | 'green' | 'amber' | 'red';
export type SgoModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'wide';

const SIZE_CLASS: Record<SgoModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  wide: 'sgo-modal--wide',
};

export interface SgoModalProps {
  open: boolean;
  /** Chamado no X, no ESC e no clique fora. */
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: SgoModalTone;
  size?: SgoModalSize;
  footer?: React.ReactNode;
  footerLeft?: React.ReactNode;
  headerExtra?: React.ReactNode;
  /** Corpo + rodapé viram um <form>: Enter no campo e `type="submit"` disparam. */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  flushBody?: boolean;
  /** Ignora o clique fora (ESC e X continuam fechando) — modais de montagem. */
  preventCloseOnOutside?: boolean;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  'data-testid'?: string;
}

export function SgoModal({
  open, onClose, title, subtitle, icon, tone = 'blue', size = 'md', footer, footerLeft, headerExtra, onSubmit,
  flushBody, preventCloseOnOutside, children, className, bodyClassName, 'data-testid': dataTestId,
}: SgoModalProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const show = useBodyPortal(open);
  useDialogBehavior(open, onClose, ref);
  if (!show) return null;

  const body = (
    <>
      <div className={cn('sgo-modal__body', flushBody && 'sgo-modal__body--flush', bodyClassName)}>{children}</div>
      {footer !== undefined && footer !== null && (
        <div className="sgo-modal__ftr">
          <div className="sgo-modal__ftr-l">{footerLeft}</div>
          <div className="sgo-modal__ftr-r">{footer}</div>
        </div>
      )}
    </>
  );

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 print:hidden"
      style={{ zIndex: 'var(--sgo-z-modal)' as unknown as number }}
      onClick={preventCloseOnOutside ? undefined : onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        data-testid={dataTestId}
        className={cn('sgo-app sgo-form-scope sgo-modal sgo-page-enter w-full max-h-[88vh] outline-none', SIZE_CLASS[size], className)}
      >
        <div className="sgo-modal__plume" aria-hidden="true" />
        <div className="sgo-modal__hdr">
          {icon && <div className={`sgo-modal__ic sgo-modal__ic--${tone}`} aria-hidden="true">{icon}</div>}
          <div className="sgo-modal__head">
            <h2 id={titleId} className="sgo-modal__title">{title}</h2>
            {subtitle ? <div className="sgo-modal__sub">{subtitle}</div> : null}
          </div>
          {headerExtra && <div className="sgo-modal__hdr-extra">{headerExtra}</div>}
          <button type="button" className="sgo-modal__x" onClick={onClose} aria-label="Fechar" data-testid="button-close-modal">
            <X className="h-4 w-4" />
          </button>
        </div>
        {onSubmit ? <form className="sgo-modal__form" onSubmit={onSubmit}>{body}</form> : body}
      </div>
    </div>,
    document.body,
  );
}

/** Grid de 2 colunas do corpo (1 coluna no celular). */
export function SgoModalGrid({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sgo-modal__grid', className)} {...props}>{children}</div>;
}

/** Separador de seção dentro do grid (ocupa a linha inteira). */
export function SgoModalSection({ children }: { children: React.ReactNode }) {
  return <div className="sgo-modal__sec">{children}</div>;
}

export interface SgoFieldProps {
  label?: React.ReactNode;
  required?: boolean;
  span?: 1 | 2;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Rótulo .sgo-label + campo. O campo em si continua sendo o da tela. */
export function SgoField({ label, required, span = 1, hint, error, className, children }: SgoFieldProps) {
  return (
    <div className={cn('sgo-field', span === 2 && 'sgo-span-2', className)}>
      {label && <span className={cn('sgo-label', required && 'sgo-label--req')}>{label}</span>}
      {children}
      {error ? (
        <span className="text-[11px]" style={{ color: 'var(--sgo-bad)' }}>{error}</span>
      ) : hint ? (
        <span className="text-[11px]" style={{ color: 'var(--sgo-ink-3)' }}>{hint}</span>
      ) : null}
    </div>
  );
}
