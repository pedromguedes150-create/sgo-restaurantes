'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Banner do design system (Onda 2): aviso persistente no fluxo da página
 * (diferente do Toast, que é passageiro). Ícone + texto carregam o
 * significado — a cor só reforça (DoD: nada só por cor).
 */
export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const styles: Record<BannerTone, { box: string; icon: string; Icon: React.ComponentType<{ className?: string }> }> = {
  info: { box: 'bg-info-bg border-info/20', icon: 'text-info', Icon: Info },
  success: { box: 'bg-sgo-success-bg border-sgo-success/20', icon: 'text-sgo-success', Icon: CheckCircle2 },
  warning: { box: 'bg-warning-bg border-warning/20', icon: 'text-warning', Icon: AlertTriangle },
  danger: { box: 'bg-danger-bg border-danger/20', icon: 'text-danger', Icon: OctagonAlert },
};

export interface BannerProps {
  tone?: BannerTone;
  title: string;
  description?: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Banner({ tone = 'info', title, description, action, onDismiss, className }: BannerProps) {
  const s = styles[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-card border p-3', s.box, className)}
    >
      <s.Icon className={cn('mt-0.5 h-5 w-5 shrink-0', s.icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink-900">{title}</p>
        {description && <p className="mt-0.5 text-[13px] leading-5 text-ink-700">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar aviso"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-500 outline-none hover:bg-ink-900/5 hover:text-ink-900 focus-visible:shadow-sgo-focus"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
