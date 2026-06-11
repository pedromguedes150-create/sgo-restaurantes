'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';

export interface Collab { id: string; name: string; jobTitle: string | null; units: string[] }
export interface Vac { id: string; collaborator: string; unit: string; start: string; end: string; status: 'CONFIRMED' | 'CHANGE_REQUESTED' | 'APPROVED'; changeNote: string | null }
export interface Sched { id: string; collaborator: string; unit: string; date: string; planned: string; variation: 'NONE' | 'ABSENCE' | 'LATE' | 'SWAP'; note: string | null }

const VAC_ST: Record<Vac['status'], { label: string; tone: StatusTone }> = {
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  CHANGE_REQUESTED: { label: 'Alteração solicitada', tone: 'medium' },
  APPROVED: { label: 'Aprovada', tone: 'success' },
};
const VAR_LABEL = { NONE: 'OK', ABSENCE: 'Falta', LATE: 'Atraso', SWAP: 'Troca' } as const;

export function PeopleClient({ collaborators, vacations, schedule }: { collaborators: Collab[]; vacations: Vac[]; schedule: Sched[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<'col' | 'fer' | 'esc'>('col');
  const [busy, setBusy] = useState(false);

  async function vacChange(id: string) {
    const note = prompt('O que precisa ser alterado nas férias?'); if (!note) return;
    setBusy(true);
    try { const r = await fetch(`/api/people/vacations/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }); if (r.ok) router.refresh(); } finally { setBusy(false); }
  }
  async function setVar(id: string, variation: string) {
    const note = variation === 'NONE' ? '' : (prompt('Observação (opcional):') ?? '');
    setBusy(true);
    try { const r = await fetch(`/api/people/schedule/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variation, note }) }); if (r.ok) router.refresh(); } finally { setBusy(false); }
  }

  const tabBtn = (k: typeof tab, label: string) => (
    <button onClick={() => setTab(k)} className={tab === k ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">{tabBtn('col', 'Colaboradores')}{tabBtn('fer', 'Férias')}{tabBtn('esc', 'Escala')}</div>

      {tab === 'col' && (
        <div className="space-y-2">
          {collaborators.length === 0 && <p className="text-sm text-muted-foreground">Nenhum colaborador.</p>}
          {collaborators.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card p-3">
              <p className="font-semibold text-brand">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.jobTitle ?? '—'} · {c.units.join(', ')}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'fer' && (
        <div className="space-y-2">
          {vacations.length === 0 && <p className="text-sm text-muted-foreground">Sem férias programadas.</p>}
          {vacations.map((v) => (
            <div key={v.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-brand">{v.collaborator}</p>
                <StatusBadge tone={VAC_ST[v.status].tone}>{VAC_ST[v.status].label}</StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">{v.unit} · {v.start} a {v.end}</p>
              {v.changeNote && <p className="mt-1 text-xs text-[#92600A]">Alteração: {v.changeNote}</p>}
              {v.status === 'CONFIRMED' && <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => vacChange(v.id)}>Solicitar alteração</Button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'esc' && (
        <div className="space-y-2">
          {schedule.length === 0 && <p className="text-sm text-muted-foreground">Sem escala importada.</p>}
          {schedule.map((s) => (
            <div key={s.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-brand">{s.collaborator}</p>
                <StatusBadge tone={s.variation === 'NONE' ? 'neutral' : 'medium'}>{VAR_LABEL[s.variation]}</StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">{s.unit} · {s.date} · planejado {s.planned}{s.note ? ` · ${s.note}` : ''}</p>
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
