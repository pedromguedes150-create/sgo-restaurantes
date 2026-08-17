'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronUp, ChevronDown, Trash2, Pencil, Copy, RefreshCw, Link2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
import { FORM_FIELD_KINDS } from '@/lib/checklist-forms/types';

interface Unit { id: string; name: string }
interface FormRow { id: string; unitId: string; title: string; active: boolean; linkEnabled: boolean; publicToken: string | null; expiresAt: string | null; submissions: number; fields: number }
interface Field { id: string; kind: string; label: string; section: string | null; required: boolean; options: string[]; order: number }
interface Detail {
  id: string; unitId: string; title: string; description: string | null; active: boolean; linkEnabled: boolean;
  publicToken: string | null; expiresAt: string | null; maxPerDay: number; notifyRole: string | null; fields: Field[]; submissions: number;
}

const kindLabel = (k: string) => FORM_FIELD_KINDS.find((f) => f.kind === k)?.label ?? k;

async function post(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; id?: string; token?: string }> {
  try {
    const res = await fetch('/api/checklist-forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, id: d.id, token: d.token } : { ok: false, error: d.error ?? 'Falha' };
  } catch { return { ok: false, error: 'Falha de conexão' }; }
}

export function ChecklistFormsAdmin({ units, forms }: { units: Unit[]; forms: FormRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function createForm() {
    if (!title.trim()) { setMsg('Informe o título da ficha.'); return; }
    setBusy(true); setMsg(null);
    const r = await post({ action: 'create', unitId, title });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setTitle(''); setOpenId(r.id ?? null); router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-2.5">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Nova ficha</p>
        <div className="grid grid-cols-12 items-end gap-1.5">
          <div className="col-span-12 sm:col-span-6"><Label className="text-xs">Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Ficha de Controle de Massas" className="h-9 text-sm" /></div>
          <div className="col-span-9 sm:col-span-5">
            <Select label="Unidade" size="sm" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
          </div>
          <div className="col-span-3 sm:col-span-1 flex justify-end"><Button size="sm" disabled={busy} onClick={createForm} aria-label="Criar"><Plus className="h-4 w-4" /></Button></div>
        </div>
        {msg && <p className="mt-1 text-xs font-medium text-danger">{msg}</p>}
      </div>

      <div className="space-y-2">
        {forms.length === 0 && <p className="text-sm text-ink-500">Nenhuma ficha cadastrada ainda.</p>}
        {forms.map((f) => {
          const unitName = units.find((u) => u.id === f.unitId)?.name ?? '—';
          return (
            <div key={f.id} className="rounded-lg border bg-surface">
              <button onClick={() => setOpenId((id) => (id === f.id ? null : f.id))} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{f.title}</p>
                  <p className="text-xs text-ink-500">{unitName} · {f.fields} campo(s) · {f.submissions} envio(s)</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge tone={f.active ? 'success' : 'neutral'}>{f.active ? 'Ativa' : 'Inativa'}</StatusBadge>
                  <StatusBadge tone={f.linkEnabled ? 'success' : 'critical'}>{f.linkEnabled ? 'Link on' : 'Link off'}</StatusBadge>
                </div>
              </button>
              {openId === f.id && <FormEditor id={f.id} onChanged={() => router.refresh()} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormEditor({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/checklist-forms?id=${id}`, { cache: 'no-store' });
    if (res.ok) setD(await res.json()); else setMsg('Falha ao carregar');
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function run(payload: Record<string, unknown>, reloadAfter = true) {
    setBusy(true); setMsg(null);
    const r = await post(payload);
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return false; }
    if (reloadAfter) await load();
    onChanged();
    return true;
  }

  if (!d) return <div className="border-t p-3 text-sm text-ink-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Carregando…</div>;

  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const url = d.publicToken ? `${base}/checklists/${d.publicToken}` : '';

  return (
    <div className="space-y-4 border-t p-3">
      {/* Configurações */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label className="text-xs">Título</Label><Input defaultValue={d.title} onBlur={(e) => e.target.value.trim() && e.target.value !== d.title && run({ action: 'update', id, title: e.target.value })} className="h-9 text-sm" /></div>
        <div className="sm:col-span-2"><Label className="text-xs">Descrição (opcional)</Label><Input defaultValue={d.description ?? ''} onBlur={(e) => e.target.value !== (d.description ?? '') && run({ action: 'update', id, description: e.target.value })} className="h-9 text-sm" /></div>
        <div><Label className="text-xs">Teto de envios/dia (0 = sem limite)</Label><Input inputMode="numeric" defaultValue={String(d.maxPerDay)} onBlur={(e) => Number(e.target.value) !== d.maxPerDay && run({ action: 'update', id, maxPerDay: Number(e.target.value) || 0 })} className="h-9 text-sm" /></div>
        <Select
          label="Avisar ao receber envio" size="sm" value={d.notifyRole ?? ''}
          // Atualiza a tela na hora e só depois confirma no servidor — o run()
          // recarrega o detalhe inteiro, o que deixaria o campo parado até voltar.
          onValueChange={(v) => { setD({ ...d, notifyRole: v || null }); void run({ action: 'update', id, notifyRole: v }); }}
          options={[{ value: '', label: 'Ninguém' }, { value: 'MANAGER', label: 'Gerente' }, { value: 'SUPERVISOR', label: 'Supervisor' }]}
        />
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.active} disabled={busy} onChange={(e) => run({ action: 'update', id, active: e.target.checked })} /> Ficha ativa</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.linkEnabled} disabled={busy} onChange={(e) => run({ action: 'update', id, linkEnabled: e.target.checked })} /> Link habilitado</label>
      </div>

      {/* Link */}
      <div className="rounded-lg border bg-canvas p-2.5">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500"><Link2 className="h-3.5 w-3.5" /> Link público</p>
        {d.linkEnabled ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input readOnly value={url} className="h-9 flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="outline" disabled={busy || !url} onClick={() => { navigator.clipboard?.writeText(url); setMsg('Link copiado.'); }}><Copy className="h-4 w-4" /> Copiar</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm('Gerar um NOVO link? O link anterior deixa de funcionar.')) run({ action: 'rotateToken', id }); }}><RefreshCw className="h-4 w-4" /> Novo link</Button>
          </div>
        ) : <p className="text-xs text-ink-500">Link desligado — ninguém consegue abrir. Ligue em &quot;Link habilitado&quot;.</p>}
      </div>

      {/* Campos */}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Perguntas / campos</p>
        <div className="space-y-1.5">
          {d.fields.length === 0 && <p className="text-sm text-ink-500">Nenhum campo ainda — adicione abaixo.</p>}
          {d.fields.map((f, idx) => (
            <FieldRow key={f.id} field={f} idx={idx} total={d.fields.length} busy={busy}
              onMove={(dir) => { const ids = d.fields.map((x) => x.id); const j = idx + dir; if (j < 0 || j >= ids.length) return; [ids[idx], ids[j]] = [ids[j], ids[idx]]; run({ action: 'reorder', templateId: id, orderedIds: ids }); }}
              onDelete={() => { if (confirm(`Excluir o campo "${f.label}"?`)) run({ action: 'deleteField', id: f.id }); }}
              onSave={(patch) => run({ action: 'saveField', templateId: id, id: f.id, ...patch })}
            />
          ))}
        </div>
        <NewField templateId={id} onSaved={() => run({}, true)} />
      </div>

      {msg && <p className="text-xs font-medium text-ink-900">{msg}</p>}
    </div>
  );
}

function FieldRow({ field, idx, total, busy, onMove, onDelete, onSave }: {
  field: Field; idx: number; total: number; busy: boolean;
  onMove: (dir: -1 | 1) => void; onDelete: () => void; onSave: (patch: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-lg border bg-surface p-2">
      {editing ? (
        <FieldForm initial={field} onCancel={() => setEditing(false)} onSubmit={(patch) => { onSave(patch); setEditing(false); }} />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">{field.kind === 'SECTION' ? `— ${field.label} —` : field.label} {field.required && <span className="text-danger">*</span>}</p>
            <p className="text-xs text-ink-500">{kindLabel(field.kind)}{field.options.length ? ` · ${field.options.join(', ')}` : ''}{field.section ? ` · seção: ${field.section}` : ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" aria-label="Subir" disabled={idx === 0 || busy} onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Descer" disabled={idx === total - 1 || busy} onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Editar" disabled={busy} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="text-danger" aria-label="Excluir" disabled={busy} onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewField({ templateId, onSaved }: { templateId: string; onSaved: () => void }) {
  const [adding, setAdding] = useState(false);
  if (!adding) return <Button size="sm" variant="outline" className="mt-2" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Adicionar campo</Button>;
  return (
    <div className="mt-2 rounded-lg border border-dashed p-2">
      <FieldForm onCancel={() => setAdding(false)} onSubmit={async (patch) => {
        const res = await fetch('/api/checklist-forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'saveField', templateId, ...patch }) });
        if (res.ok) { setAdding(false); onSaved(); } else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
      }} />
    </div>
  );
}

function FieldForm({ initial, onCancel, onSubmit }: { initial?: Field; onCancel: () => void; onSubmit: (patch: Record<string, unknown>) => void }) {
  const [kind, setKind] = useState(initial?.kind ?? 'SHORT_TEXT');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [section, setSection] = useState(initial?.section ?? '');
  const [required, setRequired] = useState(initial?.required ?? false);
  const [optionsText, setOptionsText] = useState((initial?.options ?? []).join('\n'));
  const isSelect = kind === 'SELECT';
  const isSection = kind === 'SECTION';

  function submit() {
    if (!label.trim()) { alert('Informe o rótulo do campo.'); return; }
    const options = isSelect ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    if (isSelect && options.length === 0) { alert('Informe as opções da lista (uma por linha).'); return; }
    onSubmit({ kind, label, section: section || null, required: isSection ? false : required, options });
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-1.5">
        <div className="col-span-12 sm:col-span-4">
          <Select
            label="Tipo" size="sm" value={kind} onValueChange={setKind}
            options={FORM_FIELD_KINDS.map((f) => ({ value: f.kind, label: f.label }))}
          />
        </div>
        <div className="col-span-12 sm:col-span-8"><Label className="text-xs">{isSection ? 'Texto do subtítulo' : 'Rótulo da pergunta'}</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 text-sm" /></div>
      </div>
      {isSelect && <div><Label className="text-xs">Opções (uma por linha)</Label><textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={3} className="w-full rounded-lg border-2 border-line-strong bg-surface px-3 py-2 text-sm" placeholder={'380g\n300g'} /></div>}
      {!isSection && (
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Obrigatório</label>
          <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Seção (opcional, agrupa campos)" className="h-9 flex-1 text-sm" />
        </div>
      )}
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4" /> Cancelar</Button>
        <Button size="sm" onClick={submit}>Salvar campo</Button>
      </div>
    </div>
  );
}
