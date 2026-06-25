'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Save, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { QrScanner } from '@/components/notes/qr-scanner';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { postAdmin } from '@/lib/admin-client';
import { parseChaveAcesso } from '@/lib/notes/chave';
import { formatBRL } from '@/lib/utils';

interface Unit { id: string; name: string }
interface Supplier { id: string; name: string; cnpj: string | null }
interface GroupStat { key: string; name: string; count: number; avg: number; last: number; min: number; max: number }
interface MonthPoint { month: string; avg: number; count: number }
export interface GasDash { totalReceipts: number; avgPrice: number; lastPrice: number | null; byUnit: GroupStat[]; bySupplier: GroupStat[]; monthly: MonthPoint[]; alertPct: number }
export interface GasRow { id: string; date: string; unit: string; supplier: string; qty: number; total: number; price: number; variation: number | null; alerted: boolean; by: string }

const kg = (n: number) => `R$ ${n.toFixed(4).replace('.', ',')}/kg`;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function mlabel(m: string) { const [y, mm] = m.split('-'); return `${MONTHS[Number(mm) - 1]}/${y.slice(2)}`; }

export function GasClient({ canLaunch, isAdmin, units, suppliers, dashboard, receipts }: {
  canLaunch: boolean; isAdmin: boolean; units: Unit[]; suppliers: Supplier[]; dashboard: GasDash; receipts: GasRow[];
}) {
  const [tab, setTab] = useState<'painel' | 'lancar' | 'historico'>(canLaunch ? 'lancar' : 'painel');
  const tabs: { key: typeof tab; label: string; show: boolean }[] = [
    { key: 'painel', label: 'Dashboard', show: true },
    { key: 'lancar', label: 'Lançar recebimento', show: canLaunch },
    { key: 'historico', label: 'Histórico', show: true },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>{t.label}</button>
        ))}
      </div>
      {tab === 'lancar' && canLaunch && <Launch units={units} suppliers={suppliers} />}
      {tab === 'painel' && <Dashboard d={dashboard} isAdmin={isAdmin} />}
      {tab === 'historico' && <History rows={receipts} isAdmin={isAdmin} />}
    </div>
  );
}

