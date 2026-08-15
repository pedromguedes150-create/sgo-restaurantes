import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Button do design system (Onda 2). REDESIGN.md §4 e princípio 4:
 *  - UM botão primário por tela;
 *  - ação destrutiva é GHOST com texto `danger`, nunca bloco vermelho;
 *  - `sm` (32px) mantém alvo tocável de 44px via ::after, sem alterar o layout.
 * Foco: anel duplo (2px surface + 2px brand) via shadow-sgo-focus.
 */
const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control',
    'font-medium outline-none transition-colors duration-sgo-1 ease-sgo-std',
    'focus-visible:shadow-sgo-focus',
    'disabled:pointer-events-none disabled:opacity-40',
    'motion-reduce:transition-none',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand hover:bg-brand-hover',
        secondary: 'border border-line-strong bg-surface text-ink-900 hover:bg-sunken',
        ghost: 'text-ink-700 hover:bg-sunken hover:text-ink-900',
        // Destrutivo: sem bloco vermelho (princípio 4).
        danger: 'text-danger hover:bg-danger-bg',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        // Alvo de 44px no sm: pseudo-elemento invisível, não ocupa espaço.
        sm: "h-8 px-3 text-[13px] after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
        md: 'h-10 px-4 text-[14px]',
        lg: 'h-12 px-5 text-[15px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/** Botão só-ícone: quadrado no mesmo tamanho de controle, com rótulo acessível. */
export const IconButton = React.forwardRef<HTMLButtonElement, ButtonProps & { 'aria-label': string }>(
  ({ className, size = 'md', ...props }, ref) => (
    <Button
      ref={ref}
      size={size}
      className={cn('px-0', size === 'sm' ? 'w-8' : size === 'lg' ? 'w-12' : 'w-10', className)}
      {...props}
    />
  ),
);
IconButton.displayName = 'IconButton';

export { buttonVariants };
