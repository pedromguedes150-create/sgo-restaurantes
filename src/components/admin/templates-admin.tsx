'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';

export interface TplRow { id: string; unitId: string; name: string; limitTime: string; weight: number; module: string; requiresEvidence: boolean; entersMeta: boolean; active: boolean }
interface Unit { id: string; name: string }

const MODULES = [
  { value: 'GENERAL', label: 'Geral' },
  { value: 'WASTE', label: 'Desperdícios' },
  { value: 'COMMANDS', label: 'Comandas' },
  { value: 'CANCELLATIONS', label: 'Cancelamentos' },
  { value: 'INVENTORY', label: 'Inventário' },
  { value: 'OCCURRENCES', label: 'Ocorrências' },
];

export function TemplatesAdmin({ units, templates }: { units: Unit[]; templates: TplRow[] }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [name, setName] = useState('');
  const [limitTime, setLimitTime] = useState('23:00');
  const [weight, setWeight] = useState('10');
  const [moduleV, setModuleV] = useState('GENERAL');
  const [requiresEvidence, setRequiresEvidence] = useState(false);
  const [entersMeta, setEntersMeta] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const list = useMemo(() => templates.filter((t) => t.unitId === unitId), [templates, unitId]);
  const sumWeight = list.filter((t) => t.active && t.entersMeta).reduce((s, t) => s + t.weight, 0);
  const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

  async function create() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'template', action: 'create', unitId, name, limitTime, weight: Number(weight), module: moduleV, requiresEvidence, entersMeta });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setName(''); router.refresh();
  }
  async function toggle(t: TplRow) {
    await postAdmin({ entity: 'template', action: 'toggle', id: t.id, active: !t.active });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Unidade</Label>
        <select className={sel} value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </div>

      <div className="rounded-lg border border-dashed p-3">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Nova tarefa do checklist</h2>
        <div className="space-y-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Limite</Label><Input value={limitTime} onChange={(e) => setLimitTime(e.target.value)} placeholder="23:00" /></div>
            <div><Label>Peso</Label><Input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
            <div><Label>Módulo</Label><select className={sel} value={moduleV} onChange={(e) => setModuleV(e.target.value)}>{MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={requiresEvidence} onChange={(e) => setRequiresEvidence(e.target.checked)} /> Exige evidência</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={entersMeta} onChange={(e) => setEntersMeta(e.target.checked)} /> Entra na meta</label>
          </div>
          {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
          <Button onClick={create} disabled={busy} className="w-full"><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Soma dos pesos (ativos, na meta): <span className={sumWeight === 100 ? 'font-bold text-success' : 'font-bold text-medium'}>{sumWeight}</span> {sumWeight !== 100 && '(ideal: 100)'}</p>

      <div className="space-y-2">
        {list.map((t) => (
          <TplItem key={t.id} t={t} onChange={() => router.refresh()} onToggle={() => toggle(t)} />
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa nesta unidade.</p>}
      </div>
    </div>
  );
}

function TplItem({ t, onChange, onToggle }: { t: TplRow; onChange: () => void; onToggle: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  const [limitTime, setLimitTime] = useState(t.limitTime);
  const [weight, setWeight] = useState(String(t.weight));
  const [moduleV, setModuleV] = useState(t.module);
  const [requiresEvidence, setRequiresEvidence] = useState(t.requiresEvidence);
  const [entersMeta, setEntersMeta] = useState(t.entersMeta);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

  async function save() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'template', action: 'update', id: t.id, name, limitTime, weight: Number(weight), module: moduleV, requiresEvidence, entersMeta });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setEditing(false); onChange();
  }
  async function remove() {
    if (!confirm(`Excluir a tarefa "${t.name}"? Só é possível se ela nunca tiver gerado execuções. Caso contrário, inative-a.`)) return;
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'template', action: 'delete', id: t.id });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    onChange();
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-brand">{t.name}</p>
          <p className="text-xs text-muted-foreground">limite {t.limitTime} · peso {t.weight} · {MODULES.find((m) => m.value === t.module)?.label}{t.requiresEvidence ? ' · foto' : ''}{t.entersMeta ? ' · meta' : ''}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onToggle}><StatusBadge tone={t.active ? 'success' : 'critical'}>{t.active ? 'Ativa' : 'Inativa'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={remove} aria-label="Excluir" className="text-critical"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {editing && (
        <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-2">
          <div><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Limite</Label><Input value={limitTime} onChange={(e) => setLimitTime(e.target.value)} className="h-10 text-sm" /></div>
            <div><Label className="text-xs">Peso</Label><Input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-10 text-sm" /></div>
            <div><Label className="text-xs">Módulo</Label><select className={sel} value={moduleV} onChange={(e) => setModuleV(e.target.value)}>{MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={requiresEvidence} onChange={(e) => setRequiresEvidence(e.target.checked)} /> Exige evidência</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={entersMeta} onChange={(e) => setEntersMeta(e.target.checked)} /> Entra na meta</label>
          </div>
          <Button size="sm" className="w-full" disabled={busy} onClick={save}><Save className="h-4 w-4" /> Salvar alterações</Button>
        </div>
      )}
      {msg && <p className="mt-1 text-sm font-medium text-critical">{msg}</p>}
    </div>
  );
}
