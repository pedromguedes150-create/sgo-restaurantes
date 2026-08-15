'use client';

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, CopyCheck, FileSpreadsheet, Printer, CalendarPlus, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';
import { cn } from '@/lib/utils';

type DayStatus = 'WORK' | 'OFF' | 'FALTA_INJUST' | 'FALTA_JUST' | 'ATESTADO' | 'FERIAS' | 'ATRASO';
type ScheduleType = 'TWELVE36_ODD' | 'TWELVE36_EVEN' | 'SIX_ONE' | 'FIVE_TWO' | 'CUSTOM';
interface Cell { planned: DayStatus; actual: DayStatus | null }
interface Row { collaboratorId: string; name: string; jobTitle: string | null; typeLabel: string; scheduleType: ScheduleType; shiftLabel: string | null; days: Cell[] }
interface Grid { year: number; month: number; daysCount: number; rows: Row[]; withoutSchedule: { id: string; name: string }[] }
interface Unit { id: string; name: string }
interface Turno { id: string; name: string; startTime: string | null; endTime: string | null }
interface Pattern { collaboratorId: string; scheduleType: ScheduleType; anchorDate: string; shiftId: string | null; customMask: string | null }

/**
 * Fundo pelos tokens `-bg`, não por tinta da própria cor: a 15-25% o par
 * texto/fundo ficava em 5,57-6,63:1, abaixo do AAA. Atestado usava
 * bg-blue-100/text-blue-700 — cor crua do Tailwind, fora do sistema — e passou
 * a usar `info`, que é o token para o que é informativo e não é alerta.
 */
