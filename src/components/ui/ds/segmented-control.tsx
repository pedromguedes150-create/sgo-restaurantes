'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * SegmentedControl do design system (Onda 2). A pílula DESLIZA entre os
 * segmentos com --ease-spring (nunca fade). Segmentos de largura igual, então
 * a posição é só `translateX(index * 100%)` — sem medir DOM.
 * A11y: radiogroup + radio; ←/→ movem e já selecionam (padrão de rádio).
 */
export interface SegmentOption<T extends string> { value: T; label: string; badge?: number }

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onValueChange: (v: T) => void;
  size?: 'sm' | 'md';
  'aria-label': string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options, value, onValueChange, size = 'md', className, ...rest
}: SegmentedControlProps<T>) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (idx + dir + options.length) % options.length;
    onValueChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      onKeyDown={onKeyDown}
      className={cn('relative inline-flex rounded-pill bg-sunken p-1', size === 'sm' ? 'h-9' : 'h-11', className)}
    >
      {/* Pílula que desliza. aria-hidden: é decoração; o estado vive no radio. */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-pill bg-sgo-surface shadow-sm transition-transform duration-sgo-3 ease-sgo-spring motion-reduce:transition-none"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            className={cn(
              'relative z-10 flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-pill px-3 font-medium outline-none transition-colors duration-sgo-2 ease-sgo-std focus-visible:shadow-sgo-focus motion-reduce:transition-none',
              size === 'sm' ? 'text-[13px]' : 'text-[14px]',
              active ? 'text-ink-900' : 'text-ink-500 hover:text-ink-700',
            )}
          >
            {o.label}
            {o.badge != null && o.badge > 0 && (
              <span className={cn('rounded-pill px-1.5 text-[11px] font-bold tabular-nums', active ? 'bg-sgo-brand text-on-brand' : 'bg-line-strong text-ink-700')}>
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
