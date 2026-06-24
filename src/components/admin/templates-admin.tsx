'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save, ChevronUp, ChevronDown, Check, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';

export interface TplItem { section: string | null; text: string; requiresPhoto: boolean; aiCheck: boolean; standardDescription: string | null }
export interface TplRow {
  id: string; unitId: string; name: string; limitTime: string | null; weight: number;
  scope: 'UNIT' | 'MANAGER'; requiresEvidence: boolean; entersMeta: boolean; active: boolean;
  startDate: string | null; endDate: string | null; groupUnitIds: string[]; items: TplItem[];
}
interface Unit { id: string; name: string }
export interface ExampleOpt { name: string; scope: 'UNIT' | 'MANAGER'; limitTime: string | null; requiresEvidence: boolean; weight: number; itemCount: number; sections: string[] }

const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

export function TemplatesAdmin({ units, templates, examples = [] }: { units: Unit[]; templates: TplRow[]; examples?: ExampleOpt[] }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);

  const list = useMemo(() => templates.filter((t) => t.unitId === unitId), [templates, unitId]);
  const sumWeight = list.filter((t) => t.active && t.entersMeta).reduce((s, t) => s + t.weight, 0);
  const existingNames = useMemo(() => new Set(list.map((t) => t.name)), [list]);

  return (
    <div className="space-y-4">
      <div>
        <Label>Unidade (para ver os checklists)</Label>
        <select className={sel} value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </div>

      {creating ? (
        <ChecklistForm units={units} defaultUnitId={unitId} onDone={() => { setCreating(false); router.refresh(); }} onCancel={() => setCreating(false)} />
      ) : picking ? (
        <ExamplesPicker examples={examples} unitId={unitId} existingNames={existingNames} onDone={() => { setPicking(false); router.refresh(); }} onCancel={() => setPicking(false)} />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => setCreating(true)} variant="gold" className="flex-1"><Plus className="h-5 w-5" /> Novo checklist</Button>
          {examples.length > 0 && <Button variant="outline" disabled={!unitId} onClick={() => setPicking(true)}>Modelos prontos…</Button>}
        </div>
      )}

      <p className="text-xs text-muted-foreground">Soma dos pesos (ativos, na meta): <span className={sumWeight === 100 ? 'font-bold text-success' : 'font-bold text-medium'}>{sumWeight}</span> {sumWeight !== 100 && '(ideal: 100)'}</p>

      <div className="space-y-2">
        {list.map((t) => <TplItemRow key={t.id} t={t} units={units} onChange={() => router.refresh()} />)}
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum checklist nesta unidade.</p>}
      </div>
    </div>
  );
}

