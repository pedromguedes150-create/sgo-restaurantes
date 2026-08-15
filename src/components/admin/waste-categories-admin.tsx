'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { postAdmin } from '@/lib/admin-client';

export interface WasteCatRow { id: string; name: string; active: boolean; measure: 'kg' | 'un' }

/** Escolha binária: pílula deslizante mostra as duas medidas de uma vez. */
const MEDIDAS = [{ value: 'kg' as const, label: 'kg' }, { value: 'un' as const, label: 'un' }];

export function WasteCategoriesAdmin({ categories }: { categories: WasteCatRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [measure, setMeasure] = useState<'kg' | 'un'>('kg');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'wasteCategory', action: 'create', name, measure });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setName(''); router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Categorias do lançamento de desperdícios. Medida <b>kg</b> = peso; <b>un</b> = unidades com sub-itens por produto (ex.: lanchonete).</p>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria (ex.: Carne, Salada, Sobremesa)" />
        <SegmentedControl
          aria-label="Medida da categoria" value={measure} onValueChange={setMeasure}
          options={MEDIDAS}
        />
        <Button disabled={busy} onClick={create}><Plus className="h-4 w-4" /> Adicionar</Button>
      </div>
      {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
      <div className="space-y-2">
        {categories.map((c) => <CatRow key={c.id} c={c} onChange={() => router.refresh()} />)}
        {categories.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria.</p>}
      </div>
    </div>
  );
}

function CatRow({ c, onChange }: { c: WasteCatRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [mEdit, setMEdit] = useState<'kg' | 'un'>(c.measure);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(payload: Record<string, unknown>, after?: () => void) {
    setBusy(true); setMsg(null);
    const r = await postAdmin(payload);
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    after?.(); onChange();
  }

  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <span className="flex flex-1 items-center gap-1.5"><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
          <SegmentedControl aria-label="Medida da categoria" size="sm" value={mEdit} onValueChange={setMEdit} options={MEDIDAS} /></span>
        ) : (
          <span className="font-medium text-brand">{c.name} <span className="text-xs text-muted-foreground">({c.measure})</span></span>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => call({ entity: 'wasteCategory', action: 'toggle', id: c.id, active: !c.active })}><StatusBadge tone={c.active ? 'success' : 'critical'}>{c.active ? 'Ativa' : 'Inativa'}</StatusBadge></button>
          {editing
            ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => call({ entity: 'wasteCategory', action: 'update', id: c.id, name, measure: mEdit }, () => setEditing(false))} aria-label="Salvar"><Save className="h-4 w-4" /></Button>
            : <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>}
          {editing
            ? <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(c.name); }} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
            : <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => { if (confirm(`Excluir a categoria "${c.name}"? Só é possível se não houver histórico; caso contrário, inative.`)) call({ entity: 'wasteCategory', action: 'delete', id: c.id }); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>
      {msg && <p className="mt-1 text-xs font-medium text-critical">{msg}</p>}
    </div>
  );
}
