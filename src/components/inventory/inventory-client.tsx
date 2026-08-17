'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';
import { Group } from '@/components/ui/ds/group';

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
        <p className="text-sm text-ink-500">Nenhum inventário agendado.</p>
      ) : (
        <Group>
          {items.map((i) => (
            <div key={i.id} className="p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink-900">{i.category}</p>
                <StatusBadge tone={ST[i.status].tone}>{ST[i.status].label}</StatusBadge>
              </div>
              <p className="text-xs text-ink-500">{i.unit} · {i.date}{i.responsible ? ` · resp. ${i.responsible}` : ''}{i.confirmedBy ? ` · por ${i.confirmedBy}` : ''}</p>
              <div className="mt-2 flex items-center gap-2">
                {i.status === 'PENDING' && (
                  <Button size="sm" disabled={busy} onClick={() => confirm(i.id)}><Check className="h-4 w-4" /> Confirmar realização</Button>
                )}
                {isAdmin && <DeleteOpButton entity="inventory" id={i.id} label={`o inventário de ${i.category} (${i.date})`} />}
              </div>
            </div>
          ))}
        </Group>
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
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Agendar inventário (Admin)</h2>
      <div className="space-y-2">
        <Select label="Unidade" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Categoria</Label><Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="ex: Bebidas" /></div>
          <DatePicker label="Data" value={scheduledDate || null} onValueChange={(v) => setScheduledDate(v ?? '')} />
        </div>
        <Button onClick={submit} disabled={busy} className="w-full"><Plus className="h-4 w-4" /> Agendar</Button>
        {msg && <p className="text-sm font-medium text-ink-500">{msg}</p>}
      </div>
    </div>
  );
}
