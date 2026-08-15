'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NotifItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  critical: boolean;
  module: string | null;
  createdAt: string;
}

type Cat = 'ALL' | 'PAYMENTS' | 'PEOPLE' | 'OPS' | 'OTHER';

/** Agrupa os módulos das notificações em categorias amigáveis (16/07). */
function categoryOf(module: string | null): Exclude<Cat, 'ALL'> {
  const m = (module ?? '').toUpperCase();
  if (m === 'PAYMENTS') return 'PAYMENTS';
  if (['PEOPLE', 'SCHEDULE', 'CERTIFICATES', 'TRAININGS', 'TRAINING', 'TERMINATIONS'].includes(m)) return 'PEOPLE';
  if (['TASKS', 'WASTE', 'COMMANDS', 'OCCURRENCES', 'NOTES', 'GAS', 'OIL', 'CASH', 'INVENTORY', 'MAINTENANCE', 'CANCELLATIONS'].includes(m)) return 'OPS';
  return 'OTHER';
}

const CAT_LABEL: { key: Cat; label: string }[] = [
  { key: 'ALL', label: 'Todas' },
  { key: 'PAYMENTS', label: '💳 Pagamentos' },
  { key: 'PEOPLE', label: '👥 Pessoal' },
  { key: 'OPS', label: '🍽️ Operação' },
  { key: 'OTHER', label: 'Outros' },
];

export function NotificationsList({ items }: { items: NotifItem[] }) {
  const router = useRouter();
  const [cat, setCat] = useState<Cat>('ALL');

  async function read(id?: string) {
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id } : { all: true }) });
    router.refresh();
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of items) { const k = categoryOf(n.module); c[k] = (c[k] ?? 0) + 1; }
    return c;
  }, [items]);
  const filtered = cat === 'ALL' ? items : items.filter((n) => categoryOf(n.module) === cat);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {CAT_LABEL.map((c) => {
          const n = c.key === 'ALL' ? items.length : (counts[c.key] ?? 0);
          return (
            <button key={c.key} onClick={() => setCat(c.key)} className={cn('rounded-full border px-3 py-1.5 text-sm font-medium', cat === c.key ? 'bg-sgo-brand text-on-brand border-sgo-brand' : 'text-ink-500')}>
              {c.label} <span className="text-xs opacity-80">({n})</span>
            </button>
          );
        })}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => read()}><CheckCheck className="h-4 w-4" /> Marcar todas como lidas</Button>
      </div>
      {filtered.length === 0 && <p className="text-sm text-ink-500">Nenhuma notificação nesta categoria.</p>}
      {filtered.map((n) => (
        <div key={n.id} className={cn('rounded-lg border bg-sgo-surface p-3', !n.read && 'border-sgo-brand/50 bg-sgo-brand/5', n.critical && 'border-danger/50 bg-danger/5')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cn('font-semibold', n.read ? 'text-ink-900' : 'text-sgo-brand')}>{n.title}</p>
              {n.body && <p className="text-sm text-ink-500">{n.body}</p>}
              <p className="mt-1 text-xs text-ink-500">{new Date(n.createdAt).toLocaleString('pt-BR')}</p>
              {n.link && <Link href={n.link} className="text-xs font-semibold text-sgo-brand underline">Abrir</Link>}
            </div>
            {!n.read && (
              <button onClick={() => read(n.id)} aria-label="Marcar como lida" className="shrink-0 text-sgo-success"><Check className="h-5 w-5" /></button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
