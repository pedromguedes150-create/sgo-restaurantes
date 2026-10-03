import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Card — desde a Fase 4 do kit de layout (v1.145.0) é o PAINEL do kit
 * (`.sgo-panel`, sgo-kit.css seção 8): vidro translúcido sobre o fundo
 * contínuo, raio 16px, sombra na cor da marca. A API não mudou (Card /
 * CardHeader / CardTitle / CardContent), então as ~90 telas que importam daqui
 * ganharam o acabamento do kit sem tocar na árvore JSX de nenhuma.
 *
 * `src/components/sgo/panel.tsx` tem a mesma API com `CardDescription`,
 * `CardFooter` e `PanelHeader` (cabeçalho em linha com cápsula e contador) —
 * é o destino das telas migradas uma a uma.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('sgo-panel text-ink-900', className)} {...props} />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-4', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('sgo-panel__title', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardContent };
