'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

export interface InvItem {
  id: string;
  unit: string;
  category: string;
  date: string;
  responsible: string | null;
  status: 'PENDING' | 'DONE' | 'MISSED';
  confirmedBy: string | null;
}
const ST: Record<InvItem['status'], { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Pendente', tone: 'medium' },
  DONE: { label: 'Realizado', tone: 'success' },
  MISSED: { label: 'Não realizado', tone: 'critical' },
};

export function InventoryClient({ items }: { items: InvItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function confirm(id: string) {
    const obs = prompt('Observação (opcional):') ?? '';
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/${id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ observation: obs }) });
      if (res.ok) router.refresh();
    } finally { setBusy(false); }
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nenhum inventário agendado.</p>;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-brand">{i.category}</p>
            <StatusBadge tone={ST[i.status].tone}>{ST[i.status].label}</StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground">{i.unit} · {i.date}{i.responsible ? ` · resp. ${i.responsible}` : ''}{i.confirmedBy ? ` · por ${i.confirmedBy}` : ''}</p>
          {i.status === 'PENDING' && (
            <Button size="sm" className="mt-2" disabled={busy} onClick={() => confirm(i.id)}><Check className="h-4 w-4" /> Confirmar realização</Button>
          )}
        </div>
      ))}
    </div>
  );
}
