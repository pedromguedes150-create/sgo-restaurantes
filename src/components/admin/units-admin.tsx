'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, Save, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';

export interface UnitRow { id: string; name: string; code: string; address: string | null; cutoffHour: number; timezone: string; active: boolean; rhUnitName: string | null; cnpj: string | null }

/** Formata 14 dígitos como CNPJ; devolve o valor cru se não tiver 14 dígitos. */
function formatCnpj(d: string | null): string | null {
  if (!d) return null;
  const s = d.replace(/\D/g, '');
  return s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
}

export function UnitsAdmin({ units }: { units: UnitRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [cutoffHour, setCutoffHour] = useState('4');
  const [cnpj, setCnpj] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'unit', action: 'create', name, code, address, cutoffHour: Number(cutoffHour), cnpj });
    setBusy(false);
    if (!r.ok) { setMsg(r.error === 'INVALID' ? 'Verifique os campos (CNPJ, se preenchido, precisa ter 14 dígitos).' : (r.error ?? 'Falha')); return; }
    setName(''); setCode(''); setAddress(''); setCnpj(''); router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed p-3">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Nova unidade</h2>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Sigla (code)</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex: KM13" /></div>
          <div className="col-span-2"><Label>Endereço</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><Label>Hora de corte (0-23)</Label><Input inputMode="numeric" value={cutoffHour} onChange={(e) => setCutoffHour(e.target.value)} /></div>
          <div><Label>CNPJ <span className="font-normal text-ink-500">(casa notas de gás)</span></Label><Input inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" /></div>
        </div>
        {msg && <p className="mt-2 text-sm font-medium text-danger">{msg}</p>}
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
  const [cnpj, setCnpj] = useState(unit.cnpj ?? '');

  async function saveRh() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'unit', action: 'update', id: unit.id, rhUnitName: rhName });
    setBusy(false);
    setMsg(r.ok ? 'Nome no RH salvo.' : (r.error ?? 'Falha'));
    if (r.ok) onChange();
  }
  async function saveEdit() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'unit', action: 'update', id: unit.id, name, address, cutoffHour: Number(cutoffHour), timezone, cnpj });
    setBusy(false);
    if (!r.ok) { setMsg(r.error === 'INVALID' ? 'CNPJ, se preenchido, precisa ter 14 dígitos.' : (r.error ?? 'Falha')); return; }
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
    <div className="rounded-lg border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink-900">{unit.name} <span className="text-xs font-normal text-ink-500">({unit.code})</span></p>
        <div className="flex items-center gap-1">
          <button onClick={toggle}><StatusBadge tone={unit.active ? 'success' : 'critical'}>{unit.active ? 'Ativa' : 'Inativa'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={remove} aria-label="Excluir" className="text-danger"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="text-xs text-ink-500">corte {String(unit.cutoffHour).padStart(2, '0')}:00 · {unit.timezone}</p>
      <p className="text-xs">{unit.cnpj ? <span className="text-ink-500">CNPJ {formatCnpj(unit.cnpj)}</span> : <span className="font-medium text-danger">Sem CNPJ — necessário para importar notas de gás</span>}</p>

      {editing && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-sunken/40 p-2">
          <div className="col-span-2"><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs">Endereço</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">Hora de corte (0-23)</Label><Input inputMode="numeric" value={cutoffHour} onChange={(e) => setCutoffHour(e.target.value)} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">Fuso</Label><Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-10 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs">CNPJ <span className="font-normal text-ink-500">(casa notas de gás por CNPJ)</span></Label><Input inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="h-10 text-sm" /></div>
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
        {msg && <p className="mt-1 text-xs font-medium text-ink-500">{msg}</p>}
      </div>
    </div>
  );
}