/* ───────── Lançar ───────── */
function Launch({ units, suppliers, }: { units: Unit[]; suppliers: Supplier[] }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [noteNumber, setNoteNumber] = useState('');
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

  const q = parseFloat((qty || '0').replace(',', '.'));
  const price = parseFloat((unitPrice || '0').replace(',', '.'));
  const total = q > 0 && price > 0 ? q * price : 0;

  function onKey(v: string) {
    setAccessKey(v);
    const p = parseChaveAcesso(v);
    if (p.valid) {
      if (p.number) setNoteNumber(p.number);
      if (p.cnpj) { const m = suppliers.find((s) => (s.cnpj ?? '').replace(/\D/g, '') === p.cnpj); if (m) setSupplierId(m.id); }
    }
  }

  async function submit() {
    setErr(null); setOk(null);
    if (!unitId || !(q > 0) || !(price > 0)) { setErr('Informe unidade, quantidade (kg) e valor por kg.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/gas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, supplierId, quantityKg: q, pricePerKg: price, accessKey, noteNumber, observation: obs }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      const v = data.variationPct;
      setOk(`Registrado: ${kg(data.pricePerKg)}.${v != null ? ` Variação ${v > 0 ? '+' : ''}${v}% vs anterior.` : ''}${data.alerted ? ' ⚠ Acima do limite — supervisão avisada.' : ''}`);
      setAccessKey(''); setNoteNumber(''); setQty(''); setUnitPrice(''); setObs(''); setSupplierId('');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {units.length > 1 && (
        <div><Label>Unidade</Label><select className={sel} value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      )}
      <div>
        <Label htmlFor="k"><ScanLine className="mr-1 inline h-4 w-4" /> Chave da nota (QR/código de barras)</Label>
        <div className="flex gap-2">
          <Input id="k" inputMode="numeric" value={accessKey} onChange={(e) => onKey(e.target.value)} placeholder="cole, digite ou escaneie" className="flex-1" />
          <QrScanner onResult={(chave) => onKey(chave)} />
        </div>
        {noteNumber && <p className="mt-1 text-xs text-muted-foreground">Nota nº {noteNumber}</p>}
      </div>
      <div>
        <Label>Fornecedor</Label>
        <select className={sel} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">— sem fornecedor —</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {suppliers.length === 0 && <p className="mt-1 text-xs text-medium">Nenhum fornecedor cadastrado. Peça ao Admin/Supervisor para cadastrar em Configurações → Fornecedores.</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Quantidade (kg)</Label><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="ex: 45" /></div>
        <div><Label>Valor por kg (R$)</Label><Input inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0,0000" /></div>
      </div>

      {total > 0 && (
        <div className="rounded-lg border-2 border-accent/40 bg-accent/5 p-3 text-center">
          <p className="text-xs text-muted-foreground">Valor total (calculado)</p>
          <p className="text-2xl font-black text-brand">{formatBRL(total)}</p>
          <p className="text-xs text-muted-foreground">{kg(price)}</p>
        </div>
      )}

      <div><Label>Observação (opcional)</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} /></div>

      {err && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">{err}</p>}
      {ok && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{ok}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Save className="h-5 w-5" /> Registrar recebimento</Button>
    </div>
  );
}

/* ───────── Dashboard ───────── */
function Dashboard({ d, isAdmin }: { d: GasDash; isAdmin: boolean }) {
  const router = useRouter();
  const [pct, setPct] = useState(String(d.alertPct));
  const [busy, setBusy] = useState(false);
  async function savePct() { setBusy(true); const r = await postAdmin({ entity: 'gas', action: 'setAlertPct', pct: Number(pct) }); setBusy(false); if (r.ok) router.refresh(); else alert(r.error ?? 'Falha'); }

  if (d.totalReceipts === 0) return <p className="text-sm text-muted-foreground">Ainda não há recebimentos de gás no período. Lance o primeiro para ver os comparativos.</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Recebimentos (6m)" value={String(d.totalReceipts)} />
        <Cell label="Preço médio/kg" value={kg(d.avgPrice)} />
        <Cell label="Último preço/kg" value={d.lastPrice != null ? kg(d.lastPrice) : '—'} />
      </div>

      {isAdmin && (
        <div className="flex items-end gap-2 rounded-lg border border-dashed p-2">
          <div><label className="text-xs text-muted-foreground">Alertar acima de (%)</label><Input inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} className="h-9 w-24 text-sm" /></div>
          <Button size="sm" variant="outline" disabled={busy} onClick={savePct}>Salvar limite</Button>
        </div>
      )}

      <Compare title="Por unidade" rows={d.byUnit} />
      <Compare title="Por fornecedor" rows={d.bySupplier} />

      <div>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">Tendência mensal (preço médio/kg)</h2>
        <MonthlyBars points={d.monthly} />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-card py-3 text-center"><p className="text-base font-black text-brand">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

function Compare({ title, rows }: { title: string; rows: GroupStat[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.avg), 0.0001);
  return (
    <div>
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg border bg-card p-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-brand">{r.name}</span>
              <span className="font-bold">{kg(r.avg)} <span className="text-xs font-normal text-muted-foreground">méd</span></span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.avg / max) * 100}%` }} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{r.count} compra(s) · último {kg(r.last)} · mín {kg(r.min)} · máx {kg(r.max)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyBars({ points }: { points: MonthPoint[] }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">Sem dados.</p>;
  const max = Math.max(...points.map((p) => p.avg), 0.0001);
  return (
    <div className="flex items-end gap-2 rounded-lg border bg-card p-3" style={{ height: 140 }}>
      {points.map((p) => (
        <div key={p.month} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] font-semibold text-brand">{p.avg.toFixed(2).replace('.', ',')}</span>
          <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(4, (p.avg / max) * 90)}px` }} />
          <span className="text-[10px] text-muted-foreground">{mlabel(p.month)}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────── Histórico ───────── */
function History({ rows, isAdmin }: { rows: GasRow[]; isAdmin: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhum recebimento registrado.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const tone: StatusTone = r.variation == null ? 'neutral' : r.variation > 0 ? (r.alerted ? 'critical' : 'medium') : 'success';
        return (
          <div key={r.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-brand">{kg(r.price)} <span className="text-xs font-normal text-muted-foreground">· {r.unit}</span></p>
                <p className="text-xs text-muted-foreground">{r.date} · {r.supplier} · {r.qty.toLocaleString('pt-BR')} kg · {formatBRL(r.total)}{r.by ? ` · ${r.by}` : ''}</p>
              </div>
              {r.variation != null && (
                <StatusBadge tone={tone}>{r.variation > 0 ? <TrendingUp className="mr-0.5 inline h-3 w-3" /> : <TrendingDown className="mr-0.5 inline h-3 w-3" />}{r.variation > 0 ? '+' : ''}{r.variation}%</StatusBadge>
              )}
            </div>
            {r.alerted && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-critical"><AlertTriangle className="h-3.5 w-3.5" /> Alta acima do limite</p>}
            {isAdmin && <div className="mt-2"><DeleteOpButton entity="gas" id={r.id} label={`o recebimento de gás (${r.date}, ${r.unit})`} /></div>}
          </div>
        );
      })}
    </div>
  );
}
