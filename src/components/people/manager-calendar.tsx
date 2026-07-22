'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ManagerCalendar, CalUnit, CalDay, CalManager } from '@/lib/manager-schedule';

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WD_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Calendário consolidado de gerência por unidade (20/07) — dias sem gerente destacados. */
export function ManagerCalendar({ data, isAdmin = false }: { data: ManagerCalendar; isAdmin?: boolean }) {
  if (data.units.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma unidade no escopo.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-lg border border-dashed p-2 text-xs">
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-success" /> Com gerente</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-critical" /> Sem gerente (buraco)</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-muted" /> Sem horário cadastrado</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-accent/40" /> Folga/férias</span>
      </div>
      {data.units.map((u) => <UnitCalendar key={u.unitId} unit={u} year={data.year} month={data.month} isAdmin={isAdmin} />)}
    </div>
  );
}

/** Editor admin do horário de um gerente (padrão semanal) — só ADMIN/CEO. */
function AdminScheduleEditor({ m }: { m: CalManager }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>(m.weekdays);
  const [start, setStart] = useState(m.startTime ?? '');
  const [end, setEnd] = useState(m.endTime ?? '');
  const [busy, setBusy] = useState(false);
  const toggle = (d: number) => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort((a, b) => a - b)));
  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/manager-area', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'workSchedule', action: 'setForUser', userId: m.userId, weekdays: days, startTime: start || null, endTime: end || null }) });
      if (res.ok) { setOpen(false); router.refresh(); } else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }
  if (!open) return <button onClick={() => setOpen(true)} className="ml-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold text-accent">Editar horário</button>;
  return (
    <div className="mt-1 w-full rounded-md border border-accent/40 bg-background p-2">
      <div className="flex flex-wrap gap-1">
        {WD_FULL.map((w, i) => (
          <button key={i} type="button" onClick={() => toggle(i)} className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${days.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>{w}</button>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 rounded border-2 border-input bg-background px-1.5 text-xs" />
        <span className="text-xs text-muted-foreground">até</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 rounded border-2 border-input bg-background px-1.5 text-xs" />
        <button onClick={() => void save()} disabled={busy} className="rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60">Salvar</button>
        <button onClick={() => setOpen(false)} className="rounded border px-2 py-1 text-xs">Cancelar</button>
      </div>
    </div>
  );
}

function UnitCalendar({ unit, year, month, isAdmin = false }: { unit: CalUnit; year: number; month: number; isAdmin?: boolean }) {
  const [sel, setSel] = useState<CalDay | null>(null);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const blanks = Array.from({ length: firstWeekday });
  const anySchedule = unit.managers.some((m) => m.hasSchedule);

  function cellClass(d: CalDay): string {
    if (d.working.length > 0) return 'bg-success/80 text-white';
    if (d.onLeave.length > 0 && !anySchedule) return 'bg-accent/30';
    if (!anySchedule) return 'bg-muted text-muted-foreground';
    return 'bg-critical/80 text-white'; // gap
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-brand">{unit.unitName}</p>
        <div className="flex flex-wrap gap-1 text-xs">
          {unit.gapDays > 0 && <span className="rounded-full bg-critical/10 px-2 py-0.5 font-semibold text-critical">{unit.gapDays} dia(s) sem gerente</span>}
          {unit.noScheduleCount > 0 && <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">{unit.noScheduleCount} gerente(s) sem horário</span>}
          {unit.gapDays === 0 && unit.noScheduleCount === 0 && anySchedule && <span className="rounded-full bg-success/10 px-2 py-0.5 font-semibold text-success">Cobertura completa</span>}
        </div>
      </div>

      {/* Gerentes e padrão semanal */}
      <div className="mt-2 flex flex-wrap gap-2">
        {unit.managers.length === 0 && <span className="text-xs text-muted-foreground">Sem gerente vinculado.</span>}
        {unit.managers.map((m) => (
          <span key={m.userId} className="flex flex-wrap items-center rounded-lg border px-2 py-1 text-xs">
            <b className="text-brand">{m.name}</b>{' '}
            {m.hasSchedule ? <span className="ml-1 text-muted-foreground">{m.weekdays.map((w) => WD_FULL[w]).join(', ')}{m.time ? ` · ${m.time}` : ''}</span> : <span className="ml-1 text-critical">sem horário cadastrado</span>}
            {isAdmin && <AdminScheduleEditor m={m} />}
          </span>
        ))}
      </div>

      {/* Grade do mês */}
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WD.map((w, i) => <div key={i} className="text-[10px] font-bold uppercase text-muted-foreground">{w}</div>)}
        {blanks.map((_, i) => <div key={`b${i}`} />)}
        {unit.days.map((d) => (
          <button key={d.day} onClick={() => setSel(sel?.day === d.day ? null : d)} className={`aspect-square rounded text-xs font-semibold ${cellClass(d)} ${sel?.day === d.day ? 'ring-2 ring-brand' : ''}`} title={d.working.length ? `Gerente(s): ${d.working.join(', ')}` : d.gap ? 'Sem gerente' : ''}>
            {d.day}
          </button>
        ))}
      </div>

      {sel && (
        <div className="mt-2 rounded-lg bg-surface p-2 text-xs">
          <p className="font-semibold text-brand">{WD_FULL[sel.weekday]}, dia {sel.day}</p>
          {sel.working.length > 0 && <p className="text-success">Trabalhando: {sel.working.join(', ')}</p>}
          {sel.onLeave.length > 0 && <p className="text-accent">Folga/férias: {sel.onLeave.map((l) => `${l.name} (${l.kind === 'FERIAS' ? 'férias' : 'folga'})`).join(', ')}</p>}
          {sel.gap && <p className="font-semibold text-critical">⚠ Nenhum gerente nesta unidade neste dia — realocar reserva.</p>}
          {sel.working.length === 0 && !sel.gap && sel.onLeave.length === 0 && <p className="text-muted-foreground">Sem informação (horário não cadastrado).</p>}
        </div>
      )}
    </div>
  );
}