/* ───────── Seletor de modelos prontos ───────── */
function ExamplesPicker({ examples, unitId, existingNames, onDone, onCancel }: { examples: ExampleOpt[]; unitId: string; existingNames: Set<string>; onDone: () => void; onCancel: () => void }) {
  const available = examples.filter((e) => !existingNames.has(e.name));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  function toggle(name: string) { setSel((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; }); }

  async function create() {
    if (sel.size === 0) { setMsg('Selecione ao menos um modelo.'); return; }
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'template', action: 'seedExamples', unitId, names: [...sel] });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    onDone();
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Modelos prontos</h2>
        {available.length > 0 && <button className="text-xs font-semibold text-accent" onClick={() => setSel(sel.size === available.length ? new Set() : new Set(available.map((e) => e.name)))}>{sel.size === available.length ? 'Limpar' : 'Selecionar todos'}</button>}
      </div>
      <p className="text-xs text-muted-foreground">Marque os que quer criar nesta unidade. Você pode editá-los depois (itens, horário, datas…).</p>

      <div className="space-y-1.5">
        {examples.map((e) => {
          const exists = existingNames.has(e.name);
          const checked = sel.has(e.name);
          return (
            <button key={e.name} type="button" disabled={exists} onClick={() => toggle(e.name)}
              className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left ${exists ? 'cursor-not-allowed opacity-50' : checked ? 'border-primary bg-primary/5' : 'bg-card hover:border-accent'}`}>
              {exists ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : checked ? <CheckSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> : <Square className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-brand">{e.name}{exists && <span className="ml-1 text-xs font-normal text-success">já existe</span>}</span>
                <span className="block text-xs text-muted-foreground">
                  {e.scope === 'MANAGER' ? 'individual' : 'da unidade'} · peso {e.weight} · {e.limitTime ? `limite ${e.limitTime}` : 'sem horário'} · {e.itemCount} item(ns){e.requiresEvidence ? ' · foto' : ''}
                  {e.sections.length ? ` · ${e.sections.join(', ')}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy || sel.size === 0} onClick={create}><Plus className="h-4 w-4" /> Criar selecionados ({sel.size})</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ───────── Formulário de criação ───────── */
function ChecklistForm({ units, defaultUnitId, onDone, onCancel }: { units: Unit[]; defaultUnitId: string; onDone: () => void; onCancel: () => void }) {
  const f = useChecklistForm({ unitId: defaultUnitId, name: '', limitTime: '', noTime: false, weight: '10', scope: 'UNIT', requiresEvidence: false, entersMeta: true, startDate: '', endDate: '', items: [] });
  const [targetUnits, setTargetUnits] = useState<string[]>([defaultUnitId]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toggleUnit(id: string) { setTargetUnits((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]); }

  async function submit() {
    if (!f.name.trim() || targetUnits.length === 0) { setMsg('Informe nome e ao menos uma unidade.'); return; }
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'template', action: 'create', unitIds: targetUnits, ...f.payload() });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    onDone();
  }

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Novo checklist</h2>
      {f.fields}
      <div>
        <Label className="text-xs">Replicar para unidades</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {units.map((u) => (
            <button key={u.id} type="button" onClick={() => toggleUnit(u.id)} className={targetUnits.includes(u.id) ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</button>
          ))}
          <button type="button" onClick={() => setTargetUnits(units.map((u) => u.id))} className="rounded-full border px-3 py-1.5 text-sm font-medium hover:border-accent">Todas</button>
        </div>
      </div>
      {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy} className="flex-1">Publicar</Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ───────── Linha de checklist existente (editar/ativar/excluir) ───────── */
function TplItemRow({ t, units, onChange }: { t: TplRow; units: Unit[]; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const f = useChecklistForm({ unitId: t.unitId, name: t.name, limitTime: t.limitTime ?? '', noTime: t.limitTime === null, weight: String(t.weight), scope: t.scope, requiresEvidence: t.requiresEvidence, entersMeta: t.entersMeta, startDate: t.startDate ?? '', endDate: t.endDate ?? '', items: t.items });

  async function toggle() { await postAdmin({ entity: 'template', action: 'toggle', id: t.id, active: !t.active }); onChange(); }
  async function save() {
    if (!f.name.trim()) { setMsg('Informe o nome.'); return; }
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'template', action: 'update', id: t.id, ...f.payload() });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setEditing(false); onChange();
  }
  async function remove() {
    if (!confirm(`Excluir o checklist "${t.name}"?`)) return;
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'template', action: 'delete', id: t.id });
    setBusy(false);
    if (r.ok) { onChange(); return; }
    if (r.reason === 'BLOCKED') {
      // Tem histórico/execuções: oferece exclusão forçada (apaga tudo) — ideal p/ checklists de teste.
      if (confirm(`"${t.name}" já tem execuções (histórico/metas). Para INATIVAR, cancele e use o botão de status.\n\nClique OK para EXCLUIR DEFINITIVAMENTE o checklist e TODO o histórico/fotos dele (ideal para checklists de teste). Não pode ser desfeito.`)) {
        setBusy(true);
        const f = await postAdmin({ entity: 'template', action: 'delete', id: t.id, force: true });
        setBusy(false);
        if (f.ok) { onChange(); return; }
        setMsg(f.error ?? 'Falha');
      }
      return;
    }
    setMsg(r.error ?? 'Falha');
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-brand">{t.name}</p>
          <p className="text-xs text-muted-foreground">
            {t.limitTime ? `limite ${t.limitTime}` : 'sem horário'} · peso {t.weight} · {t.scope === 'MANAGER' ? 'individual' : 'da unidade'}
            {t.items.length > 0 ? ` · ${t.items.length} item(ns)` : ''}{t.requiresEvidence ? ' · foto' : ''}{t.entersMeta ? ' · meta' : ''}
            {t.startDate || t.endDate ? ` · 📅 ${t.startDate ?? '…'} → ${t.endDate ?? 'sem fim'}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggle}><StatusBadge tone={t.active ? 'success' : 'critical'}>{t.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={remove} aria-label="Excluir" className="text-critical"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 space-y-3 rounded-lg bg-muted/40 p-2">
          {f.fields}
          <Button size="sm" className="w-full" disabled={busy} onClick={save}><Save className="h-4 w-4" /> Salvar alterações</Button>
          <p className="text-[11px] text-muted-foreground">As alterações acima valem para este checklist nesta unidade. Para mudar em quais unidades ele aparece, use abaixo.</p>
          <UnitsEditor t={t} units={units} onChange={onChange} />
        </div>
      )}
      {msg && <p className="mt-1 text-sm font-medium text-critical">{msg}</p>}
    </div>
  );
}

/* ───────── Editor de unidades onde o checklist aparece ───────── */
function UnitsEditor({ t, units, onChange }: { t: TplRow; units: Unit[]; onChange: () => void }) {
  const [sel, setSel] = useState<string[]>(t.groupUnitIds);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  function toggle(id: string) { setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]); }

  async function save() {
    if (sel.length === 0) { setMsg('Selecione ao menos uma unidade.'); return; }
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'template', action: 'setUnits', id: t.id, unitIds: sel });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    onChange();
  }

  return (
    <div className="rounded-lg border border-dashed p-2">
      <Label className="text-xs">Unidades onde este checklist aparece</Label>
      <div className="mt-1 flex flex-wrap gap-2">
        {units.map((u) => (
          <button key={u.id} type="button" onClick={() => toggle(u.id)} className={sel.includes(u.id) ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</button>
        ))}
        <button type="button" onClick={() => setSel(units.map((u) => u.id))} className="rounded-full border px-3 py-1.5 text-sm font-medium hover:border-accent">Todas</button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Ao remover uma unidade com histórico, o checklist é inativado nela (preserva métricas); sem histórico, é excluído.</p>
      <Button size="sm" variant="outline" className="mt-2 w-full" disabled={busy} onClick={save}><Save className="h-4 w-4" /> Salvar unidades</Button>
      {msg && <p className="mt-1 text-sm font-medium text-critical">{msg}</p>}
    </div>
  );
}

/* ───────── Hook de formulário compartilhado (campos + itens) ───────── */
function useChecklistForm(init: { unitId: string; name: string; limitTime: string; noTime: boolean; weight: string; scope: 'UNIT' | 'MANAGER'; requiresEvidence: boolean; entersMeta: boolean; startDate: string; endDate: string; items: TplItem[] }) {
  const [name, setName] = useState(init.name);
  const [noTime, setNoTime] = useState(init.noTime);
  const [limitTime, setLimitTime] = useState(init.limitTime || '23:00');
  const [weight, setWeight] = useState(init.weight);
  const [scope, setScope] = useState<'UNIT' | 'MANAGER'>(init.scope);
  const [requiresEvidence, setRequiresEvidence] = useState(init.requiresEvidence);
  const [entersMeta, setEntersMeta] = useState(init.entersMeta);
  const [startDate, setStartDate] = useState(init.startDate);
  const [endDate, setEndDate] = useState(init.endDate);
  const [items, setItems] = useState<TplItem[]>(init.items);

  function setItem(i: number, patch: Partial<TplItem>) { setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it)); }
  function addItem() { setItems((arr) => [...arr, { section: null, text: '', requiresPhoto: false, aiCheck: false, standardDescription: null }]); }
  function removeItem(i: number) { setItems((arr) => arr.filter((_, idx) => idx !== i)); }
  function moveItem(i: number, dir: -1 | 1) {
    setItems((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function payload() {
    return {
      name, weight: Number(weight), scope, requiresEvidence, entersMeta,
      limitTime: noTime ? null : limitTime,
      startDate: startDate || null, endDate: endDate || null,
      items: items.filter((it) => it.text.trim()).map((it) => ({ section: it.section, text: it.text, requiresPhoto: it.requiresPhoto, aiCheck: it.aiCheck, standardDescription: it.standardDescription })),
    };
  }

  const fields = (
      <div className="space-y-2">
        <div><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Escopo</Label>
            <select className={sel} value={scope} onChange={(e) => setScope(e.target.value as 'UNIT' | 'MANAGER')}>
              <option value="UNIT">Da unidade (qualquer gerente conclui)</option>
              <option value="MANAGER">Individual (1 por gerente/dia)</option>
            </select>
          </div>
          <div><Label className="text-xs">Peso na meta</Label><Input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-10 text-sm" /></div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={noTime} onChange={(e) => setNoTime(e.target.checked)} /> Sem horário (até o fim do dia)</label>
          {!noTime && <span className="flex items-center gap-1"><Label className="text-xs">Limite</Label><Input value={limitTime} onChange={(e) => setLimitTime(e.target.value)} placeholder="23:00" className="h-9 w-24 text-sm" /></span>}
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={requiresEvidence} onChange={(e) => setRequiresEvidence(e.target.checked)} /> Exige foto</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={entersMeta} onChange={(e) => setEntersMeta(e.target.checked)} /> Entra na meta</label>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Programação (opcional)</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Início</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Encerramento</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm" /></div>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Sem início = vale desde já. Sem encerramento = sem fim. O checklist só é gerado dentro do período.</p>
        </div>

        {/* Itens/etapas */}
        <div className="rounded-lg bg-background/60 p-2">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Itens / etapas (opcional)</p>
          <p className="mb-2 text-[11px] text-muted-foreground">Cada item é verificado pelo gerente como 🟢 De acordo / 🟡 Em correção / 🔴 A corrigir. Use ↑ ↓ para ordenar.</p>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-start gap-1 rounded-md border bg-card p-1.5">
                <div className="flex shrink-0 flex-col">
                  <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label="Mover para cima" className="text-muted-foreground hover:text-brand disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} aria-label="Mover para baixo" className="text-muted-foreground hover:text-brand disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                </div>
                <div className="grid flex-1 grid-cols-12 gap-1">
                  <Input value={it.section ?? ''} onChange={(e) => setItem(i, { section: e.target.value || null })} placeholder="Seção (ex.: Cozinha)" className="col-span-4 h-9 text-sm" />
                  <Input value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} placeholder="O que verificar" className="col-span-8 h-9 text-sm" />
                  <label className="col-span-12 flex items-center gap-2 text-xs"><input type="checkbox" checked={it.requiresPhoto} onChange={(e) => setItem(i, { requiresPhoto: e.target.checked })} /> Exige foto neste item</label>
                  <label className="col-span-12 flex items-center gap-2 text-xs"><input type="checkbox" checked={it.aiCheck} onChange={(e) => setItem(i, { aiCheck: e.target.checked })} /> Checar a foto com IA (compara com o padrão)</label>
                  {it.aiCheck && <Input value={it.standardDescription ?? ''} onChange={(e) => setItem(i, { standardDescription: e.target.value || null })} placeholder="Padrão esperado (ex.: vitrine cheia, produtos alinhados por tipo, etiquetas visíveis)" className="col-span-12 h-9 text-sm" />}
                </div>
                <Button size="sm" variant="ghost" className="text-critical" onClick={() => removeItem(i)} aria-label="Remover item"><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="mt-2" onClick={addItem}><Plus className="h-4 w-4" /> Adicionar item</Button>
        </div>
      </div>
    );

  return { name, payload, fields };
}