const STATUS: Record<DayStatus, { code: string; cls: string }> = {
  WORK:         { code: 'T',  cls: 'bg-sgo-brand text-on-brand' },
  OFF:          { code: 'F',  cls: 'border border-line-strong text-ink-500' },
  FALTA_INJUST: { code: 'FI', cls: 'bg-danger-bg text-danger border border-danger/40' },
  FALTA_JUST:   { code: 'FJ', cls: 'bg-warning-bg text-warning border border-warning/50' },
  ATESTADO:     { code: 'A',  cls: 'bg-info-bg text-info border border-info/40' },
  FERIAS:       { code: 'FE', cls: 'bg-sgo-success-bg text-sgo-success border border-sgo-success/40' },
  ATRASO:       { code: 'AT', cls: 'bg-warning-bg text-warning border border-warning/40' },
};
const STATUS_ORDER: DayStatus[] = ['WORK', 'ATRASO', 'OFF', 'FALTA_INJUST', 'FALTA_JUST', 'ATESTADO', 'FERIAS'];
const ABSENCE: DayStatus[] = ['FALTA_INJUST', 'FALTA_JUST', 'ATESTADO', 'FERIAS'];
const TYPE_OPTIONS: { value: ScheduleType; label: string }[] = [
  { value: 'TWELVE36_ODD', label: '12x36 — Turno Ímpar' },
  { value: 'TWELVE36_EVEN', label: '12x36 — Turno Par' },
  { value: 'SIX_ONE', label: '6x1' },
  { value: 'FIVE_TWO', label: '5x2' },
  { value: 'CUSTOM', label: 'Personalizada' },
];
const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function ScheduleClient({ units, selectedUnitId, year, month, grid, collaborators, turnos, patterns }: {
  units: Unit[]; selectedUnitId: string; year: number; month: number; grid: Grid; collaborators: Unit[]; turnos: Turno[]; patterns: Pattern[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'planejado' | 'realizado' | 'comparacao'>('realizado');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null); // `${collabId}:${day}`
  const [showAbsence, setShowAbsence] = useState(false);
  const [showPattern, setShowPattern] = useState(grid.rows.length === 0);

  function nav(params: Record<string, string | number>) {
    const sp = new URLSearchParams({ unit: selectedUnitId, year: String(year), month: String(month), ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    router.push(`/modulos/escala?${sp.toString()}`);
  }

  async function postJson(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error ?? 'Falha'); return false; }
      router.refresh(); return true;
    } finally { setBusy(false); }
  }

  async function setCell(collaboratorId: string, day: number, status: DayStatus | 'CLEAR') {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setEdit(null);
    if (status === 'CLEAR') await postJson({ action: 'clearActual', collaboratorId, unitId: selectedUnitId, date });
    else await postJson({ action: 'setActual', collaboratorId, unitId: selectedUnitId, date, status });
  }

  const wdOf = (d: number) => WD[new Date(Date.UTC(year, month - 1, d, 12)).getUTCDay()];
  const isWeekend = (d: number) => { const w = new Date(Date.UTC(year, month - 1, d, 12)).getUTCDay(); return w === 0 || w === 6; };

  const exportUrl = (m: 'realizado' | 'planejado') => `/api/schedule/export?unit=${selectedUnitId}&year=${year}&month=${month}&mode=${m}`;

  return (
    <div className="space-y-4">
      {/* Filtros + ações */}
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44"><Select label="Unidade" size="sm" value={selectedUnitId} onValueChange={(v) => nav({ unit: v })} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} /></div>
          <div className="w-36"><Select label="Mês" size="sm" value={String(month)} onValueChange={(v) => nav({ month: v })} options={MONTHS.map((mn, i) => ({ value: String(i + 1), label: mn }))} /></div>
          <div className="w-28"><Select label="Ano" size="sm" value={String(year)} onValueChange={(v) => nav({ year: v })} options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={exportUrl(mode === 'planejado' ? 'planejado' : 'realizado')}><Button size="sm" variant="outline"><FileSpreadsheet className="h-4 w-4" /> Excel</Button></a>
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> PDF</Button>
        </div>
      </div>

      {/* Modo */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {(['planejado', 'realizado', 'comparacao'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={cn('rounded-full px-3 py-1.5 text-sm font-semibold', mode === m ? 'bg-sgo-brand text-on-brand' : 'border')}>
            {m === 'planejado' ? 'Planejado' : m === 'realizado' ? 'Realizado' : 'Comparação'}
          </button>
        ))}
        {mode === 'realizado' && (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm('Preencher os dias vazios do Realizado com o Planejado? Não sobrescreve o que você já marcou.')) postJson({ action: 'fill', unitId: selectedUnitId, year, month, mode: 'empty' }); }}><Wand2 className="h-4 w-4" /> Preencher automaticamente</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm('Copiar TODO o Planejado para o Realizado do mês? Isto sobrescreve o Realizado atual.')) postJson({ action: 'fill', unitId: selectedUnitId, year, month, mode: 'all' }); }}><CopyCheck className="h-4 w-4" /> Puxar Realizado = Planejado</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAbsence((v) => !v)}><CalendarPlus className="h-4 w-4" /> Registrar ausência</Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => setShowPattern((v) => !v)}><Settings2 className="h-4 w-4" /> Cadastrar escala</Button>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-2 text-xs print:gap-3">
        {STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className={cn('inline-flex h-5 w-6 items-center justify-center rounded text-[11px] font-bold', STATUS[s].cls)}>{STATUS[s].code}</span>
            {s === 'WORK' ? 'Trabalho' : s === 'ATRASO' ? 'Atraso' : s === 'OFF' ? 'Folga' : s === 'FALTA_INJUST' ? 'Falta injustificada' : s === 'FALTA_JUST' ? 'Falta justificada' : s === 'ATESTADO' ? 'Atestado' : 'Férias'}
          </span>
        ))}
      </div>

      {showAbsence && mode === 'realizado' && <AbsencePanel unitId={selectedUnitId} collaborators={collaborators} onDone={() => { setShowAbsence(false); router.refresh(); }} />}
      {showPattern && <PatternPanel unitId={selectedUnitId} collaborators={collaborators} turnos={turnos} patterns={patterns} onDone={() => router.refresh()} busy={busy} post={postJson} />}

      {mode === 'comparacao' && <p className="rounded-lg bg-sunken/50 px-3 py-2 text-xs text-ink-500 print:hidden">Em cada dia: <b>linha de cima = Planejado</b>, <b>linha de baixo = Realizado</b>. Células destacadas indicam divergência.</p>}

      {/* Grade */}
      {grid.rows.length === 0 ? (
        <p className="text-sm text-ink-500">Nenhum colaborador com escala cadastrada nesta unidade. Use “Cadastrar escala”.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full border-collapse text-center text-xs">
            <thead>
              <tr className="bg-sgo-brand text-on-brand">
                <th className="sticky left-0 z-10 min-w-[184px] bg-sgo-brand px-2 py-2 text-left">Colaborador</th>
                {Array.from({ length: grid.daysCount }, (_, i) => i + 1).map((d) => (
                  <th key={d} className={cn('px-1 py-1 font-medium', isWeekend(d) && 'bg-white/10')}>
                    <div className="text-[10px] opacity-80">{wdOf(d)}</div>
                    <div>{d}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row, idx) => {
                const showGroup = idx === 0 || grid.rows[idx - 1].typeLabel !== row.typeLabel;
                return (
                  <Fragment key={row.collaboratorId}>
                    {showGroup && (
                      <tr className="bg-sunken">
                        <td colSpan={grid.daysCount + 1} className="px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">{row.typeLabel}</td>
                      </tr>
                    )}
                    <tr className="border-t">
                      <td className="sticky left-0 z-10 min-w-[184px] bg-sgo-surface px-2 py-1.5 text-left">
                        <div className="font-semibold text-sgo-brand">{row.name}</div>
                        <div className="text-[10px] text-ink-500">{row.jobTitle ?? ''}{row.shiftLabel ? ` · ${row.shiftLabel}` : ''}</div>
                      </td>
                      {row.days.map((cell, i) => {
                        const day = i + 1;
                        const key = `${row.collaboratorId}:${day}`;
                        if (mode === 'comparacao') {
                          const act = cell.actual;
                          const diff = act !== null && act !== cell.planned;
                          return (
                            <td key={day} className={cn('px-0.5 py-0.5', diff && 'bg-danger/10', isWeekend(day) && !diff && 'bg-sunken/40')}>
                              <div className={cn('mx-auto flex h-5 w-6 items-center justify-center rounded text-[10px] font-bold', STATUS[cell.planned].cls)}>{STATUS[cell.planned].code}</div>
                              <div className={cn('mx-auto mt-0.5 flex h-5 w-6 items-center justify-center rounded text-[10px] font-bold', act ? STATUS[act].cls : 'text-ink-500')}>{act ? STATUS[act].code : '—'}</div>
                            </td>
                          );
                        }
                        const st = mode === 'planejado' ? cell.planned : cell.actual;
                        if (mode === 'realizado' && edit === key) {
                          return (
                            <td key={day} className="px-0.5 py-0.5">
                              {/* Editor da célula: abre já aberto (o clique na
                                  célula é que abriu) e fecha ao escolher/sair. */}
                              <div className="w-16">
                                <Select
                                  aria-label={`Status de ${row.name} no dia ${day}`}
                                  size="sm"
                                  defaultOpen
                                  onClose={() => setEdit(null)}
                                  value={cell.actual ?? ''}
                                  onValueChange={(v) => setCell(row.collaboratorId, day, (v || 'CLEAR') as DayStatus | 'CLEAR')}
                                  options={[{ value: '', label: '—' }, ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS[s].code }))]}
                                />
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={day} className={cn('px-0.5 py-0.5', isWeekend(day) && 'bg-sunken/40')}>
                            <button
                              disabled={mode !== 'realizado'}
                              onClick={() => mode === 'realizado' && setEdit(key)}
                              className={cn('mx-auto flex h-6 w-7 items-center justify-center rounded text-[11px] font-bold', st ? STATUS[st].cls : 'border border-dashed border-line-strong text-ink-500', mode === 'realizado' && 'cursor-pointer hover:ring-2 hover:ring-sgo-brand')}
                            >
                              {st ? STATUS[st].code : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────── Painel: registrar ausência ───────── */
function AbsencePanel({ unitId, collaborators, onDone }: { unitId: string; collaborators: Unit[]; onDone: () => void }) {
  const [collaboratorId, setCollaboratorId] = useState('');
  const [status, setStatus] = useState<DayStatus>('FALTA_INJUST');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!collaboratorId || !start || !end) { setMsg('Selecione colaborador e período.'); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.set('unitId', unitId); fd.set('collaboratorId', collaboratorId); fd.set('status', status);
      fd.set('start', start); fd.set('end', end || start); fd.set('reason', reason); fd.set('note', note);
      if (file) fd.set('attachment', file);
      const res = await fetch('/api/schedule/absence', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border bg-sgo-surface p-3 print:hidden">
      <h3 className="mb-2 text-sm font-bold text-sgo-brand">Registrar ausência</h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <div className="col-span-2 md:col-span-1">
          <Select label="Colaborador" size="sm" placeholder="Selecione…" value={collaboratorId} onValueChange={setCollaboratorId} options={collaborators.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
        <Select
          label="Tipo" size="sm" value={status} onValueChange={(v) => setStatus(v as DayStatus)}
          options={ABSENCE.map((s) => ({
            value: s,
            label: s === 'FALTA_INJUST' ? 'Falta injustificada' : s === 'FALTA_JUST' ? 'Falta justificada' : s === 'ATESTADO' ? 'Atestado' : 'Férias',
            hint: STATUS[s].code,
          }))}
        />
        <DatePicker label="Início" size="sm" value={start || null} onValueChange={(v) => setStart(v ?? '')} />
        <DatePicker label="Fim" size="sm" value={end || null} onValueChange={(v) => setEnd(v ?? '')} min={start || undefined} />
        <div className="col-span-2 md:col-span-1"><Label className="text-xs">Motivo (opcional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 text-sm" /></div>
        <div className="col-span-2"><Label className="text-xs">Observações (opcional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} className="h-10 text-sm" /></div>
        <div className="col-span-2 md:col-span-1"><Label className="text-xs">Anexo (foto/PDF do atestado)</Label><Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-10 text-sm" /></div>
      </div>
      {msg && <p className="mt-2 text-sm font-medium text-danger">{msg}</p>}
      <Button className="mt-2" size="sm" disabled={busy} onClick={submit}>Salvar ausência</Button>
    </div>
  );
}

/* ───────── Painel: cadastrar/editar escala (padrão) ───────── */
function PatternPanel({ unitId, collaborators, turnos, patterns, post, busy }: { unitId: string; collaborators: Unit[]; turnos: Turno[]; patterns: Pattern[]; post: (p: Record<string, unknown>) => Promise<boolean>; busy: boolean; onDone: () => void }) {
  const existing = new Map(patterns.map((p) => [p.collaboratorId, p]));
  const [collaboratorId, setCollaboratorId] = useState('');
  const [type, setType] = useState<ScheduleType>('TWELVE36_ODD');
  const [anchor, setAnchor] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [mask, setMask] = useState('TTTTTFF');

  function load(id: string) {
    setCollaboratorId(id);
    const p = existing.get(id);
    if (p) { setType(p.scheduleType); setAnchor(p.anchorDate); setShiftId(p.shiftId ?? ''); setMask(p.customMask ?? 'TTTTTFF'); }
    else { setType('TWELVE36_ODD'); setAnchor(''); setShiftId(''); setMask('TTTTTFF'); }
  }

  const needsAnchor = type !== 'TWELVE36_ODD' && type !== 'TWELVE36_EVEN';

  async function save() {
    if (!collaboratorId) return alert('Selecione o colaborador.');
    if (needsAnchor && !anchor) return alert('Informe a data de início do ciclo.');
    await post({ action: 'savePattern', collaboratorId, unitId, scheduleType: type, anchorDate: anchor || `${new Date().getFullYear()}-01-01`, shiftId: shiftId || null, customMask: type === 'CUSTOM' ? mask : null });
  }

  return (
    <div className="rounded-lg border bg-sgo-surface p-3 print:hidden">
      <h3 className="mb-2 text-sm font-bold text-sgo-brand">Cadastrar / editar escala do colaborador</h3>
      <p className="mb-2 text-xs text-ink-500">O padrão gera o <b>Planejado</b>. 12x36 usa dias pares/ímpares do mês; 6x1/5x2/personalizada usam a data de início do ciclo.</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <div className="col-span-2 md:col-span-1">
          <Select
            label="Colaborador" size="sm" placeholder="Selecione…" value={collaboratorId} onValueChange={load}
            options={collaborators.map((c) => ({ value: c.id, label: c.name, hint: existing.has(c.id) ? 'já tem padrão' : undefined }))}
          />
        </div>
        <Select label="Tipo de escala" size="sm" value={type} onValueChange={(v) => setType(v as ScheduleType)} options={TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))} />
        <Select
          label="Turno (opcional)" size="sm" value={shiftId} onValueChange={setShiftId}
          options={[{ value: '', label: 'Sem turno' }, ...turnos.map((t) => ({ value: t.id, label: t.name, hint: t.startTime && t.endTime ? `${t.startTime}-${t.endTime}` : undefined }))]}
        />
        {needsAnchor && <DatePicker label="Início do ciclo" size="sm" value={anchor || null} onValueChange={(v) => setAnchor(v ?? '')} />}
        {type === 'CUSTOM' && <div className="col-span-2"><Label className="text-xs">Padrão (T=trabalha, F=folga)</Label><Input value={mask} onChange={(e) => setMask(e.target.value.toUpperCase())} placeholder="ex: TTTTTFF" className="h-10 text-sm" /></div>}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={busy} onClick={save}>Salvar escala</Button>
        {collaboratorId && existing.has(collaboratorId) && (
          <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => { if (confirm('Remover a escala cadastrada deste colaborador?')) post({ action: 'deletePattern', collaboratorId, unitId }); }}>Remover escala</Button>
        )}
      </div>
    </div>
  );
}
