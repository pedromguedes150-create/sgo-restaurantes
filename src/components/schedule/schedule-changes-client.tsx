'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';

export interface ChangeRowUI {
  id: string; unitName: string; collaboratorAName: string; dateA: string;
  collaboratorBName: string | null; dateB: string | null; reason: string | null;
  createdByName: string; createdAt: string;
}
interface CollabOpt { id: string; name: string }
interface UnitOpt { id: string; name: string }

const fmtBR = (iso: string) => iso.split('-').reverse().join('/');

export function ScheduleChangesClient({ rows, units, selectedUnitId, collabs, canCreate, isAdmin }: {
  rows: ChangeRowUI[]; units: UnitOpt[]; selectedUnitId: string; collabs: CollabOpt[]; canCreate: boolean; isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [aId, setAId] = useState('');
  const [dateA, setDateA] = useState('');
  const [bId, setBId] = useState('');
  const [dateB, setDateB] = useState('');
  const [reason, setReason] = useState('');

  async function create() {
    setBusy(true);
    try {
      const res = await fetch('/api/schedule-changes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: selectedUnitId, collaboratorAId: aId, dateA, collaboratorBId: bId || undefined, dateB: dateB || undefined, reason }),
      });
      if (res.ok) { setAId(''); setDateA(''); setBId(''); setDateB(''); setReason(''); router.refresh(); }
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm('Excluir este registro de troca? (auditado)')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/ops', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'scheduleChange', action: 'delete', id }),
      });
      if (res.ok) router.refresh();
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {units.length > 1 && (
        <div className="max-w-xs">
          <Select
            aria-label="Unidade" size="sm" value={selectedUnitId}
            onValueChange={(v) => router.push(`/modulos/escala/trocas?unit=${v}`)}
            options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
          />
        </div>
      )}

      {canCreate && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Registrar troca (avisa o RH)</p>
          <div className="space-y-2">
            <Select
              label="Colaborador" size="sm" placeholder="Selecione…" value={aId} onValueChange={setAId}
              options={collabs.map((c) => ({ value: c.id, label: c.name }))}
            />
            <DatePicker label="Dia original" size="sm" value={dateA || null} onValueChange={(v) => setDateA(v ?? '')} />
            <Select
              label="Trocou com" hint="Deixe vazio se a pessoa só mudou de dia."
              size="sm" value={bId} onValueChange={setBId}
              options={[{ value: '', label: 'Ninguém — só mudou de dia' }, ...collabs.filter((c) => c.id !== aId).map((c) => ({ value: c.id, label: c.name }))]}
            />
            <DatePicker
              label={`Novo dia / dia do outro colaborador${bId ? ' (opcional)' : ''}`}
              size="sm" value={dateB || null} onValueChange={(v) => setDateB(v ?? '')}
            />
            <div><Label className="text-xs">Motivo (opcional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: consulta médica" className="h-10 text-sm" /></div>
            <Button className="w-full" disabled={busy || !aId || !dateA || (!bId && !dateB)} onClick={create}><Plus className="h-4 w-4" /> Registrar troca</Button>
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Registro de trocas ({rows.length})</p>
        {rows.length === 0 && <p className="text-sm text-ink-500">Nenhuma troca registrada ainda.</p>}
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border bg-sgo-surface p-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-sm font-semibold text-sgo-brand">
                  <span className="truncate">{r.collaboratorAName} ({fmtBR(r.dateA)})</span>
                  {(r.collaboratorBName || r.dateB) && <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-sgo-brand" />}
                  {r.collaboratorBName
                    ? <span className="truncate">{r.collaboratorBName}{r.dateB ? ` (${fmtBR(r.dateB)})` : ''}</span>
                    : r.dateB ? <span>{fmtBR(r.dateB)}</span> : null}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {r.unitName} · {r.createdByName} · {new Date(r.createdAt).toLocaleDateString('pt-BR')}{r.reason ? ` · ${r.reason}` : ''}
                </p>
              </div>
              {isAdmin && <Button size="sm" variant="ghost" className="shrink-0 text-danger" disabled={busy} onClick={() => remove(r.id)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
