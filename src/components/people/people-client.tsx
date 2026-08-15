'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';

export interface Collab { id: string; name: string; jobTitle: string | null; units: string[] }
export interface Vac { id: string; collaborator: string; unit: string; start: string; end: string; status: 'CONFIRMED' | 'CHANGE_REQUESTED' | 'APPROVED' | 'REQUESTED'; changeNote: string | null }
export interface Sched { id: string; collaborator: string; unit: string; date: string; planned: string; variation: 'NONE' | 'ABSENCE' | 'LATE' | 'SWAP'; note: string | null }

const VAC_ST: Record<Vac['status'], { label: string; tone: StatusTone }> = {
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  CHANGE_REQUESTED: { label: 'Alteração solicitada', tone: 'medium' },
  APPROVED: { label: 'Aprovada', tone: 'success' },
  REQUESTED: { label: 'Solicitada ao RH', tone: 'medium' },
};
const VAR_LABEL = { NONE: 'OK', ABSENCE: 'Falta', LATE: 'Atraso', SWAP: 'Troca' } as const;

export function PeopleClient({ collaborators, vacations, schedule, canRequestVacation }: { collaborators: Collab[]; vacations: Vac[]; schedule: Sched[]; canRequestVacation?: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<'col' | 'fer' | 'esc'>('col');
  const [busy, setBusy] = useState(false);
  // Solicitar férias ao RH (item 11 — provisório até a API do RH)
  const [vCollab, setVCollab] = useState('');
  const [vStart, setVStart] = useState('');
  const [vEnd, setVEnd] = useState('');
  const [vNote, setVNote] = useState('');

  async function vacChange(id: string) {
    const note = prompt('O que precisa ser alterado nas férias?'); if (!note) return;
    setBusy(true);
    try { const r = await fetch(`/api/people/vacations/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }); if (r.ok) router.refresh(); } finally { setBusy(false); }
  }

  async function vacRequest() {
    setBusy(true);
    try {
      const r = await fetch('/api/people/vacations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collaboratorId: vCollab, startDate: vStart, endDate: vEnd, note: vNote }) });
      if (r.ok) { setVCollab(''); setVStart(''); setVEnd(''); setVNote(''); router.refresh(); }
      else { const d = await r.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }
  async function setVar(id: string, variation: string) {
    const note = variation === 'NONE' ? '' : (prompt('Observação (opcional):') ?? '');
    setBusy(true);
    try { const r = await fetch(`/api/people/schedule/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variation, note }) }); if (r.ok) router.refresh(); } finally { setBusy(false); }
  }

  const tabBtn = (k: typeof tab, label: string) => (
    <button onClick={() => setTab(k)} className={tab === k ? 'rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">{tabBtn('col', 'Colaboradores')}{tabBtn('fer', 'Férias')}{tabBtn('esc', 'Escala')}</div>

      {tab === 'col' && (
        <div className="space-y-2">
          {collaborators.length === 0 && <p className="text-sm text-ink-500">Nenhum colaborador.</p>}
          {collaborators.map((c) => (
            <div key={c.id} className="rounded-lg border bg-surface p-3">
              <p className="font-semibold text-brand">{c.name}</p>
              <p className="text-xs text-ink-500">{c.jobTitle ?? '—'} · {c.units.join(', ')}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'fer' && (
        <div className="space-y-2">
          {canRequestVacation && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Solicitar férias ao RH</p>
              <div className="space-y-2">
                <Select
                  aria-label="Colaborador" placeholder="Selecione o colaborador…" value={vCollab} onValueChange={setVCollab}
                  options={collaborators.map((c) => ({ value: c.id, label: c.name, hint: c.jobTitle ?? undefined }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <DatePicker label="Início" value={vStart || null} onValueChange={(v) => setVStart(v ?? '')} />
                  <DatePicker label="Fim" min={vStart || undefined} value={vEnd || null} onValueChange={(v) => setVEnd(v ?? '')} />
                </div>
                <Input value={vNote} onChange={(e) => setVNote(e.target.value)} placeholder="Observação (opcional)" className="h-10 text-sm" />
                <Button className="w-full" disabled={busy || !vCollab || !vStart || !vEnd} onClick={vacRequest}><Plus className="h-4 w-4" /> Pedir ao RH</Button>
                <p className="text-xs text-ink-500">O pedido avisa os Admins para levar ao RH. Quando o RH confirmar, o status muda aqui.</p>
              </div>
            </div>
          )}
          {vacations.length === 0 && <p className="text-sm text-ink-500">Sem férias programadas.</p>}
          {vacations.map((v) => (
            <div key={v.id} className="rounded-lg border bg-surface p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-brand">{v.collaborator}</p>
                <StatusBadge tone={VAC_ST[v.status].tone}>{VAC_ST[v.status].label}</StatusBadge>
              </div>
              <p className="text-xs text-ink-500">{v.unit} · {v.start} a {v.end}</p>
              {v.changeNote && <p className="mt-1 text-xs text-warning">Alteração: {v.changeNote}</p>}
              {v.status === 'CONFIRMED' && <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => vacChange(v.id)}>Solicitar alteração</Button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'esc' && (
        <div className="space-y-2">
          {schedule.length === 0 && <p className="text-sm text-ink-500">Sem escala importada.</p>}
          {schedule.map((s) => (
            <div key={s.id} className="rounded-lg border bg-surface p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-brand">{s.collaborator}</p>
                <StatusBadge tone={s.variation === 'NONE' ? 'neutral' : 'medium'}>{VAR_LABEL[s.variation]}</StatusBadge>
              </div>
              <p className="text-xs text-ink-500">{s.unit} · {s.date} · planejado {s.planned}{s.note ? ` · ${s.note}` : ''}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(['ABSENCE', 'LATE', 'SWAP', 'NONE'] as const).map((vv) => (
                  <button key={vv} disabled={busy} onClick={() => setVar(s.id, vv)} className="rounded border px-2 py-1 text-xs">{VAR_LABEL[vv]}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
