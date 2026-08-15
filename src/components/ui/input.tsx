import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // h-12 = alvo de toque; text-base evita zoom no iOS
        'flex h-12 w-full rounded-lg border-2 border-line-strong bg-sgo-surface px-4 py-2 text-base ring-offset-background placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgo-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
