'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Pencil, Trash2, Save, Clock, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { UnitFloorplan } from '@/components/people/unit-floorplan';

type Coverage = 'ok' | 'partial' | 'none';
interface Grid {
  sectors: { id: string; name: string; minHeadcount: number }[];
  shifts: { id: string | null; label: string }[];
  cells: Record<string, Record<string, { id: string; name: string; source: string }[]>>;
  coverage: Record<string, Record<string, Coverage>>;
}
interface Turno { id: string; name: string; startTime: string | null; endTime: string | null; active: boolean }
interface AllocBoard {
  toAllocate: { id: string; name: string }[];
  allocated: { allocationId: string; collaboratorId: string; name: string; sectorId: string; sectorName: string; shiftId: string | null; shiftLabel: string }[];
}

const COV: Record<Coverage, { dot: string; label: string }> = {
  ok: { dot: 'bg-success', label: 'Coberto' },
  partial: { dot: 'bg-medium', label: 'Parcial' },
  none: { dot: 'bg-critical', label: 'Sem cobertura' },
};

export function WorkforceClient({ unitId, isAdmin, grid, board, turnos, suggestedSectors, availDate, availability }: {
  unitId: string; isAdmin: boolean; grid: Grid; board: AllocBoard; turnos: Turno[]; suggestedSectors: string[];
  availDate?: string | null; availability?: { working: string[]; off: string[] } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<'planta' | 'lista'>('planta');

  const activeTurnos = turnos.filter((t) => t.active);

  async function post(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/workforce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return false; }
      router.refresh(); return true;
    } finally { setBusy(false); }
  }

  function navDate(date: string) {
    const sp = new URLSearchParams({ unit: unitId });
    if (date) sp.set('date', date);
    router.push(`/modulos/pessoas/mapa?${sp.toString()}`);
  }

  return (
    <div className="space-y-5">
      {/* Disponibilidade da turma num dia (puxa da Escala) */}
      <div className="rounded-lg border bg-card p-3">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Disponibilidade do dia</h2>
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">Escolha o dia</Label><Input type="date" defaultValue={availDate ?? ''} onChange={(e) => navDate(e.target.value)} className="h-10 text-sm" /></div>
        </div>
        {availability && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-success/10 p-2">
              <p className="text-xs font-bold text-success">Trabalhando ({availability.working.length})</p>
              <p className="text-sm">{availability.working.length ? availability.working.join(', ') : '—'}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <p className="text-xs font-bold text-muted-foreground">Indisponíveis ({availability.off.length})</p>
              <p className="text-sm text-muted-foreground">{availability.off.length ? availability.off.join(', ') : '—'}</p>
            </div>
          </div>
        )}
        {availDate && availability && availability.working.length === 0 && availability.off.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Nenhuma escala cadastrada. Cadastre as escalas em Pessoas → Escala.</p>
        )}
      </div>

      {isAdmin && <TurnosManager unitId={unitId} turnos={turnos} post={post} busy={busy} />}
      {isAdmin && <SectorsManager unitId={unitId} sectors={grid.sectors} suggested={suggestedSectors} post={post} busy={busy} />}

      {/* Quadro padrão: A alocar × Alocados */}
      <AllocationBoardEditor unitId={unitId} board={board} grid={grid} activeTurnos={activeTurnos} post={post} busy={busy} />
      {msg && <p className="text-sm font-medium text-critical">{msg}</p>}


      {/* Mapa: Planta (visual) ou Lista */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Mapa da unidade</h2>
          <div className="flex gap-1">
            <button onClick={() => setView('planta')} className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold', view === 'planta' ? 'bg-primary text-primary-foreground' : 'border')}><LayoutGrid className="h-3.5 w-3.5" /> Planta</button>
            <button onClick={() => setView('lista')} className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold', view === 'lista' ? 'bg-primary text-primary-foreground' : 'border')}><List className="h-3.5 w-3.5" /> Lista</button>
          </div>
        </div>

        {view === 'planta' && <UnitFloorplan grid={grid} />}

        {view === 'lista' && grid.sectors.length === 0 && <p className="text-sm text-muted-foreground">Nenhum setor cadastrado.</p>}
        {view === 'lista' && grid.sectors.map((s) => (
          <div key={s.id} className="rounded-lg border bg-card p-3">
            <p className="font-semibold text-brand">{s.name} <span className="text-xs font-normal text-muted-foreground">(mín. {s.minHeadcount}/turno)</span></p>
            {grid.shifts.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Sem turnos cadastrados ainda.</p>}
            <div className="mt-2 space-y-2">
              {grid.shifts.map((col) => {
                const people = grid.cells[s.id]?.[col.label] ?? [];
                const cov = grid.coverage[s.id]?.[col.label] ?? 'none';
                return (
                  <div key={col.label} className="rounded-md bg-surface p-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full', COV[cov].dot)} title={COV[cov].label} />
                      <span className="text-sm font-medium">{col.label}</span>
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

/* ───────── Quadro padrão: A alocar × Alocados ───────── */
function AllocationBoardEditor({ unitId, board, grid, activeTurnos, post, busy }: {
  unitId: string; board: AllocBoard; grid: Grid; activeTurnos: Turno[];
  post: (p: Record<string, unknown>) => Promise<boolean>; busy: boolean;
}) {
  const selCls = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';
  const turnoLabel = (t: Turno) => `${t.name}${t.startTime && t.endTime ? ` ${t.startTime}-${t.endTime}` : ''}`;

  // Form de alocação (escolhe quem falta + setor + turno)
  const [collaboratorId, setCollaboratorId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [turnoId, setTurnoId] = useState('');
  // valores efetivos (caem no 1º válido se o selecionado não existir mais)
  const secVal = grid.sectors.some((s) => s.id === sectorId) ? sectorId : (grid.sectors[0]?.id ?? '');
  const turVal = activeTurnos.some((t) => t.id === turnoId) ? turnoId : (activeTurnos[0]?.id ?? '');
  const collabVal = board.toAllocate.some((c) => c.id === collaboratorId) ? collaboratorId : '';

  // Edição de uma alocação já existente
  const [editId, setEditId] = useState<string | null>(null);
  const [eSector, setESector] = useState('');
  const [eTurno, setETurno] = useState('');
  function openEdit(a: AllocBoard['allocated'][number]) { setEditId(a.allocationId); setESector(a.sectorId); setETurno(a.shiftId ?? (activeTurnos[0]?.id ?? '')); }

  const noSectors = grid.sectors.length === 0;
  const noTurnos = activeTurnos.length === 0;

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Quadro padrão da equipe</h2>
      <p className="mb-3 text-xs text-muted-foreground">Defina uma vez onde cada um trabalha. O mapa do dia mostra automaticamente só quem está escalado (folga/falta/atestado não aparecem no dia).</p>

      {/* Alocar quem falta */}
      <div className="rounded-md bg-surface p-2">
        <p className="mb-1 text-xs font-bold text-brand">A alocar ({board.toAllocate.length})</p>
        {board.toAllocate.length === 0 ? (
          <p className="text-sm font-medium text-success">Quadro completo ✅ — todos os colaboradores estão alocados.</p>
        ) : (noSectors || noTurnos) ? (
          <p className="text-sm text-critical">Cadastre {noSectors ? 'um setor' : ''}{noSectors && noTurnos ? ' e ' : ''}{noTurnos ? 'um turno' : ''} antes de alocar.</p>
        ) : (
          <div className="space-y-2">
            <select className={selCls} value={collabVal} onChange={(e) => setCollaboratorId(e.target.value)}>
              <option value="">Selecione quem alocar…</option>
              {board.toAllocate.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select className={selCls} value={secVal} onChange={(e) => setSectorId(e.target.value)}>{grid.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <select className={selCls} value={turVal} onChange={(e) => setTurnoId(e.target.value)}>{activeTurnos.map((t) => <option key={t.id} value={t.id}>{turnoLabel(t)}</option>)}</select>
            </div>
            <Button className="w-full" disabled={busy || !collabVal || !secVal || !turVal}
              onClick={async () => { if (await post({ action: 'allocate', unitId, sectorId: secVal, shiftId: turVal, collaboratorId: collabVal })) setCollaboratorId(''); }}>
              <Plus className="h-4 w-4" /> Alocar
            </Button>
          </div>
        )}
      </div>

      {/* Já alocados (editável) */}
      <div className="mt-3">
        <p className="mb-1 text-xs font-bold text-brand">Alocados ({board.allocated.length})</p>
        {board.allocated.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém alocado ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {board.allocated.map((a) => editId === a.allocationId ? (
              <div key={a.allocationId} className="rounded-md border bg-card p-2">
                <p className="mb-1 text-sm font-semibold text-brand">{a.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  <select className={selCls} value={eSector} onChange={(e) => setESector(e.target.value)}>{grid.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <select className={selCls} value={eTurno} onChange={(e) => setETurno(e.target.value)}>{activeTurnos.map((t) => <option key={t.id} value={t.id}>{turnoLabel(t)}</option>)}</select>
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
                  <Button size="sm" disabled={busy || !eSector || !eTurno} onClick={async () => { if (await post({ action: 'updateAllocation', id: a.allocationId, sectorId: eSector, shiftId: eTurno })) setEditId(null); }}><Save className="h-4 w-4" /> Salvar</Button>
                </div>
              </div>
            ) : (
              <div key={a.allocationId} className="flex items-center justify-between gap-2 rounded-md border bg-card p-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-brand">{a.name}</span>
                  <span className="block text-xs text-muted-foreground">{a.sectorName} · {a.shiftLabel}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => { if (confirm(`Remover ${a.name} do quadro?`)) post({ action: 'removeAllocation', id: a.allocationId }); }} aria-label="Remover"><X className="h-4 w-4" /></Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Gestão de turnos (Admin) ───────── */
function TurnosManager({ unitId, turnos, post, busy }: { unitId: string; turnos: Turno[]; post: (p: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState(''); const [eStart, setEStart] = useState(''); const [eEnd, setEEnd] = useState('');

  function openEdit(t: Turno) { setEditId(t.id); setEName(t.name); setEStart(t.startTime ?? ''); setEEnd(t.endTime ?? ''); }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><Clock className="mr-1 inline h-4 w-4" /> Turnos da unidade (Admin)</h2>
      <div className="space-y-2">
        {turnos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum turno. Cadastre os turnos/horários desta unidade.</p>}
        {turnos.map((t) => editId === t.id ? (
          <div key={t.id} className="grid grid-cols-12 items-end gap-1 rounded-md bg-muted/40 p-2">
            <div className="col-span-5"><Label className="text-xs">Nome</Label><Input value={eName} onChange={(e) => setEName(e.target.value)} className="h-9 text-sm" /></div>
            <div className="col-span-3"><Label className="text-xs">Início</Label><Input value={eStart} onChange={(e) => setEStart(e.target.value)} placeholder="06:00" className="h-9 text-sm" /></div>
            <div className="col-span-3"><Label className="text-xs">Fim</Label><Input value={eEnd} onChange={(e) => setEEnd(e.target.value)} placeholder="14:00" className="h-9 text-sm" /></div>
            <div className="col-span-1 flex justify-end"><Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (await post({ action: 'updateShift', id: t.id, name: eName, startTime: eStart, endTime: eEnd })) setEditId(null); }} aria-label="Salvar"><Save className="h-4 w-4" /></Button></div>
          </div>
        ) : (
          <div key={t.id} className="flex items-center justify-between rounded-md bg-surface p-2">
            <span className="text-sm font-medium">{t.name}{t.startTime && t.endTime ? <span className="text-xs text-muted-foreground"> · {t.startTime}-{t.endTime}</span> : ''}{!t.active && <span className="ml-1 text-xs text-critical">(inativo)</span>}</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => openEdit(t)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm(`Excluir o turno "${t.name}"? As alocações nele perdem a referência (mantêm o rótulo).`)) post({ action: 'deleteShift', id: t.id }); }} aria-label="Excluir" className="text-critical"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-12 items-end gap-1 pt-1">
          <div className="col-span-5"><Label className="text-xs">Novo turno</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Manhã" className="h-9 text-sm" /></div>
          <div className="col-span-3"><Label className="text-xs">Início</Label><Input value={start} onChange={(e) => setStart(e.target.value)} placeholder="06:00" className="h-9 text-sm" /></div>
          <div className="col-span-3"><Label className="text-xs">Fim</Label><Input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="14:00" className="h-9 text-sm" /></div>
          <div className="col-span-1 flex justify-end"><Button size="sm" disabled={busy || !name.trim()} onClick={async () => { if (await post({ action: 'createShift', unitId, name, startTime: start, endTime: end })) { setName(''); setStart(''); setEnd(''); } }} aria-label="Adicionar"><Plus className="h-4 w-4" /></Button></div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Gestão de setores (Admin) ───────── */
function SectorsManager({ unitId, sectors, suggested, post, busy }: { unitId: string; sectors: { id: string; name: string; minHeadcount: number }[]; suggested: string[]; post: (p: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const [name, setName] = useState('');
  const [min, setMin] = useState('1');
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState(''); const [eMin, setEMin] = useState('1');

  function openEdit(s: { id: string; name: string; minHeadcount: number }) { setEditId(s.id); setEName(s.name); setEMin(String(s.minHeadcount)); }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Setores da unidade (Admin)</h2>
      <div className="space-y-2">
        {sectors.map((s) => editId === s.id ? (
          <div key={s.id} className="grid grid-cols-12 items-end gap-1 rounded-md bg-muted/40 p-2">
            <div className="col-span-8"><Label className="text-xs">Nome</Label><Input value={eName} onChange={(e) => setEName(e.target.value)} className="h-9 text-sm" /></div>
            <div className="col-span-3"><Label className="text-xs">Mín./turno</Label><Input inputMode="numeric" value={eMin} onChange={(e) => setEMin(e.target.value)} className="h-9 text-sm" /></div>
            <div className="col-span-1 flex justify-end"><Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (await post({ action: 'updateSector', id: s.id, name: eName, minHeadcount: Number(eMin) })) setEditId(null); }} aria-label="Salvar"><Save className="h-4 w-4" /></Button></div>
          </div>
        ) : (
          <div key={s.id} className="flex items-center justify-between rounded-md bg-surface p-2">
            <span className="text-sm font-medium">{s.name} <span className="text-xs text-muted-foreground">(mín. {s.minHeadcount})</span></span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => openEdit(s)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm(`Excluir o setor "${s.name}"? As alocações desse setor também serão removidas.`)) post({ action: 'deleteSector', id: s.id }); }} aria-label="Excluir" className="text-critical"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        {/* Setores de referência (clique para criar rápido) */}
        {suggested.length > 0 && (
          <div className="pt-1">
            <p className="mb-1 text-xs text-muted-foreground">Referência — clique para criar nesta unidade:</p>
            <div className="flex flex-wrap gap-1">
              {suggested.map((n) => (
                <button key={n} type="button" disabled={busy} onClick={() => post({ action: 'createSector', unitId, name: n, minHeadcount: 1 })} className="rounded-full border px-2.5 py-1 text-xs hover:border-accent disabled:opacity-50">+ {n}</button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-12 items-end gap-1 pt-1">
          <div className="col-span-8"><Label className="text-xs">Novo setor</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Cozinha" className="h-9 text-sm" /></div>
          <div className="col-span-3"><Label className="text-xs">Mín./turno</Label><Input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className="h-9 text-sm" /></div>
          <div className="col-span-1 flex justify-end"><Button size="sm" disabled={busy || !name.trim()} onClick={async () => { if (await post({ action: 'createSector', unitId, name, minHeadcount: Number(min) })) { setName(''); setMin('1'); } }} aria-label="Adicionar"><Plus className="h-4 w-4" /></Button></div>
        </div>
      </div>
    </div>
  );
}
