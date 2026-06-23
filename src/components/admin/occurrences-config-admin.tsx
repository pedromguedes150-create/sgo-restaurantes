'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';

export interface OccCategoryRow { id: string; name: string; active: boolean }
export interface OccTypeRow { id: string; name: string; active: boolean; isMaintenance: boolean; categories: OccCategoryRow[] }

export function OccurrencesConfigAdmin({ types }: { types: OccTypeRow[] }) {
  const router = useRouter();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Tipos e categorias usados ao registrar uma ocorrência. Marque <strong>Manutenção</strong> para que ocorrências do tipo apareçam na sub-aba de Manutenção. A gravidade segue fixa em 4 níveis.</p>
      <div className="space-y-2">
        {types.map((t) => <TypeRow key={t.id} t={t} onChange={() => router.refresh()} />)}
        {types.length === 0 && <p className="text-sm text-muted-foreground">Nenhum tipo cadastrado.</p>}
      </div>
      <NewType onDone={() => router.refresh()} />
    </div>
  );
}

function TypeRow({ t, onChange }: { t: OccTypeRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  const [maint, setMaint] = useState(t.isMaintenance);
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
          <div className="flex flex-1 flex-col gap-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do tipo" className="h-9 text-sm" />
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={maint} onChange={(e) => setMaint(e.target.checked)} /> É tipo de manutenção</label>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-brand">{t.name}</p>
            {t.isMaintenance && <span className="inline-flex items-center gap-0.5 rounded bg-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-gold"><Wrench className="h-3 w-3" /> Manutenção</span>}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => call({ entity: 'occType', action: 'toggle', id: t.id, active: !t.active })}><StatusBadge tone={t.active ? 'success' : 'critical'}>{t.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          {editing
            ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => call({ entity: 'occType', action: 'update', id: t.id, name, isMaintenance: maint }, () => setEditing(false))} aria-label="Salvar"><Save className="h-4 w-4" /></Button>
            : <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>}
          {editing
            ? <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(t.name); setMaint(t.isMaintenance); }} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
            : <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => { if (confirm(`Excluir o tipo "${t.name}" e suas categorias?`)) call({ entity: 'occType', action: 'delete', id: t.id }); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>
      {msg && <p className="mt-1 text-xs font-medium text-critical">{msg}</p>}

      <div className="mt-2 space-y-1 border-l-2 border-muted pl-3">
        {t.categories.map((c) => <CategoryRow key={c.id} c={c} onChange={onChange} />)}
        <NewCategory typeId={t.id} onDone={onChange} />
      </div>
    </div>
  );
}

function CategoryRow({ c, onChange }: { c: OccCategoryRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [busy, setBusy] = useState(false);

  async function call(payload: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    const r = await postAdmin(payload);
    setBusy(false);
    if (r.ok) { after?.(); onChange(); }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      {editing
        ? <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1 text-sm" />
        : <span className="text-sm">{c.name}{!c.active && <span className="ml-1 text-xs text-muted-foreground">(inativa)</span>}</span>}
      <div className="flex items-center gap-1">
        <button onClick={() => call({ entity: 'occCategory', action: 'toggle', id: c.id, active: !c.active })}><StatusBadge tone={c.active ? 'success' : 'critical'}>{c.active ? 'Ativa' : 'Inativa'}</StatusBadge></button>
        {editing
          ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => call({ entity: 'occCategory', action: 'update', id: c.id, name }, () => setEditing(false))} aria-label="Salvar"><Save className="h-3.5 w-3.5" /></Button>
          : <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Editar"><Pencil className="h-3.5 w-3.5" /></Button>}
        {editing
          ? <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(c.name); }} aria-label="Cancelar"><X className="h-3.5 w-3.5" /></Button>
          : <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => { if (confirm(`Excluir a categoria "${c.name}"?`)) call({ entity: 'occCategory', action: 'delete', id: c.id }); }} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  );
}

function NewCategory({ typeId, onDone }: { typeId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await postAdmin({ entity: 'occCategory', action: 'create', typeId, name });
    setBusy(false);
    if (r.ok) { setName(''); onDone(); }
  }
  return (
    <div className="flex items-center gap-1 pt-1">
      <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Nova categoria…" className="h-8 flex-1 text-sm" />
      <Button size="sm" variant="ghost" disabled={busy} onClick={add} aria-label="Adicionar categoria"><Plus className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

function NewType({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [maint, setMaint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function add() {
    if (!name.trim()) { setMsg('Informe o nome.'); return; }
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'occType', action: 'create', name, isMaintenance: maint });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setName(''); setMaint(false); onDone();
  }
  return (
    <div className="rounded-lg border border-dashed p-2.5">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Novo tipo</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <div className="flex-1"><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Manutenção predial" className="h-9 text-sm" /></div>
          <Button size="sm" disabled={busy} onClick={add}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={maint} onChange={(e) => setMaint(e.target.checked)} /> É tipo de manutenção (aparece na sub-aba Manutenção)</label>
      </div>
      {msg && <p className="mt-1 text-xs font-medium text-critical">{msg}</p>}
    </div>
  );
}
