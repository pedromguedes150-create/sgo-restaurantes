import Link from 'next/link';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Precisa da sua atenção" (Onda 3): substitui os 4 banners soltos que
 * empilhavam no topo do Dashboard. Um cartão só, com as pendências
 * NUMERADAS por prioridade — o gerente lê de cima para baixo e sabe o que
 * atacar primeiro, em vez de escanear caixas coloridas concorrentes.
 */
export type AttentionTone = 'danger' | 'warning' | 'info';

export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  /** Frase curta e acionável. */
  text: string;
  href: string;
}

/** Ordem de ataque: crítico primeiro. */
const RANK: Record<AttentionTone, number> = { danger: 0, warning: 1, info: 2 };

const numberTone: Record<AttentionTone, string> = {
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
  info: 'bg-info-bg text-info',
};

export function AttentionCard({ items, emptyText }: { items: AttentionItem[]; emptyText?: string }) {
  if (items.length === 0) {
    // Sem pendência: confirmação calma (ou nada, se a tela não quiser ruído).
    if (!emptyText) return null;
    return (
      <section className="flex items-center gap-2 rounded-card border border-line bg-sgo-success-bg px-4 py-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-sgo-success" aria-hidden />
        <p className="text-[14px] font-medium text-ink-900">{emptyText}</p>
      </section>
    );
  }
  const ordered = [...items].sort((a, b) => RANK[a.tone] - RANK[b.tone]);

  return (
    <section className="overflow-hidden rounded-card border border-line bg-sgo-surface">
      <div className="flex items-baseline justify-between gap-2 px-4 pb-2 pt-3">
        <h2 className="text-[15px] font-semibold text-ink-900">Precisa da sua atenção</h2>
        <span className="text-[13px] tabular-nums text-ink-500">
          {ordered.length} {ordered.length === 1 ? 'item' : 'itens'}
        </span>
      </div>
      <ul>
        {ordered.map((item, i) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={cn(
                'relative flex min-h-16 items-center gap-3 px-4 py-3 outline-none transition-colors duration-sgo-1 ease-sgo-std',
                "after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-line after:content-['']",
                'last:after:hidden hover:bg-sunken focus-visible:shadow-sgo-focus motion-reduce:transition-none',
              )}
            >
              {/* A prioridade é o número — não depende da cor (DoD). */}
              <span
                aria-hidden
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-[13px] font-bold tabular-nums',
                  numberTone[item.tone],
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-[14px] leading-5 text-ink-900">
                <span className="sr-only">Prioridade {i + 1}: </span>
                {item.text}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
