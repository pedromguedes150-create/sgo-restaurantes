'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';

export interface UnitRow { id: string; name: string; code: string; cutoffHour: number; timezone: string; active: boolean }

export function UnitsAdmin({ units }: { units: UnitRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [cutoffHour, setCutoffHour] = useState('4');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'unit', action: 'create', name, code, address, cutoffHour: Number(cutoffHour) });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setName(''); setCode(''); setAddress(''); router.refresh();
  }

  async function toggle(u: UnitRow) {
    await postAdmin({ entity: 'unit', action: 'update', id: u.id, active: !u.active });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed p-3">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Nova unidade</h2>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Sigla (code)</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex: CENTRO" /></div>
          <div className="col-span-2"><Label>Endereço</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><Label>Hora de corte (0-23)</Label><Input inputMode="numeric" value={cutoffHour} onChange={(e) => setCutoffHour(e.target.value)} /></div>
        </div>
        {msg && <p className="mt-2 text-sm font-medium text-critical">{msg}</p>}
        <Button onClick={create} disabled={busy} className="mt-2 w-full"><Plus className="h-4 w-4" /> Criar unidade</Button>
      </div>

      <div className="space-y-2">
        {units.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
            <div>
              <p className="font-semibold text-brand">{u.name} <span className="text-xs font-normal text-muted-foreground">({u.code})</span></p>
              <p className="text-xs text-muted-foreground">corte {String(u.cutoffHour).padStart(2, '0')}:00 · {u.timezone}</p>
            </div>
            <button onClick={() => toggle(u)}>
              <StatusBadge tone={u.active ? 'success' : 'critical'}>{u.active ? 'Ativa' : 'Inativa'}</StatusBadge>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
