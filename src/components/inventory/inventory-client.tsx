'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export function InventoryClient({ items, units, isAdmin }: { items: InvItem[]; units: { id: string; name: string }[]; isAdmin: boolean }) {
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

  return (
    <div className="space-y-4">
      {isAdmin && <ScheduleForm units={units} onDone={() => router.refresh()} />}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum inventário agendado.</p>
      ) : (
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
      )}
    </div>
  );
}

function ScheduleForm({ units, onDone }: { units: { id: string; name: string }[]; onDone: () => void }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [categoryName, setCategoryName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!unitId || !categoryName.trim() || !scheduledDate) { setMsg('Preencha unidade, categoria e data.'); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, categoryName, scheduledDate }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      setCategoryName(''); setScheduledDate('');
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Agendar inventário (Admin)</h2>
      <div className="space-y-2">
        <div>
          <Label>Unidade</Label>
          <select className="h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Categoria</Label><Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="ex: Bebidas" /></div>
          <div><Label>Data</Label><Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} /></div>
        </div>
        <Button onClick={submit} disabled={busy} className="w-full"><Plus className="h-4 w-4" /> Agendar</Button>
        {msg && <p className="text-sm font-medium text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}
