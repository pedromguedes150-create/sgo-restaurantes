'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Coverage = 'ok' | 'partial' | 'none';
interface Grid {
  sectors: { id: string; name: string; minHeadcount: number }[];
  shifts: string[];
  cells: Record<string, Record<string, { id: string; name: string; source: string }[]>>;
  coverage: Record<string, Record<string, Coverage>>;
}
interface Collab { id: string; name: string }

const COV: Record<Coverage, { dot: string; label: string }> = {
  ok: { dot: 'bg-success', label: 'Coberto' },
  partial: { dot: 'bg-medium', label: 'Parcial' },
  none: { dot: 'bg-critical', label: 'Sem cobertura' },
};
const SHIFT_SUGGESTIONS = ['Manhã 06-14', 'Tarde 14-22', 'Noite 18-23', 'Integral'];

export function WorkforceClient({ unitId, isAdmin, grid, collaborators }: { unitId: string; isAdmin: boolean; grid: Grid; collaborators: Collab[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // novo setor
  const [secName, setSecName] = useState('');
  const [secMin, setSecMin] = useState('1');
  // alocação
  const [sectorId, setSectorId] = useState(grid.sectors[0]?.id ?? '');
  const [shift, setShift] = useState('');
  const [collaboratorId, setCollaboratorId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

  async function post(payload: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/workforce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return false; }
      router.refresh(); return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="rounded-lg border border-dashed p-3">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Novo setor (Admin)</h2>
          <div className="flex gap-2">
            <div className="flex-1"><Label>Nome</Label><Input value={secName} onChange={(e) => setSecName(e.target.value)} placeholder="ex: Cozinha" /></div>
            <div className="w-28"><Label>Mín./turno</Label><Input inputMode="numeric" value={secMin} onChange={(e) => setSecMin(e.target.value)} /></div>
          </div>
          <Button className="mt-2 w-full" disabled={busy} onClick={async () => { if (await post({ action: 'createSector', unitId, name: secName, minHeadcount: Number(secMin) })) setSecName(''); }}><Plus className="h-4 w-4" /> Criar setor</Button>
        </div>
      )}

      {/* Alocar colaborador */}
      <div className="rounded-lg border border-dashed p-3">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Alocar colaborador</h2>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Setor</Label><select className={sel} value={sectorId} onChange={(e) => setSectorId(e.target.value)}>{grid.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}{grid.sectors.length === 0 && <option value="">(crie um setor)</option>}</select></div>
            <div>
              <Label>Turno/Horário</Label>
              <Input list="shifts" value={shift} onChange={(e) => setShift(e.target.value)} placeholder="ex: Noite 18-23" />
              <datalist id="shifts">{SHIFT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
          </div>
          <div><Label>Colaborador</Label><select className={sel} value={collaboratorId} onChange={(e) => setCollaboratorId(e.target.value)}><option value="">Selecione…</option>{collaborators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
          <Button className="w-full" disabled={busy} onClick={async () => { if (await post({ action: 'allocate', unitId, sectorId, shift, collaboratorId })) { setShift(''); setCollaboratorId(''); } }}><Plus className="h-4 w-4" /> Alocar</Button>
        </div>
      </div>

      {/* Grade */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Mapa Setor × Horário</h2>
        {grid.sectors.length === 0 && <p className="text-sm text-muted-foreground">Nenhum setor cadastrado.</p>}
        {grid.sectors.map((s) => (
          <div key={s.id} className="rounded-lg border bg-card p-3">
            <p className="font-semibold text-brand">{s.name} <span className="text-xs font-normal text-muted-foreground">(mín. {s.minHeadcount}/turno)</span></p>
            {grid.shifts.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Sem turnos alocados ainda.</p>}
            <div className="mt-2 space-y-2">
              {grid.shifts.map((shiftLabel) => {
                const people = grid.cells[s.id]?.[shiftLabel] ?? [];
                const cov = grid.coverage[s.id]?.[shiftLabel] ?? 'none';
                return (
                  <div key={shiftLabel} className="rounded-md bg-surface p-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full', COV[cov].dot)} title={COV[cov].label} />
                      <span className="text-sm font-medium">{shiftLabel}</span>
                      <span className="text-xs text-muted-foreground">({people.length})</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {people.length === 0 && <span className="text-xs text-critical">sem colaborador</span>}
                      {people.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                          {p.name}
                          <button onClick={() => post({ action: 'removeAllocation', id: p.id })} aria-label="Remover" className="text-critical"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
