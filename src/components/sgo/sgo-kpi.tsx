import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SgoIconTone } from './tones';

/**
 * KPI card do kit de layout (3-componentes-sgo/SgoKpi.tsx), sem alteração de
 * estrutura: cápsula de ícone, rótulo, valor 23px/800 e linha de apoio. O
 * visual inteiro vive em .sgo-kpi (sgo-kit.css, seção 8); a grade é
 * `.sgo-kpis` (auto-fit, mínimo 185px).
 *
 * Adaptação do Restaurante: `href` torna o cartão um LINK (regra do Dashboard
 * desde a v1.99.0 — todo indicador tem porta de saída já filtrada). O kit só
 * tinha `onClick`.
 */
export interface SgoKpiProps {
  label: string;
  value: ReactNode;
  /** Linha pequena abaixo do valor (tendência, contexto). */
  meta?: ReactNode;
  metaTone?: 'up' | 'down' | 'warn';
  icon?: LucideIcon;
  tone?: SgoIconTone;
  hero?: boolean;
  onClick?: () => void;
  /** Cartão-link: o clique leva para a tela já filtrada. */
  href?: string;
  /** Cor do VALOR, quando o número em si carrega o estado (token do kit). */
  valueColor?: string;
  testId?: string;
  className?: string;
}

export function SgoKpi({ label, value, meta, metaTone, icon: Icon, tone = 'blue', hero, onClick, href, valueColor, testId, className }: SgoKpiProps) {
  const cls = ['sgo-kpi', hero ? 'sgo-kpi--hero' : '', onClick || href ? 'cursor-pointer' : '', className ?? ''].filter(Boolean).join(' ');
  const inner = (
    <>
      {Icon && (
        <div className={`sgo-kpi__ic sgo-kpi__ic--${tone}`} aria-hidden>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="sgo-kpi__label">{label}</div>
      <div className="sgo-kpi__value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      {meta !== undefined && meta !== null && (
        <div className={`sgo-kpi__meta${metaTone ? ` sgo-kpi__meta--${metaTone}` : ''}`}>{meta}</div>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${cls} block outline-none focus-visible:shadow-sgo-focus`} data-testid={testId}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={`${cls} text-left`} onClick={onClick} data-testid={testId}>
        {inner}
      </button>
    );
  }
  return <div className={cls} data-testid={testId}>{inner}</div>;
}

/** A grade de KPIs do kit: colunas automáticas, mínimo 185px, espaço 14px. */
export function SgoKpis({ children, className, flush }: { children: ReactNode; className?: string; flush?: boolean }) {
  return <div className={['sgo-kpis', className ?? ''].filter(Boolean).join(' ')} style={flush ? { marginBottom: 0 } : undefined}>{children}</div>;
}
