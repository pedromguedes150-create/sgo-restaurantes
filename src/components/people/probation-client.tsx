'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

export interface ProbRow {
  collaboratorId: string; name: string; jobTitle: string | null; unit: string;
  hireDate: string; days: number; daysLeft: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; notes: string | null; decidedByName: string | null; decidedAt: string | null;
}
const ST: Record<ProbRow['status'], { label: string; tone: StatusTone }> = {
  PENDING: { label: 'A avaliar', tone: 'medium' },
  APPROVED: { label: 'Aprovado', tone: 'success' },
  REJECTED: { label: 'Reprovado', tone: 'critical' },
};
const fmtBR = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');

export function ProbationClient({ rows, canReview }: { rows: ProbRow[]; canReview: boolean }) {
  const [filter, setFilter] = useState<'ALL' | 'PENDING'>('PENDING');
  const shown = useMemo(() => rows.filter((r) => filter === 'ALL' || r.status === 'PENDING'), [rows, filter]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['PENDING', 'ALL'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>
            {f === 'PENDING' ? 'A avaliar' : 'Todos (≤90 dias)'}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{shown.length} colaborador(es)</span>
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">Nenhum colaborador em período de experiência {filter === 'PENDING' ? 'a avaliar' : ''}.</p>}
      <div className="space-y-2">
        {shown.map((r) => <ProbCard key={r.collaboratorId} r={r} canReview={canReview} />)}
      </div>
    </div>
  );
}

function ProbCard({ r, canReview }: { r: ProbRow; canReview: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(r.notes ?? '');
  const [busy, setBusy] = useState(false);
  const pct = Math.min(100, Math.round((r.days / 90) * 100));
  const nearEnd = r.daysLeft <= 15;

  async function decide(status: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    try {
      const res = await fetch('/api/people/probation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collaboratorId: r.collaboratorId, status, notes }) });
      if (res.ok) { setEditing(false); router.refresh(); }
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  const showForm = canReview && (editing || r.status === 'PENDING');
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-brand">{r.name}</p>
          <p className="text-xs text-muted-foreground">{r.jobTitle || 'Sem função'} · {r.unit} · admitido {fmtBR(r.hireDate)}</p>
        </div>
        <StatusBadge tone={ST[r.status].tone}>{ST[r.status].label}</StatusBadge>
      </div>
      <div className="mt-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">{r.days} de 90 dias</span>
          <span className={nearEnd && r.status === 'PENDING' ? 'font-semibold text-critical' : ''}>{r.daysLeft} dia(s) restante(s)</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className={`h-full rounded-full ${nearEnd ? 'bg-critical' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {r.status !== 'PENDING' && !editing && (
        <p className="mt-2 text-xs text-muted-foreground">
          {ST[r.status].label} por {r.decidedByName ?? '—'}{r.decidedAt ? ` em ${new Date(r.decidedAt).toLocaleDateString('pt-BR')}` : ''}{r.notes ? ` · ${r.notes}` : ''}
        </p>
      )}

      {showForm ? (
        <div className="mt-2 space-y-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anotações para a aprovação (desempenho, pontualidade…)" className="text-sm" />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="gold" disabled={busy} onClick={() => decide('APPROVED')}><Check className="h-4 w-4" /> Aprovar</Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide('REJECTED')}><X className="h-4 w-4" /> Reprovar</Button>
            {editing && <Button size="sm" variant="ghost" onClick={() => { setNotes(r.notes ?? ''); setEditing(false); }}>Cancelar</Button>}
          </div>
        </div>
      ) : (
        canReview && r.status !== 'PENDING' && <Button size="sm" variant="outline" className="mt-2" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Reavaliar</Button>
      )}
    </div>
  );
}
