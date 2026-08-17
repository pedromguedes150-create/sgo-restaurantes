'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Pin, PinOff, X, Plus, LinkIcon, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/ds/select';
import { DateTimePicker } from '@/components/ui/ds/date-time-picker';

const PRIORIDADES = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'IMPORTANT', label: 'Importante' },
  { value: 'URGENT', label: 'Urgente' },
];

type Priority = 'NORMAL' | 'IMPORTANT' | 'URGENT';
interface Unit { id: string; name: string }
interface Person { id: string; name: string; role: string }
interface Initial {
  title: string; body: string; priority: string; requiresResponse: boolean; pinned: boolean;
  dueAt: string; links: { label: string; url: string }[]; unitIds: string[]; extraUserIds: string[];
  confirmedCount: number; total: number;
}

const sel = 'h-11 w-full rounded-lg border-2 border-line-strong bg-surface px-3 text-sm';

/** ISO → valor de <input type="datetime-local"> em horário local. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CommunicationEdit({ id, initial, units, people }: { id: string; initial: Initial; units: Unit[]; people: Person[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [priority, setPriority] = useState<Priority>(initial.priority as Priority);
  const [requiresResponse, setRequiresResponse] = useState(initial.requiresResponse);
  const [dueAt, setDueAt] = useState(toLocalInput(initial.dueAt));
  const [unitIds, setUnitIds] = useState<string[]>(initial.unitIds);
  const [extraIds, setExtraIds] = useState<string[]>(initial.extraUserIds);
  const [links, setLinks] = useState<{ label: string; url: string }[]>(initial.links);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function togglePin() {
    setPinBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/communications/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pin', pinned: !initial.pinned }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Falha'); return; }
      router.refresh();
    } finally { setPinBusy(false); }
  }

  async function send(confirm: boolean) {
    const payload = {
      action: 'update', confirm,
      title, body, priority, requiresResponse,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      links: links.filter((l) => l.url.trim()),
      unitIds, extraUserIds: extraIds,
    };
    const res = await fetch(`/api/communications/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? 'Falha ao salvar'); return { done: false }; }
    return { done: true, data };
  }

  async function submit() {
    setErr(null);
    if (!title.trim() || !body.trim() || !dueAt) { setErr('Preencha título, mensagem e prazo.'); return; }
    if (unitIds.length === 0 && extraIds.length === 0) { setErr('Escolha ao menos uma unidade ou pessoa.'); return; }
    setBusy(true);
    try {
      const first = await send(false);
      if (!first.done) return;
      if (first.data?.needsConfirm) {
        const s = first.data.summary;
        const parts: string[] = [];
        if (s.resetOks > 0) parts.push(`zerar ${s.resetOks} confirmação(ões) (o texto mudou)`);
        if (s.removedConfirmed > 0) parts.push(`remover ${s.removedConfirmed} confirmação(ões) de destinatário(s) retirado(s)`);
        const ok = window.confirm(`Esta edição vai ${parts.join(' e ')}. Todos precisarão confirmar de novo. Continuar?`);
        if (!ok) return;
        const second = await send(true);
        if (!second.done) return;
      }
      setOpen(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Pencil className="h-4 w-4" /> {open ? 'Cancelar edição' : 'Editar comunicado'}
        </Button>
        <Button size="sm" variant="outline" disabled={pinBusy} onClick={togglePin}>
          {initial.pinned ? <><PinOff className="h-4 w-4" /> Desafixar</> : <><Pin className="h-4 w-4" /> Fixar no topo</>}
        </Button>
      </div>

      {open && (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          <p className="text-xs text-ink-500">
            {initial.confirmedCount > 0
              ? `${initial.confirmedCount} de ${initial.total} já confirmaram. Mudar o TÍTULO ou a MENSAGEM zera todas as confirmações; mudar prioridade, prazo, links, exigir-resposta ou destinatários que permanecem não zera.`
              : 'Ninguém confirmou ainda — você pode editar livremente.'}
          </p>

          <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Mensagem</Label><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full rounded-lg border-2 border-line-strong bg-surface px-3 py-2 text-sm" /></div>

          <div className="grid grid-cols-2 gap-2">
            <Select label="Prioridade" value={priority} onValueChange={(v) => setPriority(v as Priority)} options={PRIORIDADES} />
            <DateTimePicker label="Prazo de confirmação" value={dueAt} onValueChange={setDueAt} />
          </div>

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requiresResponse} onChange={(e) => setRequiresResponse(e.target.checked)} /> Exigir resposta (foto/comentário)</label>

          <div>
            <Label>Unidades (todos os gerentes confirmam)</Label>
            <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
          </div>
          <div>
            <Label>Destinatários avulsos (opcional)</Label>
            <MultiSelect options={people.map((p) => ({ value: p.id, label: p.name }))} selected={extraIds} onChange={setExtraIds} placeholder="Pessoas específicas…" searchable emptyLabel="Sem pessoas no seu escopo" allLabel="todos" />
          </div>

          <div>
            <Label className="flex items-center gap-1"><LinkIcon className="h-4 w-4" /> Links</Label>
            {links.map((l, idx) => (
              <div key={idx} className="mt-1 grid grid-cols-12 gap-1">
                <Input value={l.label} onChange={(e) => setLinks(links.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} placeholder="Rótulo" className="col-span-4 h-9 text-sm" />
                <Input value={l.url} onChange={(e) => setLinks(links.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))} placeholder="https://…" className="col-span-7 h-9 text-sm" />
                <Button size="sm" variant="ghost" className="col-span-1 text-danger" onClick={() => setLinks(links.filter((_, i) => i !== idx))} aria-label="Remover link"><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="mt-1" onClick={() => setLinks([...links, { label: '', url: '' }])}><Plus className="h-4 w-4" /> Adicionar link</Button>
          </div>

          {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy} onClick={submit}><Save className="h-4 w-4" /> Salvar alterações</Button>
          </div>
        </div>
      )}
    </div>
  );
}
