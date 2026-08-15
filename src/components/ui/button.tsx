import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Alvos de toque grandes (mobile-first, baixo letramento digital)
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgo-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-sgo-brand text-on-brand hover:bg-sgo-brand-hover active:bg-sgo-brand',
        // Preenchimento em grafite — o 'gold' legado sempre foi cinza-escuro.
        gold: 'bg-ink-700 text-on-brand hover:bg-ink-500 active:bg-ink-900',
        destructive: 'bg-danger text-on-brand hover:opacity-90',
        outline: 'border-2 border-line-strong bg-sgo-surface hover:bg-sunken',
        ghost: 'hover:bg-sunken',
        link: 'text-sgo-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-12 px-5 py-3', // 48px — alvo de toque confortável
        sm: 'h-10 px-4',
        lg: 'h-14 px-6 text-lg',
        icon: 'h-12 w-12',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants };
