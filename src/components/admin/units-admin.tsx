'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, Save, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';

export interface UnitRow { id: string; name: string; code: string; address: string | null; cutoffHour: number; timezone: string; active: boolean; rhUnitName: string | null }

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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed p-3">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Nova unidade</h2>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Sigla (code)</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex: KM13" /></div>
          <div className="col-span-2"><Label>Endereço</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><Label>Hora de corte (0-23)</Label><Input inputMode="numeric" value={cutoffHour} onChange={(e) => setCutoffHour(e.target.value)} /></div>
        </div>
        {msg && <p className="mt-2 text-sm font-medium text-critical">{msg}</p>}
        <Button onClick={create} disabled={busy} className="mt-2 w-full"><Plus className="h-4 w-4" /> Criar unidade</Button>
      </div>

      <div className="space-y-3">
        {units.map((u) => <UnitItem key={u.id} unit={u} onChange={() => router.refresh()} />)}
      </div>
    </div>
  );
}

function UnitItem({ unit, onChange }: { unit: UnitRow; onChange: () => void }) {
  const [rhName, setRhName] = useState(unit.rhUnitName ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(unit.name);
  const [address, setAddress] = useState(unit.address ?? '');
  const [cutoffHour, setCutoffHour] = useState(String(unit.cutoffHour));
  const [timezone, setTimezone] = useState(unit.timezone);

  async function saveRh() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'unit', action: 'update', id: unit.id, rhUnitName: rhName });
    setBusy(false);
    setMsg(r.ok ? 'Nome no RH salvo.' : (r.error ?? 'Falha'));
    if (r.ok) onChange();
  }
  async function saveEdit() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'unit', action: 'update', id: unit.id, name, address, cutoffHour: Number(cutoffHour), timezone });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setEditing(false); onChange();
  }
  async function toggle() {
    await postAdmin({ entity: 'unit', action: 'update', id: unit.id, active: !unit.active });
    onChange();
  }
  async function remove() {
    if (!confirm(`Excluir a unidade "${unit.name}"? Só é possível se não houver nenhum dado operacional (tarefas, lançamentos, etc.). Caso contrário, inative-a.`)) return;
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'unit', action: 'delete', id: unit.id });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    onChange();
  }
  async function sync() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/rh/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId: unit.id }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Sincronizado: ${data.total} colaborador(es) (${data.created} novos, ${data.updated} atualizados).` : (data.error ?? 'Falha'));
      if (res.ok) onChange();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-brand">{unit.name} <span className="text-xs font-normal text-muted-foreground">({unit.code})</span></p>
        <div className="flex items-center gap-1">
          <button onClick={toggle}><StatusBadge tone={unit.active ? 'success' : 'critical'}>{unit.active ? 'Ativa' : 'Inativa'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={remove} aria-label="Excluir" className="text-critical"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">corte {String(unit.cutoffHour).padStart(2, '0')}:00 · {unit.timezone}</p>

      {editing && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2">
          <div className="col-span-2"><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs">Endereço</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">Hora de corte (0-23)</Label><Input inputMode="numeric" value={cutoffHour} onChange={(e) => setCutoffHour(e.target.value)} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">Fuso</Label><Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-10 text-sm" /></div>
          <Button size="sm" className="col-span-2" disabled={busy} onClick={saveEdit}><Save className="h-4 w-4" /> Salvar alterações</Button>
        </div>
      )}

      <div className="mt-2">
        <Label className="text-xs">Nome no RH (razão social)</Label>
        <div className="mt-1 flex gap-2">
          <Input value={rhName} onChange={(e) => setRhName(e.target.value)} placeholder="ex: RESTAURANTE BEIJA FLOR KM 13 LTDA" className="h-10 text-sm" />
          <Button size="sm" variant="outline" disabled={busy} onClick={saveRh} aria-label="Salvar"><Save className="h-4 w-4" /></Button>
          <Button size="sm" disabled={busy || !unit.rhUnitName} onClick={sync} aria-label="Sincronizar"><RefreshCw className="h-4 w-4" /> Sincronizar</Button>
        </div>
        {msg && <p className="mt-1 text-xs font-medium text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}
