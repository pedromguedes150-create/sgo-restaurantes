'use client';

import { useState } from 'react';
import type { ManagerCalendar, CalUnit, CalDay } from '@/lib/manager-schedule';

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WD_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Calendário consolidado de gerência por unidade (20/07) — dias sem gerente destacados. */
export function ManagerCalendar({ data }: { data: ManagerCalendar }) {
  if (data.units.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma unidade no escopo.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-lg border border-dashed p-2 text-xs">
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-success" /> Com gerente</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-critical" /> Sem gerente (buraco)</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-muted" /> Sem horário cadastrado</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-accent/40" /> Folga/férias</span>
      </div>
      {data.units.map((u) => <UnitCalendar key={u.unitId} unit={u} year={data.year} month={data.month} />)}
    </div>
  );
}

function UnitCalendar({ unit, year, month }: { unit: CalUnit; year: number; month: number }) {
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
          <span key={m.userId} className="rounded-lg border px-2 py-1 text-xs">
            <b className="text-brand">{m.name}</b>{' '}
            {m.hasSchedule ? <span className="text-muted-foreground">{m.weekdays.map((w) => WD_FULL[w]).join(', ')}{m.time ? ` · ${m.time}` : ''}</span> : <span className="text-critical">sem horário cadastrado</span>}
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
