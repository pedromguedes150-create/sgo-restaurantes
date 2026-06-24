'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save, ChevronUp, ChevronDown, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';

interface MItem { section: string | null; text: string; requiresPhoto: boolean }
export interface ModelRow { id: string; name: string; category: string | null; moment: string | null; scope: 'UNIT' | 'MANAGER'; limitTime: string | null; weight: number; requiresEvidence: boolean; active: boolean; builtin: boolean; items: MItem[] }

const sel = 'h-10 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

export function ChecklistModelsAdmin({ models }: { models: ModelRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');

  const shown = q ? models.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) || (m.category ?? '').toLowerCase().includes(q.toLowerCase())) : models;
  const groups = useMemo(() => {
    const g = new Map<string, ModelRow[]>();
    for (const m of shown) { const k = m.category || 'Outros'; g.set(k, [...(g.get(k) ?? []), m]); }
    return [...g.entries()];
  }, [shown]);

  return (
    <div className="space-y-3">
      {creating
        ? <ModelForm onDone={() => { setCreating(false); router.refresh(); }} onCancel={() => setCreating(false)} />
        : <Button variant="gold" className="w-full" onClick={() => setCreating(true)}><Plus className="h-5 w-5" /> Novo modelo</Button>}

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou setor…" className="h-9 text-sm" />

      {groups.map(([cat, list]) => (
        <div key={cat}>
          <p className="mb-1 mt-1 text-[11px] font-bold uppercase tracking-wide text-accent">{cat} ({list.length})</p>
          <div className="space-y-2">
            {list.map((m) => <ModelItemRow key={m.id} m={m} onChange={() => router.refresh()} />)}
          </div>
        </div>
      ))}
      {models.length === 0 && <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado.</p>}
    </div>
  );
}

function ModelItemRow({ m, onChange }: { m: ModelRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  async function toggle() { await postAdmin({ entity: 'checklistModel', action: 'toggle', id: m.id, active: !m.active }); onChange(); }
  async function remove() {
    if (!confirm(`Excluir o modelo "${m.name}"? (não afeta checklists já criados nas unidades)`)) return;
    setBusy(true);
    const r = await postAdmin({ entity: 'checklistModel', action: 'delete', id: m.id });
    setBusy(false);
    if (r.ok) onChange(); else alert(r.error ?? 'Falha');
  }
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-brand">{m.moment ?? m.name}</p>
          <p className="text-xs text-muted-foreground">{m.scope === 'MANAGER' ? 'individual' : 'da unidade'} · peso {m.weight} · {m.limitTime ? `limite ${m.limitTime}` : 'sem horário'} · {m.items.length} item(ns){m.requiresEvidence ? ' · foto' : ''}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggle}><StatusBadge tone={m.active ? 'success' : 'critical'}>{m.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={remove} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {editing && <div className="mt-2"><ModelForm edit={m} onDone={() => { setEditing(false); onChange(); }} onCancel={() => setEditing(false)} /></div>}
    </div>
  );
}

function ModelForm({ edit, onDone, onCancel }: { edit?: ModelRow; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(edit?.name ?? '');
  const [category, setCategory] = useState(edit?.category ?? '');
  const [moment, setMoment] = useState(edit?.moment ?? '');
  const [scope, setScope] = useState<'UNIT' | 'MANAGER'>(edit?.scope ?? 'UNIT');
  const [noTime, setNoTime] = useState(edit ? edit.limitTime === null : true);
  const [limitTime, setLimitTime] = useState(edit?.limitTime ?? '23:00');
  const [weight, setWeight] = useState(String(edit?.weight ?? 10));
  const [requiresEvidence, setRequiresEvidence] = useState(edit?.requiresEvidence ?? false);
  const [items, setItems] = useState<MItem[]>(edit?.items ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setItem(i: number, patch: Partial<MItem>) { setItems((a) => a.map((it, idx) => idx === i ? { ...it, ...patch } : it)); }
  function addItem() { setItems((a) => [...a, { section: null, text: '', requiresPhoto: false }]); }
  function removeItem(i: number) { setItems((a) => a.filter((_, idx) => idx !== i)); }
  function move(i: number, d: -1 | 1) { setItems((a) => { const j = i + d; if (j < 0 || j >= a.length) return a; const n = [...a]; [n[i], n[j]] = [n[j], n[i]]; return n; }); }

  async function submit() {
    if (!name.trim()) { setMsg('Informe o nome.'); return; }
    setBusy(true); setMsg(null);
    const payload = {
      name, category, moment, scope, weight: Number(weight), requiresEvidence,
      limitTime: noTime ? null : limitTime,
      items: items.filter((it) => it.text.trim()).map((it) => ({ section: it.section, text: it.text, requiresPhoto: it.requiresPhoto })),
    };
    const r = edit
      ? await postAdmin({ entity: 'checklistModel', action: 'update', id: edit.id, ...payload })
      : await postAdmin({ entity: 'checklistModel', action: 'create', ...payload });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    onDone();
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><Label className="text-xs">Nome do modelo</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" placeholder="ex: Cozinha — Abertura" /></div>
        <div><Label className="text-xs">Setor</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 text-sm" placeholder="ex: Cozinha" /></div>
        <div><Label className="text-xs">Momento</Label><Input value={moment} onChange={(e) => setMoment(e.target.value)} className="h-10 text-sm" placeholder="Abertura / Fechamento…" /></div>
        <div>
          <Label className="text-xs">Escopo</Label>
          <select className={sel} value={scope} onChange={(e) => setScope(e.target.value as 'UNIT' | 'MANAGER')}>
            <option value="UNIT">Da unidade</option><option value="MANAGER">Individual</option>
          </select>
        </div>
        <div><Label className="text-xs">Peso na meta</Label><Input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-10 text-sm" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={noTime} onChange={(e) => setNoTime(e.target.checked)} /> Sem horário</label>
        {!noTime && <span className="flex items-center gap-1"><Label className="text-xs">Limite</Label><Input value={limitTime} onChange={(e) => setLimitTime(e.target.value)} placeholder="23:00" className="h-9 w-24 text-sm" /></span>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={requiresEvidence} onChange={(e) => setRequiresEvidence(e.target.checked)} /> Exige foto</label>
      </div>

      <div className="rounded-lg bg-background/60 p-2">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Itens / etapas — use ↑ ↓ para ordenar</p>
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-1 rounded-md border bg-card p-1.5">
              <div className="flex shrink-0 flex-col">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-brand disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="text-muted-foreground hover:text-brand disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 space-y-1">
                <Input value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} placeholder="O que verificar" className="h-9 text-sm" />
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={it.requiresPhoto} onChange={(e) => setItem(i, { requiresPhoto: e.target.checked })} /> <Camera className="h-3.5 w-3.5" /> Exige foto neste item</label>
              </div>
              <Button size="sm" variant="ghost" className="text-critical" onClick={() => removeItem(i)} aria-label="Remover"><X className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={addItem}><Plus className="h-4 w-4" /> Adicionar item</Button>
      </div>

      {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy} onClick={submit}><Save className="h-4 w-4" /> {edit ? 'Salvar' : 'Criar modelo'}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}
