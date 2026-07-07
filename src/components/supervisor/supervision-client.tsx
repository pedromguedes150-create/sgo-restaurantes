'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Check, X, Trash2, CalendarDays, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
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

const fmtBR = (iso: string) => iso.split('-').reverse().join('/');
const fmtMonthLong = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const TONE_DOT = { success: 'bg-success', medium: 'bg-medium', critical: 'bg-critical' } as const;

export function SupervisionClient({ usage, yearMonth, months, board, units, checklists, canOperate, isAdmin }: {
  usage: UsageRowUI[]; yearMonth: string; months: string[];
  board: { upcoming: VisitRowUI[]; history: VisitRowUI[]; month: { done: number; planned: number; overdue: number } };
  units: UnitOpt[]; checklists: ChecklistOpt[]; canOperate: boolean; isAdmin: boolean;
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
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{label}</button>
        ))}
      </div>

      {tab === 'PAINEL' && (
        <div className="space-y-3">
          <select value={yearMonth} onChange={(e) => router.push(`/modulos/supervisao?mes=${e.target.value}`)} className="h-9 rounded-md border bg-card px-2 text-sm font-semibold capitalize">
            {months.map((m) => <option key={m} value={m}>{fmtMonthLong(m)}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">Uso correto = média de checklists concluídos, dias com desperdício lançado e dias com comandas conferidas. Piores primeiro.</p>
          {usage.map((u) => (
            <div key={u.unitId} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold text-brand"><span className={cn('h-2.5 w-2.5 rounded-full', TONE_DOT[u.tone])} /> {u.unitName}</p>
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
                  <div key={label} className="rounded-md bg-surface p-1.5">
                    <p className="text-sm font-bold tabular-nums">{val}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {usage.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma unidade no seu escopo.</p>}
        </div>
      )}

      {tab === 'VISITAS' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border bg-card p-2.5"><p className="text-lg font-bold tabular-nums">{board.month.done}</p><p className="text-xs text-muted-foreground">feitas no mês</p></div>
            <div className="rounded-lg border bg-card p-2.5"><p className="text-lg font-bold tabular-nums">{board.month.planned}</p><p className="text-xs text-muted-foreground">agendadas</p></div>
            <div className={cn('rounded-lg border p-2.5', board.month.overdue > 0 ? 'border-critical/50 bg-critical/5' : 'bg-card')}><p className={cn('text-lg font-bold tabular-nums', board.month.overdue > 0 && 'text-critical')}>{board.month.overdue}</p><p className="text-xs text-muted-foreground">atrasadas</p></div>
          </div>

          {canOperate && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Agendar visita</p>
              <div className="grid grid-cols-2 gap-2">
                <select className="h-10 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={vUnit} onChange={(e) => setVUnit(e.target.value)}>
                  <option value="">Unidade…</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <Input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} className="h-10 text-sm" />
              </div>
              <Button className="mt-2 w-full" disabled={busy || !vUnit || !vDate} onClick={async () => { if (await post({ action: 'schedule', unitId: vUnit, scheduledDate: vDate })) { setVUnit(''); setVDate(''); } }}><Plus className="h-4 w-4" /> Agendar</Button>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Próximas ({board.upcoming.length})</p>
            {board.upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma visita agendada.</p>}
            <div className="space-y-1.5">
              {board.upcoming.map((v) => <UpcomingVisit key={v.id} v={v} checklists={checklists} canOperate={canOperate} busy={busy} post={post} />)}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Histórico ({board.history.length})</p>
            {board.history.length === 0 && <p className="text-sm text-muted-foreground">Sem visitas concluídas.</p>}
            <div className="space-y-1.5">
              {board.history.map((v) => <HistoryVisit key={v.id} v={v} isAdmin={isAdmin} busy={busy} onDelete={async (id) => { if (confirm('Excluir esta visita? (auditado)')) await post({ entity: 'supervisorVisit', action: 'delete', id }, '/api/admin/ops'); }} />)}
            </div>
          </div>
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
    <div className={cn('rounded-lg border p-2.5', v.overdue ? 'border-critical/50 bg-critical/5' : 'bg-card')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand">{v.unitName} · {fmtBR(v.scheduledDate)}</p>
          <p className="text-xs text-muted-foreground">{v.supervisorName}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {v.overdue && <StatusBadge tone="critical">Atrasada</StatusBadge>}
          {canOperate && !completing && (
            <>
              <Button size="sm" variant="gold" disabled={busy} onClick={() => setCompleting(true)}><Check className="h-4 w-4" /> Concluir</Button>
              <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => { if (confirm('Cancelar esta visita?')) void post({ action: 'cancel', id: v.id }); }} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
            </>
          )}
        </span>
      </div>

      {completing && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div>
            <Label className="text-xs">Feedback da visita (obrigatório)</Label>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="O que foi visto, orientações ao gerente, combinados…" className="w-full rounded-lg border-2 border-input bg-background p-2 text-sm" />
          </div>
          {checklists.length > 0 && (
            <div>
              <Label className="text-xs">Checklist da visita (opcional)</Label>
              <select className="h-10 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={clId} onChange={(e) => { setClId(e.target.value); setResults({}); }}>
                <option value="">Sem checklist</option>
                {checklists.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {cl && (
            <div className="space-y-1.5">
              {cl.items.map((item) => {
                const r = results[item] ?? { ok: false, note: '' };
                return (
                  <div key={item} className="rounded-md bg-surface p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{item}</span>
                      <div className="flex gap-1">
                        <button onClick={() => setResults((s) => ({ ...s, [item]: { ...r, ok: true } }))} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', r.ok ? 'bg-success text-white' : 'border')}>OK</button>
                        <button onClick={() => setResults((s) => ({ ...s, [item]: { ...r, ok: false } }))} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', !r.ok && results[item] !== undefined ? 'bg-critical text-white' : 'border')}>Não</button>
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
    <div className="rounded-lg border bg-card p-2.5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand">{v.unitName} · {fmtBR(v.scheduledDate)}</p>
          <p className="truncate text-xs text-muted-foreground">{v.supervisorName}{v.checklistName ? ` · ${v.checklistName}${notOk > 0 ? ` (${notOk} item(ns) não OK)` : ' (tudo OK)'}` : ''}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusBadge tone={v.status === 'DONE' ? 'success' : 'neutral'}>{v.status === 'DONE' ? 'Concluída' : 'Cancelada'}</StatusBadge>
          {isAdmin && <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={(e) => { e.stopPropagation(); void onDelete(v.id); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
        </span>
      </button>
      {open && v.status === 'DONE' && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {v.feedback && <p className="text-sm">{v.feedback}</p>}
          {v.checklistResults && v.checklistResults.length > 0 && (
            <div className="space-y-1">
              {v.checklistResults.map((r) => (
                <p key={r.item} className="text-xs">
                  {r.ok ? '✅' : '❌'} {r.item}{r.note ? <span className="text-muted-foreground"> — {r.note}</span> : null}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
