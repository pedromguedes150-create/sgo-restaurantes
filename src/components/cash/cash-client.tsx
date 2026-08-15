'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, Trash2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';



export interface SessionUI {
  id: string; operationalDate: string; seq: number;
  openingAmount: number; expectedOpening: number | null; divergence: number | null;
  closingAmount: number | null; note: string | null;
  openedByName: string; openedAt: string; closedByName: string | null; closedAt: string | null;
}
export interface DashRowUI { unitId: string; unitName: string; sessions: number; divergent: number; divergenceTotal: number }
interface UnitOpt { id: string; name: string }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBR = (iso: string) => iso.split('-').reverse().join('/');
const hasDiv = (s: SessionUI) => s.divergence != null && Math.abs(s.divergence) >= 0.01;

export function CashClient({ units, selectedUnitId, openSession, lastClosing, today, history, month, dash, canOperate, isAdmin }: {
  units: UnitOpt[]; selectedUnitId: string;
  openSession: SessionUI | null; lastClosing: number | null; today: SessionUI[]; history: SessionUI[];
  month: { sessions: number; divergent: number; divergenceTotal: number };
  dash: DashRowUI[] | null; canOperate: boolean; isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [openAmount, setOpenAmount] = useState('');
  const [openNote, setOpenNote] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [closeNote, setCloseNote] = useState('');

  const parse = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/cash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { router.refresh(); return true; }
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? 'Falha');
      return false;
    } finally { setBusy(false); }
  }

  async function doOpen() {
    const v = parse(openAmount);
    if (!Number.isFinite(v) || v < 0) { alert('Informe o valor contado na abertura.'); return; }
    if (lastClosing != null && Math.abs(v - lastClosing) >= 0.01 && !confirm(`Atenção: o fechamento anterior foi ${brl(lastClosing)} e você está abrindo com ${brl(v)} (diferença de ${brl(v - lastClosing)}). A supervisão será alertada. Continuar?`)) return;
    if (await post({ action: 'open', unitId: selectedUnitId, amount: v, note: openNote })) { setOpenAmount(''); setOpenNote(''); }
  }

  async function doClose() {
    const v = parse(closeAmount);
    if (!Number.isFinite(v) || v < 0) { alert('Informe o valor contado no fechamento.'); return; }
    if (openSession && await post({ action: 'close', id: openSession.id, amount: v, note: closeNote })) { setCloseAmount(''); setCloseNote(''); }
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta sessão de caixa? (auditado — a cadeia usa o último fechamento restante)')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'cashSession', action: 'delete', id }) });
      if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  const SessionCard = ({ s }: { s: SessionUI }) => (
    <div className={`rounded-lg border p-2.5 ${hasDiv(s) ? 'border-danger/50 bg-danger/5' : 'bg-sgo-surface'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-sgo-brand">Caixa {s.seq} · {fmtBR(s.operationalDate)}</p>
        {s.closingAmount == null
          ? <StatusBadge tone="medium">Aberto</StatusBadge>
          : hasDiv(s)
            ? <StatusBadge tone="critical">Divergente {brl(s.divergence!)}</StatusBadge>
            : <StatusBadge tone="success">OK</StatusBadge>}
      </div>
      <p className="mt-1 text-xs text-ink-500 tabular-nums">
        Abertura {brl(s.openingAmount)}{s.expectedOpening != null ? ` (esperado ${brl(s.expectedOpening)})` : ' (1º caixa)'}
        {s.closingAmount != null ? ` → Fechamento ${brl(s.closingAmount)}` : ''}
      </p>
      <p className="text-xs text-ink-500">
        {s.openedByName} às {new Date(s.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        {s.closedByName ? ` · fechado por ${s.closedByName} às ${new Date(s.closedAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
        {s.note ? ` · ${s.note}` : ''}
      </p>
      {isAdmin && (
        <div className="mt-1 flex justify-end">
          <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => remove(s.id)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {units.length > 1 && (
          <div className="w-52">
            <Select
              aria-label="Unidade" size="sm" value={selectedUnitId}
              onValueChange={(v) => router.push(`/modulos/troco?unit=${v}`)}
              options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
            />
          </div>
        )}
        <a
          href={`/api/cash/export?unit=${selectedUnitId}&year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border bg-sgo-surface px-3 py-1.5 text-xs font-semibold text-sgo-brand hover:border-sgo-brand"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-sgo-brand" /> Excel do mês
        </a>
      </div>

      {/* Estatística do mês (unidade) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-sgo-surface p-2.5 text-center">
          <p className="text-lg font-bold tabular-nums">{month.sessions}</p>
          <p className="text-xs text-ink-500">caixas no mês</p>
        </div>
        <div className={`rounded-lg border p-2.5 text-center ${month.divergent > 0 ? 'border-danger/50 bg-danger/5' : 'bg-sgo-surface'}`}>
          <p className={`text-lg font-bold tabular-nums ${month.divergent > 0 ? 'text-danger' : ''}`}>{month.divergent}</p>
          <p className="text-xs text-ink-500">divergências</p>
        </div>
        <div className="rounded-lg border bg-sgo-surface p-2.5 text-center">
          <p className="text-lg font-bold tabular-nums">{brl(month.divergenceTotal)}</p>
          <p className="text-xs text-ink-500">soma divergida</p>
        </div>
      </div>

      {/* Caixa aberto → fechar · sem caixa aberto → abrir */}
      {canOperate && (openSession ? (
        <div className="rounded-lg border-2 border-sgo-brand/50 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-sgo-brand"><Unlock className="h-4 w-4 text-sgo-brand" /> Caixa {openSession.seq} aberto — {brl(openSession.openingAmount)} na abertura</p>
          <p className="mb-2 text-xs text-ink-500">Aberto por {openSession.openedByName} às {new Date(openSession.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Conte o troco e feche — o valor vira a abertura esperada do próximo caixa.</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Valor contado (R$)</Label><Input inputMode="decimal" value={closeAmount} onChange={(e) => setCloseAmount(e.target.value)} placeholder="0,00" className="h-10 text-sm" /></div>
            <div><Label className="text-xs">Obs. (opcional)</Label><Input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} className="h-10 text-sm" /></div>
          </div>
          <Button className="mt-2 w-full" disabled={busy || !closeAmount} onClick={doClose}><Lock className="h-4 w-4" /> Fechar caixa</Button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-sgo-brand"><Unlock className="h-4 w-4 text-sgo-brand" /> Abrir caixa</p>
          {lastClosing != null ? (
            <p className="mb-2 text-xs text-ink-500">Abertura esperada (fechamento anterior): <strong className="tabular-nums">{brl(lastClosing)}</strong>. Conte o troco e digite o valor real — diferença gera alerta à supervisão.</p>
          ) : (
            <p className="mb-2 text-xs text-ink-500">Primeiro caixa da unidade — digite o valor contado do troco inicial.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Valor contado (R$)</Label><Input inputMode="decimal" value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="0,00" className="h-10 text-sm" /></div>
            <div><Label className="text-xs">Obs. (opcional)</Label><Input value={openNote} onChange={(e) => setOpenNote(e.target.value)} className="h-10 text-sm" /></div>
          </div>
          <Button className="mt-2 w-full" disabled={busy || !openAmount} onClick={doOpen}><Unlock className="h-4 w-4" /> Abrir caixa</Button>
        </div>
      ))}

      {/* Hoje */}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Hoje ({today.length})</p>
        {today.length === 0 && <p className="text-sm text-ink-500">Nenhum caixa aberto hoje ainda.</p>}
        <div className="space-y-1.5">{today.map((s) => <SessionCard key={s.id} s={s} />)}</div>
      </div>

      {/* Dashboard entre unidades (Supervisão/Admin/CEO) */}
      {dash && dash.length > 1 && (
        <div className="rounded-lg border bg-sgo-surface p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500"><AlertTriangle className="h-3.5 w-3.5" /> Divergências do mês por unidade</p>
          <div className="space-y-1">
            {dash.map((d) => (
              <div key={d.unitId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{d.unitName}</span>
                <span className="shrink-0 text-xs tabular-nums">
                  {d.sessions} caixa(s) · <span className={d.divergent > 0 ? 'font-bold text-danger' : 'font-semibold text-sgo-success'}>{d.divergent} div.</span> · {brl(d.divergenceTotal)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico */}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Histórico ({history.length})</p>
        {history.length === 0 && <p className="text-sm text-ink-500">Sem sessões anteriores.</p>}
        <div className="space-y-1.5">{history.map((s) => <SessionCard key={s.id} s={s} />)}</div>
      </div>
    </div>
  );
}
