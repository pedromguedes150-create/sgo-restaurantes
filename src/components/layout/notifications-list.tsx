'use client';

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
  createdAt: string;
}

export function NotificationsList({ items }: { items: NotifItem[] }) {
  const router = useRouter();

  async function read(id?: string) {
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id } : { all: true }) });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => read()}><CheckCheck className="h-4 w-4" /> Marcar todas como lidas</Button>
      </div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma notificação.</p>}
      {items.map((n) => (
        <div key={n.id} className={cn('rounded-lg border bg-card p-3', !n.read && 'border-accent/50 bg-accent/5', n.critical && 'border-critical/50 bg-critical/5')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cn('font-semibold', n.read ? 'text-foreground' : 'text-brand')}>{n.title}</p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString('pt-BR')}</p>
              {n.link && <Link href={n.link} className="text-xs font-semibold text-accent underline">Abrir</Link>}
            </div>
            {!n.read && (
              <button onClick={() => read(n.id)} aria-label="Marcar como lida" className="shrink-0 text-success"><Check className="h-5 w-5" /></button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
