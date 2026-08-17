'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Check, X, Trash2, CalendarDays, FileSpreadsheet, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';
import { cn } from '@/lib/utils';

export interface UsageRowUI {
  unitId: string; unitName: string; checklistPct: number; wastePct: number; commandsPct: number;
  occurrences: number; notes: number; cashSessions: number; metaPct: number; usagePct: number;
  tone: 'success' | 'medium' | 'critical';
}
export interface VisitRowUI {
  id: string; unitName: string; supervisorName: string; scheduledDate: string;
  status: 'PLANNED' | 'DONE' | 'CANCELED'; overdue: boolean; feedback: string | null;
  checklistName: string | null; checklistResults: { item: string; ok: boolean; note?: string }[] | null;
  doneAt: string | null;
}
interface UnitOpt { id: string; name: string }
interface ChecklistOpt { id: string; name: string; items: string[] }
export interface PlanRowUI { unitId: string; unitName: string; frequencyDays: number; active: boolean; lastVisitAt: string | null; nextDueAt: string; overdue: boolean }

const fmtBR = (iso: string) => iso.split('-').reverse().join('/');
const fmtMonthLong = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const TONE_DOT = { success: 'bg-success', medium: 'bg-warning', critical: 'bg-danger' } as const;

export function SupervisionClient({ usage, yearMonth, months, board, units, checklists, plans, canOperate, isAdmin }: {
  usage: UsageRowUI[]; yearMonth: string; months: string[];
  board: { upcoming: VisitRowUI[]; history: VisitRowUI[]; month: { done: number; planned: number; overdue: number } };
  units: UnitOpt[]; checklists: ChecklistOpt[]; plans: PlanRowUI[]; canOperate: boolean; isAdmin: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'PAINEL' | 'VISITAS'>('PAINEL');
  const [busy, setBusy] = useState(false);
  const [vUnit, setVUnit] = useState('');
  const [vDate, setVDate] = useState('');

  async function post(body: Record<string, unknown>, api = '/api/supervision'): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { router.refresh(); return true; }
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? 'Falha');
      return false;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['PAINEL', 'Painel de uso'], ['VISITAS', 'Visitas & Feedbacks']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand' : 'rounded-full border px-3 py-1.5 text-sm'}>{label}</button>
        ))}
      </div>

      {tab === 'PAINEL' && (
        <div className="space-y-3">
          <div className="max-w-[224px]">
            <Select
              aria-label="Mês" size="sm" className="capitalize" value={yearMonth}
              onValueChange={(v) => router.push(`/modulos/supervisao?mes=${v}`)}
              options={months.map((m) => ({ value: m, label: fmtMonthLong(m) }))}
            />
          </div>
          <p className="text-xs text-ink-500">Uso correto = média de checklists concluídos, dias com desperdício lançado e dias com comandas conferidas. Piores primeiro.</p>
          {usage.map((u) => (
            <div key={u.unitId} className="rounded-lg border bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold text-ink-900"><span className={cn('h-2.5 w-2.5 rounded-full', TONE_DOT[u.tone])} /> {u.unitName}</p>
                <span className="text-sm font-bold tabular-nums">{u.usagePct}% de uso</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                {([
                  ['Checklists', `${u.checklistPct}%`],
                  ['Desperdício', `${u.wastePct}%`],
                  ['Comandas', `${u.commandsPct}%`],
                  ['Ocorrências', String(u.occurrences)],
                  ['Notas', String(u.notes)],
                  ['Meta', `${u.metaPct}%`],
                ] as const).map(([label, val]) => (
                  <div key={label} className="rounded-md bg-canvas p-1.5">
                    <p className="text-sm font-bold tabular-nums">{val}</p>
                    <p className="text-[10px] text-ink-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {usage.length === 0 && <p className="text-sm text-ink-500">Nenhuma unidade no seu escopo.</p>}
        </div>
      )}

      {tab === 'VISITAS' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <a
              href={`/api/supervision/export?year=${yearMonth.split('-')[0]}&month=${Number(yearMonth.split('-')[1])}`}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-surface px-3 py-1.5 text-xs font-semibold text-brand hover:border-brand"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-brand" /> Excel do mês
            </a>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border bg-surface p-2.5"><p className="text-lg font-bold tabular-nums">{board.month.done}</p><p className="text-xs text-ink-500">feitas no mês</p></div>
            <div className="rounded-lg border bg-surface p-2.5"><p className="text-lg font-bold tabular-nums">{board.month.planned}</p><p className="text-xs text-ink-500">agendadas</p></div>
            <div className={cn('rounded-lg border p-2.5', board.month.overdue > 0 ? 'border-danger/50 bg-danger/5' : 'bg-surface')}><p className={cn('text-lg font-bold tabular-nums', board.month.overdue > 0 && 'text-danger')}>{board.month.overdue}</p><p className="text-xs text-ink-500">atrasadas</p></div>
          </div>

          {canOperate && <PlansEditor plans={plans} busy={busy} post={post} />}

          {canOperate && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500"><CalendarDays className="h-3.5 w-3.5" /> Agendar visita</p>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  aria-label="Unidade da visita" placeholder="Unidade…" value={vUnit} onValueChange={setVUnit}
                  options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
                />
                <DatePicker aria-label="Data da visita" value={vDate || null} onValueChange={(v) => setVDate(v ?? '')} />
              </div>
              <Button className="mt-2 w-full" disabled={busy || !vUnit || !vDate} onClick={async () => { if (await post({ action: 'schedule', unitId: vUnit, scheduledDate: vDate })) { setVUnit(''); setVDate(''); } }}><Plus className="h-4 w-4" /> Agendar</Button>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Próximas ({board.upcoming.length})</p>
            {board.upcoming.length === 0 && <p className="text-sm text-ink-500">Nenhuma visita agendada.</p>}
            <div className="space-y-1.5">
              {board.upcoming.map((v) => <UpcomingVisit key={v.id} v={v} checklists={checklists} canOperate={canOperate} busy={busy} post={post} />)}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Histórico ({board.history.length})</p>
            {board.history.length === 0 && <p className="text-sm text-ink-500">Sem visitas concluídas.</p>}
            <div className="space-y-1.5">
              {board.history.map((v) => <HistoryVisit key={v.id} v={v} isAdmin={isAdmin} busy={busy} onDelete={async (id) => { if (confirm('Excluir esta visita? (auditado)')) await post({ entity: 'supervisorVisit', action: 'delete', id }, '/api/admin/ops'); }} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlansEditor({ plans, busy, post }: { plans: PlanRowUI[]; busy: boolean; post: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(plans.map((p) => [p.unitId, p.active ? String(p.frequencyDays) : ''])));
  const overdueCount = plans.filter((p) => p.overdue).length;

  return (
    <div className={cn('rounded-lg border p-3', overdueCount > 0 ? 'border-danger/50 bg-danger/5' : 'border-dashed')}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500"><Repeat className="h-3.5 w-3.5" /> Recorrência de visitas</p>
        <span className="text-xs font-semibold">{overdueCount > 0 ? <span className="text-danger">{overdueCount} unidade(s) vencida(s)</span> : `${plans.filter((p) => p.active).length} plano(s) ativo(s)`}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 border-t pt-2">
          <p className="text-xs text-ink-500">Visitar a cada N dias (0 = sem recorrência). Concluir uma visita reagenda a próxima; vencida gera aviso diário.</p>
          {plans.map((p) => (
            <div key={p.unitId} className="flex items-center justify-between gap-2 rounded-md bg-canvas p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{p.unitName}{p.overdue && <span className="ml-1.5 text-xs font-bold text-danger">VENCIDA</span>}</p>
                <p className="text-xs text-ink-500">
                  {p.active ? `a cada ${p.frequencyDays}d · próxima ${new Date(p.nextDueAt).toLocaleDateString('pt-BR')}` : 'sem recorrência'}
                  {p.lastVisitAt ? ` · última ${new Date(p.lastVisitAt).toLocaleDateString('pt-BR')}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Input inputMode="numeric" value={values[p.unitId] ?? ''} onChange={(e) => setValues((s) => ({ ...s, [p.unitId]: e.target.value }))} placeholder="dias" className="h-9 w-16 text-sm" />
                <Button size="sm" variant="outline" disabled={busy || values[p.unitId] === undefined || values[p.unitId] === ''} onClick={() => void post({ action: 'setPlan', unitId: p.unitId, frequencyDays: Number(values[p.unitId]) })}>Salvar</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UpcomingVisit({ v, checklists, canOperate, busy, post }: {
  v: VisitRowUI; checklists: ChecklistOpt[]; canOperate: boolean; busy: boolean;
  post: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const [completing, setCompleting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [clId, setClId] = useState('');
  const [results, setResults] = useState<Record<string, { ok: boolean; note: string }>>({});
  const cl = checklists.find((c) => c.id === clId);

  return (
    <div className={cn('rounded-lg border p-2.5', v.overdue ? 'border-danger/50 bg-danger/5' : 'bg-surface')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{v.unitName} · {fmtBR(v.scheduledDate)}</p>
          <p className="text-xs text-ink-500">{v.supervisorName}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {v.overdue && <StatusBadge tone="critical">Atrasada</StatusBadge>}
          {canOperate && !completing && (
            <>
              <Button size="sm" variant="gold" disabled={busy} onClick={() => setCompleting(true)}><Check className="h-4 w-4" /> Concluir</Button>
              <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => { if (confirm('Cancelar esta visita?')) void post({ action: 'cancel', id: v.id }); }} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
            </>
          )}
        </span>
      </div>

      {completing && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div>
            <Label className="text-xs">Feedback da visita (obrigatório)</Label>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="O que foi visto, orientações ao gerente, combinados…" className="w-full rounded-lg border-2 border-line-strong bg-surface p-2 text-sm" />
          </div>
          {checklists.length > 0 && (
            <Select
              label="Checklist da visita (opcional)" size="sm"
              value={clId} onValueChange={(v) => { setClId(v); setResults({}); }}
              options={[{ value: '', label: 'Sem checklist' }, ...checklists.map((c) => ({ value: c.id, label: c.name }))]}
            />
          )}
          {cl && (
            <div className="space-y-1.5">
              {cl.items.map((item) => {
                const r = results[item] ?? { ok: false, note: '' };
                return (
                  <div key={item} className="rounded-md bg-canvas p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{item}</span>
                      <div className="flex gap-1">
                        <button onClick={() => setResults((s) => ({ ...s, [item]: { ...r, ok: true } }))} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', r.ok ? 'bg-success text-on-brand' : 'border')}>OK</button>
                        <button onClick={() => setResults((s) => ({ ...s, [item]: { ...r, ok: false } }))} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', !r.ok && results[item] !== undefined ? 'bg-danger text-on-brand' : 'border')}>Não</button>
                      </div>
                    </div>
                    {results[item] !== undefined && !r.ok && (
                      <Input value={r.note} onChange={(e) => setResults((s) => ({ ...s, [item]: { ...r, note: e.target.value } }))} placeholder="O que está errado?" className="mt-1.5 h-9 text-sm" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setCompleting(false)}>Voltar</Button>
            <Button size="sm" variant="gold" disabled={busy || !feedback.trim()} onClick={() => void post({
              action: 'complete', id: v.id, feedback,
              checklistId: clId || undefined,
              results: cl ? cl.items.map((item) => ({ item, ok: Boolean(results[item]?.ok), note: results[item]?.note })) : undefined,
            })}><Check className="h-4 w-4" /> Registrar visita</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryVisit({ v, isAdmin, busy, onDelete }: { v: VisitRowUI; isAdmin: boolean; busy: boolean; onDelete: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const notOk = v.checklistResults?.filter((r) => !r.ok).length ?? 0;
  return (
    <div className="rounded-lg border bg-surface p-2.5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{v.unitName} · {fmtBR(v.scheduledDate)}</p>
          <p className="truncate text-xs text-ink-500">{v.supervisorName}{v.checklistName ? ` · ${v.checklistName}${notOk > 0 ? ` (${notOk} item(ns) não OK)` : ' (tudo OK)'}` : ''}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusBadge tone={v.status === 'DONE' ? 'success' : 'neutral'}>{v.status === 'DONE' ? 'Concluída' : 'Cancelada'}</StatusBadge>
          {isAdmin && <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={(e) => { e.stopPropagation(); void onDelete(v.id); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
        </span>
      </button>
      {open && v.status === 'DONE' && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {v.feedback && <p className="text-sm">{v.feedback}</p>}
          {v.checklistResults && v.checklistResults.length > 0 && (
            <div className="space-y-1">
              {v.checklistResults.map((r) => (
                <p key={r.item} className="text-xs">
                  {r.ok ? '✅' : '❌'} {r.item}{r.note ? <span className="text-ink-500"> — {r.note}</span> : null}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
