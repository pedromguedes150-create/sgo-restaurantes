'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toast do design system (Onda 2): confirmação passageira de uma ação
 * ("Nota registrada"). Empilha no canto, some sozinho e é anunciado por
 * leitor de tela (aria-live). Erros usam role=alert (interrompe).
 * Monte <ToastProvider> uma vez e chame useToast() onde precisar.
 */
export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface ToastItem { id: number; tone: ToastTone; title: string; description?: string }

const icons: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  info: Info, success: CheckCircle2, warning: AlertTriangle, danger: OctagonAlert,
};
const iconTone: Record<ToastTone, string> = {
  info: 'text-info', success: 'text-success', warning: 'text-warning', danger: 'text-danger',
};

interface ToastContextValue {
  toast: (t: { tone?: ToastTone; title: string; description?: string; duration?: number }) => void;
}
const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const toast = React.useCallback<ToastContextValue['toast']>(({ tone = 'info', title, description, duration = 5000 }) => {
    const id = nextId.current++;
    setItems((l) => [...l, { id, tone, title, description }]);
    if (duration > 0) window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Região viva: anuncia sem roubar o foco do usuário. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 print:hidden"
      >
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'danger' ? 'alert' : 'status'}
              className="sgo-page-enter pointer-events-auto flex items-start gap-2.5 rounded-card border border-line bg-surface p-3 shadow-lg"
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconTone[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs leading-5 text-ink-500">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Fechar aviso"
                className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-400 outline-none hover:bg-sunken hover:text-ink-900 focus-visible:shadow-sgo-focus"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
