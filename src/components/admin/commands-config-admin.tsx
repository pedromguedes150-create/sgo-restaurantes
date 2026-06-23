'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';

export interface CmdSeqRow { id: string; unitId: string; name: string; rangeStart: number; rangeEnd: number; active: boolean }
interface Unit { id: string; name: string }

const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

export function CommandsConfigAdmin({ units, sequences }: { units: Unit[]; sequences: CmdSeqRow[] }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const list = useMemo(() => sequences.filter((s) => s.unitId === unitId), [sequences, unitId]);
  const total = list.filter((s) => s.active).reduce((sum, s) => sum + Math.max(0, s.rangeEnd - s.rangeStart + 1), 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Cada unidade pode ter várias faixas de comandas (ex.: 1–200 e 500–650). São a base da contagem diária e das divergências.</p>
      <div>
        <Label>Unidade</Label>
        <select className={sel} value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </div>

      <div className="space-y-2">
        {list.map((s) => <SeqRow key={s.id} s={s} onChange={() => router.refresh()} />)}
        {list.length === 0 && <p className="text-sm text-critical">Nenhuma sequência — o módulo de comandas fica bloqueado até cadastrar pelo menos uma.</p>}
      </div>

      <NewSeq unitId={unitId} onDone={() => router.refresh()} />
      <p className="text-xs text-muted-foreground">Total de comandas ativas nesta unidade: <span className="font-bold text-brand">{total}</span></p>
    </div>
  );
}

function SeqRow({ s, onChange }: { s: CmdSeqRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const [start, setStart] = useState(String(s.rangeStart));
  const [end, setEnd] = useState(String(s.rangeEnd));
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
          <div className="grid flex-1 grid-cols-12 gap-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="col-span-12 h-9 text-sm" />
            <Input inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} placeholder="Início" className="col-span-6 h-9 text-sm" />
            <Input inputMode="numeric" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="Fim" className="col-span-6 h-9 text-sm" />
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-brand">{s.name}</p>
            <p className="text-xs text-muted-foreground">{s.rangeStart}–{s.rangeEnd} · {Math.max(0, s.rangeEnd - s.rangeStart + 1)} comandas</p>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => call({ entity: 'commandSequence', action: 'update', id: s.id, active: !s.active })}><StatusBadge tone={s.active ? 'success' : 'critical'}>{s.active ? 'Ativa' : 'Inativa'}</StatusBadge></button>
          {editing
            ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => call({ entity: 'commandSequence', action: 'update', id: s.id, name, rangeStart: Number(start), rangeEnd: Number(end) }, () => setEditing(false))} aria-label="Salvar"><Save className="h-4 w-4" /></Button>
            : <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>}
          {editing
            ? <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(s.name); setStart(String(s.rangeStart)); setEnd(String(s.rangeEnd)); }} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
            : <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => { if (confirm(`Excluir a sequência "${s.name}" (${s.rangeStart}–${s.rangeEnd})?`)) call({ entity: 'commandSequence', action: 'delete', id: s.id }); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>
      {msg && <p className="mt-1 text-xs font-medium text-critical">{msg}</p>}
    </div>
  );
}

function NewSeq({ unitId, onDone }: { unitId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    if (!start || !end) { setMsg('Informe início e fim.'); return; }
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'commandSequence', action: 'create', unitId, name, rangeStart: Number(start), rangeEnd: Number(end) });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setName(''); setStart(''); setEnd(''); onDone();
  }

  return (
    <div className="rounded-lg border border-dashed p-2.5">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Nova sequência</p>
      <div className="grid grid-cols-12 items-end gap-1">
        <div className="col-span-5"><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Salão" className="h-9 text-sm" /></div>
        <div className="col-span-3"><Label className="text-xs">Início</Label><Input inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} placeholder="1" className="h-9 text-sm" /></div>
        <div className="col-span-3"><Label className="text-xs">Fim</Label><Input inputMode="numeric" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="200" className="h-9 text-sm" /></div>
        <div className="col-span-1 flex justify-end"><Button size="sm" disabled={busy} onClick={add} aria-label="Adicionar"><Plus className="h-4 w-4" /></Button></div>
      </div>
      {msg && <p className="mt-1 text-xs font-medium text-critical">{msg}</p>}
    </div>
  );
}
