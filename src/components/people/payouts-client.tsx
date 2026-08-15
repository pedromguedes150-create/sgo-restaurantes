'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';

export interface PayoutRowUI {
  id: string; collaboratorName: string; unitName: string; type: 'COMMISSION' | 'MOBILITY';
  amount: number; note: string | null; createdByName: string; createdAt: string;
}
export interface DashUI {
  totalCommission: number; totalMobility: number;
  byUnit: { unitName: string; commission: number; mobility: number }[];
  topCollaborators: { name: string; total: number }[];
  trend: { yearMonth: string; commission: number; mobility: number }[];
}
interface CollabOpt { id: string; name: string; jobTitle: string | null; units: string }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};
const fmtMonthLong = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const TYPE = {
  COMMISSION: { label: 'Comissão', tone: 'success' as const },
  MOBILITY: { label: 'Mobilidade', tone: 'neutral' as const },
};

export function PayoutsClient({ rows, dash, collabs, yearMonth, months, canCreate, isAdmin }: {
  rows: PayoutRowUI[]; dash: DashUI; collabs: CollabOpt[]; yearMonth: string; months: string[];
  canCreate: boolean; isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [collaboratorId, setCollaboratorId] = useState('');
  const [type, setType] = useState<'COMMISSION' | 'MOBILITY'>('COMMISSION');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [collabHistory, setCollabHistory] = useState<{ yearMonth: string; type: 'COMMISSION' | 'MOBILITY'; amount: number }[] | null>(null);

  // histórico do colaborador selecionado (acompanhar variação ao lançar)
  useEffect(() => {
    if (!collaboratorId) { setCollabHistory(null); return; }
    let alive = true;
    fetch(`/api/people/payouts?collaboratorId=${collaboratorId}`)
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d) => { if (alive) setCollabHistory(d.history ?? []); })
      .catch(() => { if (alive) setCollabHistory([]); });
    return () => { alive = false; };
  }, [collaboratorId]);

  const filteredCollabs = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? collabs.filter((c) => c.name.toLowerCase().includes(t)) : collabs;
  }, [collabs, q]);

  const maxTrend = Math.max(1, ...dash.trend.map((t) => t.commission + t.mobility));

  async function create() {
    setBusy(true);
    try {
      const res = await fetch('/api/people/payouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collaboratorId, type, yearMonth, amount: Number(amount.replace(',', '.')), note }),
      });
      if (res.ok) { setCollaboratorId(''); setAmount(''); setNote(''); router.refresh(); }
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  async function remove(id: string, who: string) {
    if (!confirm(`Excluir o lançamento de ${who}? (auditado)`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/ops', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'collaboratorPayout', action: 'delete', id }),
      });
      if (res.ok) router.refresh();
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select
            aria-label="Mês" size="sm" className="capitalize" value={yearMonth}
            onValueChange={(v) => router.push(`/modulos/pessoas/comissoes?mes=${v}`)}
            options={months.map((m) => ({ value: m, label: fmtMonthLong(m) }))}
          />
        </div>
        <a
          href={`/api/people/payouts/export?year=${yearMonth.split('-')[0]}&month=${Number(yearMonth.split('-')[1])}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border bg-sgo-surface px-3 py-1.5 text-xs font-semibold text-sgo-brand hover:border-sgo-brand"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-sgo-brand" /> Excel do mês
        </a>
      </div>

      {/* Dashboard do mês */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border bg-sgo-surface p-3">
          <p className="text-xs text-ink-500">Comissões no mês</p>
          <p className="text-lg font-bold text-sgo-success tabular-nums">{brl(dash.totalCommission)}</p>
        </div>
        <div className="rounded-lg border bg-sgo-surface p-3">
          <p className="text-xs text-ink-500">Mobilidade no mês</p>
          <p className="text-lg font-bold text-sgo-brand tabular-nums">{brl(dash.totalMobility)}</p>
        </div>
      </div>

      {dash.byUnit.length > 0 && (
        <div className="rounded-lg border bg-sgo-surface p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Por unidade</p>
          <div className="space-y-1.5">
            {dash.byUnit.map((u) => (
              <div key={u.unitName} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{u.unitName}</span>
                <span className="shrink-0 text-xs tabular-nums">
                  <span className="font-semibold text-sgo-success">{brl(u.commission)}</span>
                  {' · '}
                  <span className="font-semibold text-sgo-brand">{brl(u.mobility)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tendência 12 meses */}
      <div className="rounded-lg border bg-sgo-surface p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Tendência (12 meses) — comissão + mobilidade</p>
        <div className="flex items-end gap-1" style={{ height: 90 }}>
          {dash.trend.map((t) => {
            const total = t.commission + t.mobility;
            return (
              <div key={t.yearMonth} className="flex flex-1 flex-col items-center gap-1" title={`${fmtMonth(t.yearMonth)}: ${brl(total)}`}>
                <div className="flex w-full flex-col justify-end" style={{ height: 64 }}>
                  <div className="w-full rounded-t bg-sgo-brand/80" style={{ height: `${Math.round((total / maxTrend) * 100)}%`, minHeight: total > 0 ? 3 : 0 }} />
                </div>
                <span className="text-[9px] text-ink-500">{fmtMonth(t.yearMonth)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {dash.topCollaborators.length > 0 && (
        <div className="rounded-lg border bg-sgo-surface p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Maiores do mês</p>
          <div className="space-y-1">
            {dash.topCollaborators.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate">{i + 1}. {c.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">{brl(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lançamento (Supervisão/Admin) */}
      {canCreate && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Lançar no mês selecionado</p>
          <div className="space-y-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colaborador…" className="h-10 text-sm" />
            <Select
              aria-label="Colaborador" placeholder="Selecione o colaborador…" value={collaboratorId} onValueChange={setCollaboratorId}
              options={filteredCollabs.map((c) => ({ value: c.id, label: c.name, hint: [c.jobTitle, c.units].filter(Boolean).join(' · ') || undefined }))}
            />
            {collaboratorId && collabHistory && collabHistory.length > 0 && (
              <div className="rounded-md bg-canvas p-2">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Histórico do colaborador (variação)</p>
                <div className="space-y-0.5">
                  {collabHistory.map((h, i) => {
                    const prev = collabHistory.slice(i + 1).find((x) => x.type === h.type);
                    const diff = prev ? h.amount - prev.amount : null;
                    return (
                      <p key={`${h.yearMonth}-${i}`} className="flex items-center justify-between text-xs tabular-nums">
                        <span className="capitalize">{fmtMonth(h.yearMonth)} · {TYPE[h.type].label}</span>
                        <span>
                          <strong>{brl(h.amount)}</strong>
                          {diff != null && Math.abs(diff) >= 0.01 && (
                            <span className={diff > 0 ? 'ml-1 text-sgo-success' : 'ml-1 text-danger'}>({diff > 0 ? '+' : ''}{brl(diff)})</span>
                          )}
                        </span>
                      </p>
                    );
                  })}
                </div>
              </div>
            )}
            {collaboratorId && collabHistory && collabHistory.length === 0 && (
              <p className="text-xs text-ink-500">Primeiro lançamento deste colaborador.</p>
            )}
            <div className="flex gap-1.5">
              {(['COMMISSION', 'MOBILITY'] as const).map((t) => (
                <button key={t} onClick={() => setType(t)} className={type === t ? 'rounded-full bg-sgo-brand px-3 py-1.5 text-sm font-semibold text-on-brand' : 'rounded-full border px-3 py-1.5 text-sm'}>
                  {TYPE[t].label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Valor (R$)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className="h-10 text-sm" /></div>
              <div><Label className="text-xs">Obs. (opcional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: ref. vendas" className="h-10 text-sm" /></div>
            </div>
            <Button className="w-full" disabled={busy || !collaboratorId || !amount} onClick={create}><Plus className="h-4 w-4" /> Lançar {TYPE[type].label.toLowerCase()}</Button>
          </div>
        </div>
      )}

      {/* Histórico do mês */}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Lançamentos do mês ({rows.length})</p>
        {rows.length === 0 && <p className="text-sm text-ink-500">Nenhum lançamento neste mês.</p>}
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border bg-sgo-surface p-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sgo-brand">{r.collaboratorName}</p>
                <p className="truncate text-xs text-ink-500">
                  {r.unitName} · {r.createdByName} · {new Date(r.createdAt).toLocaleDateString('pt-BR')}{r.note ? ` · ${r.note}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge tone={TYPE[r.type].tone}>{TYPE[r.type].label}</StatusBadge>
                <span className="font-semibold tabular-nums">{brl(r.amount)}</span>
                {isAdmin && <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => remove(r.id, r.collaboratorName)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
