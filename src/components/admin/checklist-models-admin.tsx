'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save, ChevronUp, ChevronDown, Camera, Download, Printer, Upload, Eye } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { postAdmin } from '@/lib/admin-client';

interface MItem { section: string | null; text: string; requiresPhoto: boolean }
export interface ModelRow { id: string; name: string; category: string | null; moment: string | null; scope: 'UNIT' | 'MANAGER'; limitTime: string | null; weight: number; requiresEvidence: boolean; active: boolean; builtin: boolean; items: MItem[] }


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
      <Toolbar />

      {creating
        ? <ModelForm onDone={() => { setCreating(false); router.refresh(); }} onCancel={() => setCreating(false)} />
        : <Button variant="gold" className="w-full" onClick={() => setCreating(true)}><Plus className="h-5 w-5" /> Novo modelo</Button>}

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou setor…" className="h-9 text-sm" />

      {groups.map(([cat, list]) => (
        <div key={cat}>
          <p className="mb-1 mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-900">{cat} ({list.length})</p>
          <div className="space-y-2">
            {list.map((m) => <ModelItemRow key={m.id} m={m} onChange={() => router.refresh()} />)}
          </div>
        </div>
      ))}
      {models.length === 0 && <p className="text-sm text-ink-500">Nenhum modelo cadastrado.</p>}
    </div>
  );
}

function Toolbar() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onImport(file: File) {
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.set('file', file);
      const res = await fetch('/api/checklist-models/import', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha na importação'); return; }
      setMsg(`Importado: ${data.created} novo(s), ${data.updated} atualizado(s).`);
      router.refresh();
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  return (
    <div className="rounded-lg border border-dashed p-2">
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/checklist-models/export" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand"><Download className="h-4 w-4" /> Exportar (Excel)</a>
        <Link href="/configuracoes/modelos/imprimir" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand"><Printer className="h-4 w-4" /> Imprimir (PDF)</Link>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {busy ? 'Importando…' : 'Importar (Excel)'}</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
      </div>
      <p className="mt-1 text-[11px] text-ink-500">Exporte, edite a planilha (altere/adicione modelos e etapas) e importe de volta — a biblioteca é atualizada em lote (casamento por nome do modelo; não exclui ausentes).</p>
      {msg && <p className="mt-1 text-sm font-medium text-success">{msg}</p>}
    </div>
  );
}

function ModelItemRow({ m, onChange }: { m: ModelRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
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
    <div className="rounded-lg border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => { if (!editing) setViewing((v) => !v); }} className="min-w-0 flex-1 text-left">
          <p className="flex items-center gap-1 font-semibold text-ink-900">{m.moment ?? m.name}{!editing && <Eye className="h-3.5 w-3.5 text-ink-500" />}</p>
          <p className="text-xs text-ink-500">{m.scope === 'MANAGER' ? 'individual' : 'da unidade'} · peso {m.weight} · {m.limitTime ? `limite ${m.limitTime}` : 'sem horário'} · {m.items.length} item(ns){m.requiresEvidence ? ' · foto' : ''}</p>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={toggle}><StatusBadge tone={m.active ? 'success' : 'critical'}>{m.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing((v) => !v); setViewing(false); }} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={remove} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {viewing && !editing && (
        <div className="mt-2 rounded-lg bg-sunken/40 p-2">
          {m.category && <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-900">{m.category}{m.moment ? ` · ${m.moment}` : ''}</p>}
          <ul className="space-y-1">
            {m.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded border-2 border-line-strong" />
                <span>{it.text}{it.requiresPhoto && <Camera className="ml-1 inline h-3.5 w-3.5 text-ink-900" />}</span>
              </li>
            ))}
            {m.items.length === 0 && <li className="text-xs text-ink-500">Sem itens.</li>}
          </ul>
        </div>
      )}

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
        <Select
          label="Escopo" size="sm" value={scope}
          onValueChange={(v) => setScope(v as 'UNIT' | 'MANAGER')}
          options={[{ value: 'UNIT', label: 'Da unidade' }, { value: 'MANAGER', label: 'Individual' }]}
        />
        <div><Label className="text-xs">Peso na meta</Label><Input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-10 text-sm" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={noTime} onChange={(e) => setNoTime(e.target.checked)} /> Sem horário</label>
        {!noTime && <span className="flex items-center gap-1"><Label className="text-xs">Limite</Label><Input value={limitTime} onChange={(e) => setLimitTime(e.target.value)} placeholder="23:00" className="h-9 w-24 text-sm" /></span>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={requiresEvidence} onChange={(e) => setRequiresEvidence(e.target.checked)} /> Exige foto</label>
      </div>

      <div className="rounded-lg bg-surface/60 p-2">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-500">Itens / etapas — use ↑ ↓ para ordenar</p>
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-1 rounded-md border bg-surface p-1.5">
              <div className="flex shrink-0 flex-col">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-ink-500 hover:text-brand disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="text-ink-500 hover:text-brand disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 space-y-1">
                <Input value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} placeholder="O que verificar" className="h-9 text-sm" />
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={it.requiresPhoto} onChange={(e) => setItem(i, { requiresPhoto: e.target.checked })} /> <Camera className="h-3.5 w-3.5" /> Exige foto neste item</label>
              </div>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => removeItem(i)} aria-label="Remover"><X className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={addItem}><Plus className="h-4 w-4" /> Adicionar item</Button>
      </div>

      {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy} onClick={submit}><Save className="h-4 w-4" /> {edit ? 'Salvar' : 'Criar modelo'}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}
