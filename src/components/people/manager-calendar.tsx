'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TimePicker } from '@/components/ui/ds/time-picker';
import type { ManagerCalendar, CalUnit, CalDay, CalManager } from '@/lib/manager-schedule';

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WD_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Calendário consolidado de gerência por unidade (20/07) — dias sem gerente destacados. */
export function ManagerCalendar({ data, isAdmin = false }: { data: ManagerCalendar; isAdmin?: boolean }) {
  if (data.units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade no escopo.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-lg border border-dashed p-2 text-xs">
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-sgo-success" /> Com gerente</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-danger" /> Sem gerente (buraco)</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-sunken" /> Sem horário cadastrado</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded bg-sgo-brand/40" /> Folga/férias</span>
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
  if (!open) return <button onClick={() => setOpen(true)} className="ml-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold text-sgo-brand">Editar horário</button>;
  return (
    <div className="mt-1 w-full rounded-md border border-sgo-brand/40 bg-sgo-surface p-2">
      <div className="flex flex-wrap items-center gap-1">
        {WD_FULL.map((w, i) => (
          <button key={i} type="button" onClick={() => toggle(i)} className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${days.includes(i) ? 'bg-sgo-brand text-on-brand border-sgo-brand' : 'text-ink-500'}`}>{w}</button>
        ))}
        <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} className="ml-1 rounded-full border border-dashed px-2 py-1 text-[10px] font-semibold text-sgo-brand">Todos os dias</button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <TimePicker aria-label="Hora de início" size="sm" className="w-24" value={start || null} onValueChange={(v) => setStart(v ?? '')} />
        <span className="text-xs text-ink-500">até</span>
        <TimePicker aria-label="Hora de fim" size="sm" className="w-24" value={end || null} onValueChange={(v) => setEnd(v ?? '')} />
        <button onClick={() => void save()} disabled={busy} className="rounded bg-sgo-brand px-2 py-1 text-xs font-semibold text-on-brand disabled:opacity-60">Salvar</button>
        <button onClick={() => setOpen(false)} className="rounded border px-2 py-1 text-xs">Cancelar</button>
      </div>
    </div>
  );
}

function firstName(n: string): string { return n.trim().split(/\s+/)[0]; }
function hourNum(t: string | null): number | null { if (!t) return null; const m = /^(\d{1,2}):/.exec(t); return m ? Number(m[1]) : null; }

/** Grade semanal por horário (linha de horários à esquerda) — mostra nomes e horas sem gerente (20/07). */
function WeeklyTimetable({ managers }: { managers: CalManager[] }) {
  const scheduled = managers.filter((m) => m.hasSchedule);
  if (scheduled.length === 0) return null;
  // Faixa de horas = união dos horários cadastrados (padrão 8..23 se algum for "dia todo")
  let minH = 24, maxH = 0; let anyFullDay = false;
  for (const m of scheduled) {
    const s = hourNum(m.startTime); const e = hourNum(m.endTime);
    if (s == null || e == null) { anyFullDay = true; continue; }
    minH = Math.min(minH, s); maxH = Math.max(maxH, e);
  }
  if (anyFullDay || minH >= maxH) { minH = Math.min(minH === 24 ? 8 : minH, 8); maxH = Math.max(maxH, 23); }
  const hours: number[] = [];
  for (let h = minH; h < maxH; h++) hours.push(h);

  function coverFor(wd: number, h: number): string[] {
    return scheduled.filter((m) => {
      if (!m.weekdays.includes(wd)) return false;
      const s = hourNum(m.startTime); const e = hourNum(m.endTime);
      if (s == null || e == null) return true; // dia todo
      return h >= s && h < e;
    }).map((m) => firstName(m.name));
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Grade semanal por horário</p>
      <table className="w-full border-collapse text-center text-[10px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-sgo-surface p-1 text-ink-500">hora</th>
            {WD_FULL.map((w, i) => <th key={i} className="p-1 font-semibold text-ink-500">{w}</th>)}
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h}>
              <td className="sticky left-0 bg-sgo-surface p-1 font-mono text-ink-500">{String(h).padStart(2, '0')}h</td>
              {WD_FULL.map((_, wd) => {
                const names = coverFor(wd, h);
                return (
                  <td key={wd} className={`border p-1 ${names.length ? 'bg-sgo-success/70 text-white' : 'bg-danger/15 text-danger'}`} title={names.length ? names.join(', ') : 'sem gerente'}>
                    {names.length ? names.join(', ') : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-ink-500">Verde = gerente presente (nome). Vermelho = sem gerente naquele horário.</p>
    </div>
  );
}

function UnitCalendar({ unit, year, month, isAdmin = false }: { unit: CalUnit; year: number; month: number; isAdmin?: boolean }) {
  const [sel, setSel] = useState<CalDay | null>(null);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const blanks = Array.from({ length: firstWeekday });
  const anySchedule = unit.managers.some((m) => m.hasSchedule);

  function cellClass(d: CalDay): string {
    if (d.working.length > 0) return 'bg-sgo-success/80 text-white';
    if (d.onLeave.length > 0 && !anySchedule) return 'bg-sgo-brand/30';
    if (!anySchedule) return 'bg-sunken text-ink-500';
    return 'bg-danger/80 text-white'; // gap
  }

  return (
    <div className="rounded-lg border bg-sgo-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-sgo-brand">{unit.unitName}</p>
        <div className="flex flex-wrap gap-1 text-xs">
          {unit.gapDays > 0 && <span className="rounded-full bg-danger/10 px-2 py-0.5 font-semibold text-danger">{unit.gapDays} dia(s) sem gerente</span>}
          {unit.noScheduleCount > 0 && <span className="rounded-full bg-sunken px-2 py-0.5 font-medium text-ink-500">{unit.noScheduleCount} gerente(s) sem horário</span>}
          {unit.gapDays === 0 && unit.noScheduleCount === 0 && anySchedule && <span className="rounded-full bg-sgo-success/10 px-2 py-0.5 font-semibold text-sgo-success">Cobertura completa</span>}
        </div>
      </div>

      {/* Alerta: gerente 7+ dias sem folga lançada (também notifica admin/supervisor) */}
      {unit.missingFolgaNames.length > 0 && (
        <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          ⚠ Sem folga lançada há 7+ dias: {unit.missingFolgaNames.join(', ')}. Cobrar o lançamento da folga.
        </p>
      )}

      {/* Gerentes e padrão semanal */}
      <div className="mt-2 flex flex-wrap gap-2">
        {unit.managers.length === 0 && <span className="text-xs text-ink-500">Sem gerente vinculado.</span>}
        {unit.managers.map((m) => (
          <span key={m.userId} className="flex flex-wrap items-center rounded-lg border px-2 py-1 text-xs">
            <b className="text-sgo-brand">{m.name}</b>{' '}
            {m.hasSchedule ? <span className="ml-1 text-ink-500">{m.weekdays.map((w) => WD_FULL[w]).join(', ')}{m.time ? ` · ${m.time}` : ''}</span> : <span className="ml-1 text-danger">sem horário cadastrado</span>}
            {isAdmin && <AdminScheduleEditor m={m} />}
          </span>
        ))}
      </div>

      {/* Grade semanal por horário (nomes + horas sem gerente) */}
      <WeeklyTimetable managers={unit.managers} />

      {/* Grade do mês */}
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WD.map((w, i) => <div key={i} className="text-[10px] font-bold uppercase text-ink-500">{w}</div>)}
        {blanks.map((_, i) => <div key={`b${i}`} />)}
        {unit.days.map((d) => (
          <button key={d.day} onClick={() => setSel(sel?.day === d.day ? null : d)} className={`min-h-[2.4rem] rounded px-0.5 py-0.5 text-xs font-semibold ${cellClass(d)} ${sel?.day === d.day ? 'ring-2 ring-sgo-brand' : ''}`} title={d.working.length ? `Gerente(s): ${d.working.join(', ')}` : d.gap ? 'Sem gerente' : ''}>
            <span className="block leading-tight">{d.day}</span>
            {d.working.length > 0 && <span className="block truncate text-[8px] font-normal leading-tight">{d.working.map(firstName).join(', ')}</span>}
          </button>
        ))}
      </div>

      {sel && (
        <div className="mt-2 rounded-lg bg-canvas p-2 text-xs">
          <p className="font-semibold text-sgo-brand">{WD_FULL[sel.weekday]}, dia {sel.day}</p>
          {sel.working.length > 0 && <p className="text-sgo-success">Trabalhando: {sel.working.join(', ')}</p>}
          {sel.onLeave.length > 0 && <p className="text-sgo-brand">Folga/férias: {sel.onLeave.map((l) => `${l.name} (${l.kind === 'FERIAS' ? 'férias' : 'folga'})`).join(', ')}</p>}
          {sel.gap && <p className="font-semibold text-danger">⚠ Nenhum gerente nesta unidade neste dia — realocar reserva.</p>}
          {sel.working.length === 0 && !sel.gap && sel.onLeave.length === 0 && <p className="text-ink-500">Sem informação (horário não cadastrado).</p>}
        </div>
      )}
    </div>
  );
}
