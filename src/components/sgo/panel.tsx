import * as React from 'react';

/**
 * Painéis do kit de layout com a MESMA API do <Card> do Restaurante
 * (Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter).
 *
 * Trocar só a origem do import mantém a árvore JSX da tela byte a byte e muda
 * exclusivamente a camada visual — que é o objetivo da padronização. O
 * <Card> antigo (ui/card.tsx) segue existindo para as telas não migradas.
 */
type DivProps = React.HTMLAttributes<HTMLDivElement>;

const cx = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' ');

const Card = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cx('sgo-panel', className)} {...props} />
));
Card.displayName = 'Card';

/** Cabeçalho em BLOCO (não flex): muitas telas empilham título + descrição. */
const CardHeader = React.forwardRef<HTMLDivElement, DivProps>(({ className, style, ...props }, ref) => (
  <div ref={ref} className={cx('space-y-1 px-4 py-3', className)} style={{ borderBottom: '1px solid var(--sgo-hair)', ...style }} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cx('sgo-panel__title', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, DivProps>(({ className, style, ...props }, ref) => (
  <div ref={ref} className={cx('sgo-sub', className)} style={{ marginTop: 0, ...style }} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cx('px-4 py-3', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, DivProps>(({ className, style, ...props }, ref) => (
  <div ref={ref} className={cx('flex items-center px-4 py-3', className)} style={{ borderTop: '1px solid var(--sgo-hair)', ...style }} {...props} />
));
CardFooter.displayName = 'CardFooter';

/**
 * Cabeçalho de painel do kit em LINHA (`.sgo-panel__hdr`): cápsula opcional,
 * título, contador e uma ação encostada à direita.
 */
export function PanelHeader({ title, icon, count, countTone, action, className }: {
  title: React.ReactNode; icon?: React.ReactNode; count?: number; countTone?: 'red'; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cx('sgo-panel__hdr', className)}>
      {icon}
      <div className="sgo-panel__title">{title}</div>
      {typeof count === 'number' && <span className={cx('sgo-count', countTone === 'red' && 'sgo-count--red')}>{count}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
