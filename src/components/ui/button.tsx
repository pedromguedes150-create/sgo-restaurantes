import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Botão — vocabulário do iOS (Onda 8).
 *
 * O que faz um botão "parecer iOS" não é o raio da borda: é o RECUO AO TOQUE.
 * No iOS o botão encolhe e esmaece no instante da pressão e volta em mola ao
 * soltar. Antes daqui o botão só trocava de cor, o que no celular quase não se
 * percebe — o dedo cobre justamente a área que mudaria.
 *
 * `active:` cobre toque e clique, então o gesto vale nos dois. A volta usa
 * --sgo-ease-spring; a ida é rápida e sem mola, como no original.
 *
 * As variantes seguem a nomenclatura do iOS (filled / tinted / gray / plain),
 * com os nomes antigos mantidos como apelido para não quebrar as ~200 chamadas
 * existentes.
 */
const base = [
  // `sgo-control`: em ponteiro grosso o próprio controle cresce até 44px
  // (regra 8). Sem isto o tamanho `sm`, agora 36px, ficaria abaixo do dedo.
  'sgo-control',
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control',
  'text-base font-semibold',
  // Transição só do que muda: cor, sombra e a transformação do recuo.
  'transition-[transform,background-color,border-color,color,opacity] duration-sgo-1 ease-sgo-spring',
  'active:scale-[0.96] active:duration-[80ms]',
  'focus-visible:outline-none focus-visible:shadow-sgo-focus',
  'disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100',
  // Regra 9: quem pediu menos movimento não recebe o recuo.
  'motion-reduce:transition-none motion-reduce:active:scale-100',
].join(' ');

const buttonVariants = cva(base, {
  variants: {
    variant: {
      /** Filled — ação principal da tela. Uma por tela (regra 4). */
      default: 'bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-active',
      /** Tinted — secundária de peso: tinta da marca + texto da marca. */
      tinted: 'bg-brand-tint-2 text-brand hover:bg-brand-tint active:bg-brand-tint-2',
      /** Gray — neutra, quando nem a marca nem o perigo cabem. */
      gray: 'bg-sunken text-ink-900 hover:bg-line active:bg-line-strong',
      /** Destrutiva de verdade (apaga dado). Fora disso, use `plain` + text-danger. */
      destructive: 'bg-danger text-on-brand active:opacity-80',
      /** Plain — só texto, o padrão de barra de navegação do iOS. */
      plain: 'text-brand hover:bg-brand-tint active:bg-brand-tint-2',

      // ---- apelidos do vocabulário antigo (shadcn) ----
      gold: 'bg-ink-700 text-on-brand hover:bg-ink-500 active:bg-ink-900',
      outline: 'border border-line-strong bg-surface text-ink-900 hover:bg-sunken active:bg-line',
      ghost: 'text-ink-900 hover:bg-sunken active:bg-line',
      link: 'text-brand underline-offset-4 hover:underline active:scale-100',
    },
    size: {
      /** 44px: a medida do iOS e exatamente o alvo mínimo de toque (regra 8). */
      default: 'h-11 px-5',
      sm: 'h-9 px-4 text-sm',
      lg: 'h-12 px-6 text-lg',
      icon: 'h-11 w-11',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

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
