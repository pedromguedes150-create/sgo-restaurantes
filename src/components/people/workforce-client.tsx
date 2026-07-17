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
  allocated: { allocationId: string; collaboratorId: string; name: string; jobTitle: string | null; sectorId: string; sectorName: string; shiftId: string | null; shiftLabel: string }[];
}
interface DayFreela { requestId: string; name: string; sectorId: string | null; sectorName: string | null; startTime: string | null; endTime: string | null; present: boolean; status: string }

const COV: Record<Coverage, { dot: string; label: string }> = {
  ok: { dot: 'bg-success', label: 'Coberto' },
  partial: { dot: 'bg-medium', label: 'Parcial' },
  none: { dot: 'bg-critical', label: 'Sem cobertura' },
};

function fmtDateBR(iso: string): string { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function WorkforceClient({ unitId, isAdmin, grid, board, turnos, suggestedSectors, mapDate, mapTime, todayISO, isToday, isFuture, isNow, historical, availability, freelancers, simulation }: {
  unitId: string; isAdmin: boolean; grid: Grid; board: AllocBoard; turnos: Turno[]; suggestedSectors: string[];
  mapDate: string; mapTime: string; todayISO: string; isToday: boolean; isFuture: boolean; isNow: boolean;
  historical?: boolean; availability?: { working: string[]; off: string[] } | null; freelancers?: DayFreela[];
  simulation?: { assignments: { collaboratorId: string; name: string; sectorId: string; sectorName: string }[]; note: string | null; by: string; at: string } | null;
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

  function navTo(date: string, hora: string) {
    const sp = new URLSearchParams({ unit: unitId });
    if (date) sp.set('date', date);
    if (hora) sp.set('hora', hora);
    router.push(`/modulos/pessoas/mapa?${sp.toString()}`);
  }

  return (
    <div className="space-y-5">
      {isAdmin && <TurnosManager unitId={unitId} turnos={turnos} post={post} busy={busy} />}
      {isAdmin && <SectorsManager unitId={unitId} sectors={grid.sectors} suggested={suggestedSectors} post={post} busy={busy} />}

      {/* Quadro padrão: A alocar × Alocados */}
      <AllocationBoardEditor unitId={unitId} board={board} grid={grid} activeTurnos={activeTurnos} post={post} busy={busy} />
      {msg && <p className="text-sm font-medium text-critical">{msg}</p>}

      {/* Simulação de alocação para dia FUTURO (16/07): rascunho salvável */}
      {isFuture && (
        <SimulationPanel
          unitId={unitId} date={mapDate}
          working={availability?.working ?? []}
          board={board} sectors={grid.sectors}
          saved={simulation ?? null}
          post={post} busy={busy}
        />
      )}


      {/* Mapa da unidade — derivado da Escala (tempo real / por dia) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Mapa da unidade</h2>
            <p className="text-xs text-muted-foreground">
              {isNow
                ? <span className="font-semibold text-success">● Na unidade agora</span>
                : <span className={isFuture ? 'font-semibold text-accent' : 'font-semibold text-brand'}>
                    {isFuture ? 'Projeção' : isToday ? 'Hoje' : 'Histórico'} — {fmtDateBR(mapDate)}{mapTime ? ` às ${mapTime}` : ' (dia todo)'}
                  </span>}
              {' · '}{availability ? `${availability.working.length} escalado(s) no dia` : ''}
            </p>
          </div>
          {!historical && (
            <div className="flex gap-1">
              <button onClick={() => setView('planta')} className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold', view === 'planta' ? 'bg-primary text-primary-foreground' : 'border')}><LayoutGrid className="h-3.5 w-3.5" /> Planta</button>
              <button onClick={() => setView('lista')} className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold', view === 'lista' ? 'bg-primary text-primary-foreground' : 'border')}><List className="h-3.5 w-3.5" /> Lista</button>
            </div>
          )}
        </div>

        {/* Seletor de dia + horário: histórico (passado) e projeção (futuro), pela Escala */}
        <div className="space-y-2 rounded-lg border bg-card p-2">
          <div className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">Dia</Label><Input type="date" value={mapDate} onChange={(e) => navTo(e.target.value, mapTime)} className="h-10 text-sm" /></div>
            <div><Label className="text-xs">Horário</Label><Input type="time" value={mapTime} onChange={(e) => navTo(mapDate, e.target.value)} className="h-10 w-32 text-sm" /></div>
          </div>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => navTo('', '')} className={`rounded-full px-3 py-1 text-xs font-semibold ${isNow ? 'bg-primary text-primary-foreground' : 'border'}`}>Agora</button>
            <button onClick={() => navTo(addDaysISO(todayISO, 1), '')} className="rounded-full border px-3 py-1 text-xs font-semibold">Amanhã</button>
            <button onClick={() => navTo(addDaysISO(todayISO, 2), '')} className="rounded-full border px-3 py-1 text-xs font-semibold">Depois de amanhã</button>
            {mapTime && <button onClick={() => navTo(mapDate, '')} className="rounded-full border px-3 py-1 text-xs font-semibold text-accent">Dia inteiro</button>}
          </div>
          <p className="text-[11px] text-muted-foreground">Escolha um dia futuro para <b>projetar</b> a equipe (pela escala planejada) ou um dia passado para o <b>histórico</b>. Deixe o horário em branco para o dia todo.</p>
        </div>
        {isFuture && (
          <p className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">Projeção baseada na <b>escala planejada</b> — pode mudar se houver ajustes, faltas ou freelancers.</p>
        )}
        {grid.sectors.every((s) => grid.shifts.every((c) => (grid.cells[s.id]?.[c.label]?.length ?? 0) === 0)) && (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <p>{isNow ? 'Ninguém trabalhando na unidade neste momento.' : `Ninguém ${isFuture ? 'previsto' : 'registrado'} para ${fmtDateBR(mapDate)}${mapTime ? ` às ${mapTime}` : ''}.`}</p>
            {!historical && board.allocated.length > 0
              ? <p className="mt-1">Você já tem <b>{board.allocated.length}</b> pessoa(s) no quadro padrão, mas o mapa só mostra quem está <b>escalado para trabalhar</b> neste dia/horário. Cadastre a <b>Escala</b> em Pessoas → Escala para o mapa preencher.</p>
              : <p className="mt-1">O mapa segue a Escala — confira em Pessoas → Escala.</p>}
          </div>
        )}

        {/* Freelancers do dia: alocar em um setor (ficam disponíveis após o pedido de pagamento) */}
        <FreelancersPanel freelancers={freelancers ?? []} sectors={grid.sectors} isToday={isToday} post={post} busy={busy} />

        {historical && <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Foto do dia (histórico congelado) — somente leitura.</p>}
        {!historical && view === 'planta' && <UnitFloorplan grid={grid} />}

        {(historical || view === 'lista') && grid.sectors.length === 0 && <p className="text-sm text-muted-foreground">Sem registro para este dia.</p>}
        {(historical || view === 'lista') && grid.sectors.map((s) => (
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
                      {people.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {people.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">{p.name}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {(freelancers ?? []).filter((f) => f.sectorId === s.id && (isToday ? f.present : true)).length > 0 && (
              <div className="mt-2 rounded-md bg-accent/5 p-2">
                <p className="text-xs font-bold text-accent">Freelancers</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(freelancers ?? []).filter((f) => f.sectorId === s.id && (isToday ? f.present : true)).map((f) => (
                    <span key={f.requestId} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs">{f.name}{f.startTime && f.endTime ? ` (${f.startTime}-${f.endTime})` : ''}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Freelancers do dia ───────── */
function FreelancersPanel({ freelancers, sectors, isToday, post, busy }: {
  freelancers: DayFreela[]; sectors: Grid['sectors']; isToday: boolean;
  post: (p: Record<string, unknown>) => Promise<boolean>; busy: boolean;
}) {
  if (freelancers.length === 0) return null;
  const selCls = 'h-9 rounded-lg border-2 border-input bg-background px-2 text-xs';
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">Freelancers do dia ({freelancers.length})</p>
      <div className="space-y-1.5">
        {freelancers.map((f) => (
          <div key={f.requestId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-brand">{f.name}{isToday && !f.present ? <span className="ml-1 text-xs font-normal text-muted-foreground">(fora do horário agora)</span> : ''}</span>
              <span className="block text-xs text-muted-foreground">{f.startTime && f.endTime ? `${f.startTime}-${f.endTime}` : 'sem horário'}{f.sectorName ? ` · ${f.sectorName}` : ''}</span>
            </span>
            <select className={selCls} value={f.sectorId ?? ''} disabled={busy} onChange={(e) => post({ action: 'assignFreelancerSector', requestId: f.requestId, sectorId: e.target.value || null })}>
              <option value="">Sem setor…</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
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
  const [eTitle, setETitle] = useState('');
  const [eTitleOrig, setETitleOrig] = useState('');
  function openEdit(a: AllocBoard['allocated'][number]) {
    setEditId(a.allocationId); setESector(a.sectorId); setETurno(a.shiftId ?? (activeTurnos[0]?.id ?? ''));
    setETitle(a.jobTitle ?? ''); setETitleOrig(a.jobTitle ?? '');
  }

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
                <div className="mt-2">
                  <Label className="text-xs">Função (cargo) — mudar avisa o RH</Label>
                  <Input value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="Ex.: Churrasqueiro" className="h-10 text-sm" />
                  {eTitle.trim() !== eTitleOrig.trim() && eTitle.trim() !== '' && (
                    <p className="mt-1 text-xs text-accent">A mudança de função vira uma solicitação ao RH (os Admins são avisados). O cargo atualiza no SGO quando o RH efetivar.</p>
                  )}
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
                  <Button size="sm" disabled={busy || !eSector || !eTurno} onClick={async () => {
                    const ok = await post({ action: 'updateAllocation', id: a.allocationId, sectorId: eSector, shiftId: eTurno });
                    if (!ok) return;
                    const newTitle = eTitle.trim();
                    if (newTitle && newTitle !== eTitleOrig.trim() && a.collaboratorId) {
                      await post({ action: 'changeFunction', collaboratorId: a.collaboratorId, newTitle });
                    }
                    setEditId(null);
                  }}><Save className="h-4 w-4" /> Salvar</Button>
                </div>
              </div>
            ) : (
              <div key={a.allocationId} className="flex items-center justify-between gap-2 rounded-md border bg-card p-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-brand">{a.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.jobTitle ? `${a.jobTitle} · ` : ''}{a.sectorName} · {a.shiftLabel}</span>
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


/* ───────── Simulação de dia futuro (16/07) ───────── */
function SimulationPanel({ unitId, date, working, board, sectors, saved, post, busy }: {
  unitId: string; date: string; working: string[]; board: AllocBoard;
  sectors: { id: string; name: string }[];
  saved: { assignments: { collaboratorId: string; name: string; sectorId: string; sectorName: string }[]; note: string | null; by: string; at: string } | null;
  post: (p: Record<string, unknown>) => Promise<boolean>; busy: boolean;
}) {
  // Escalados do dia (pela Escala) com o setor: começa do salvo, senão do quadro padrão
  const workingSet = new Set(working);
  const base = board.allocated.filter((a) => a.collaboratorId && workingSet.has(a.collaboratorId));
  const savedBy = new Map((saved?.assignments ?? []).map((a) => [a.collaboratorId, a.sectorId]));
  const [open, setOpen] = useState(Boolean(saved));
  const [assign, setAssign] = useState<Record<string, string>>(
    () => Object.fromEntries(base.map((a) => [a.collaboratorId, savedBy.get(a.collaboratorId) ?? a.sectorId])),
  );
  const [note, setNote] = useState(saved?.note ?? '');
  const secName = (id: string) => sectors.find((s) => s.id === id)?.name ?? '—';

  if (base.length === 0) return null;
  return (
    <div className="rounded-lg border border-dashed border-accent/50 p-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <p className="text-sm font-bold text-brand">🧪 Simulação de alocação — {date.split('-').reverse().join('/')}</p>
        <span className="text-xs font-semibold text-accent">{saved ? `salva por ${saved.by} em ${new Date(saved.at).toLocaleDateString('pt-BR')}` : open ? 'fechar' : 'simular'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-muted-foreground">Monte como a equipe ficaria neste dia (não altera o quadro padrão). Salve para revisitar/compartilhar.</p>
          {base.map((a) => (
            <div key={a.collaboratorId} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm">{a.name}</span>
              <select
                value={assign[a.collaboratorId] ?? a.sectorId}
                onChange={(e) => setAssign((s) => ({ ...s, [a.collaboratorId]: e.target.value }))}
                className="h-9 w-44 shrink-0 rounded-lg border-2 border-input bg-background px-2 text-sm"
              >
                {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          ))}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação da simulação (opcional)" className="h-9 text-sm" />
          <Button size="sm" className="w-full" disabled={busy} onClick={() => void post({
            action: 'saveSimulation', unitId, date,
            assignments: base.map((a) => ({ collaboratorId: a.collaboratorId, name: a.name, sectorId: assign[a.collaboratorId] ?? a.sectorId, sectorName: secName(assign[a.collaboratorId] ?? a.sectorId) })),
            note,
          })}><Save className="h-4 w-4" /> Salvar simulação</Button>
        </div>
      )}
    </div>
  );
}
