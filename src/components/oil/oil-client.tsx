'use client';

import { useState } from 'react';
import { StatCard } from '@/components/ui/ds/stat-card';
import { useRouter } from 'next/navigation';
import { Save, Droplets, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { InlineDateEdit } from '@/components/shared/inline-date-edit';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
import { formatBRL } from '@/lib/utils';
// Apelido: este arquivo ja tem uma `interface Group` (agrupamento de dados do
// dashboard). Sem o alias, o mesmo nome ficaria em dois papeis no mesmo escopo.
import { Group as ListGroup } from '@/components/ui/ds/group';

interface Unit { id: string; name: string }
interface Supplier { id: string; name: string }
interface Group { key: string; name: string; liters: number; total: number }
interface MonthPoint { month: string; liters: number; total: number }
export interface OilDash { totalLiters: number; totalValue: number; avgPricePerLiter: number; byUnit: Group[]; byMethod: Group[]; monthly: MonthPoint[] }
export interface OilRow { id: string; date: string; unit: string; supplier: string; liters: number; price: number; total: number; method: string; by: string; dateEdited?: boolean; dateEditedByName?: string | null }

const METHODS = ['PIX', 'Dinheiro', 'Crédito em conta', 'Transferência', 'Troca por produto'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mlabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTHS[Number(mm) - 1]}/${y.slice(2)}`; };
const perL = (n: number) => `R$ ${n.toFixed(4).replace('.', ',')}/L`;

export function OilClient({ canLaunch, isAdmin, canEditDate = false, units, suppliers, dashboard, rows }: {
  canLaunch: boolean; isAdmin: boolean; canEditDate?: boolean; units: Unit[]; suppliers: Supplier[]; dashboard: OilDash; rows: OilRow[];
}) {
  const [tab, setTab] = useState<'lancar' | 'painel' | 'historico'>(canLaunch ? 'lancar' : 'painel');
  const tabs: { key: typeof tab; label: string; show: boolean }[] = [
    { key: 'lancar', label: 'Lançar coleta', show: canLaunch },
    { key: 'painel', label: 'Dashboard', show: true },
    { key: 'historico', label: 'Histórico', show: true },
  ];
  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="Seções de Coleta de Óleo"
        value={tab}
        onValueChange={setTab}
        options={tabs.filter((t) => t.show).map((t) => ({ value: t.key, label: t.label }))}
      />
      {tab === 'lancar' && canLaunch && <Launch units={units} suppliers={suppliers} />}
      {tab === 'painel' && <Dashboard d={dashboard} />}
      {tab === 'historico' && <History rows={rows} isAdmin={isAdmin} canEditDate={canEditDate} />}
    </div>
  );
}

function Launch({ units, suppliers }: { units: Unit[]; suppliers: Supplier[] }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [liters, setLiters] = useState('');
  const [price, setPrice] = useState('');
  const [method, setMethod] = useState('');
  const [collector, setCollector] = useState('');
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const l = parseFloat((liters || '0').replace(',', '.'));
  const p = parseFloat((price || '0').replace(',', '.'));
  const total = l > 0 && p > 0 ? l * p : 0;

  async function submit() {
    setErr(null); setOk(null);
    if (!unitId || !(l > 0) || !(p >= 0)) { setErr('Informe unidade, litros e valor por litro.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/oil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, supplierId, liters: l, pricePerLiter: p, paymentMethod: method, collectorName: collector, observation: obs }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      setOk(`Coleta registrada: ${l.toLocaleString('pt-BR')} L · ${formatBRL(data.totalValue)} a receber.`);
      setLiters(''); setPrice(''); setMethod(''); setCollector(''); setObs(''); setSupplierId('');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {units.length > 1 && (
        <Select label="Unidade" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
      )}
      <Select
        label="Empresa coletora (fornecedor)" value={supplierId} onValueChange={setSupplierId}
        options={[{ value: '', label: '— nenhuma —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
      />
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Litros coletados</Label><Input inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="ex: 80" /></div>
        <div><Label>Valor por litro (R$)</Label><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" /></div>
      </div>
      {total > 0 && (
        <div className="rounded-lg border-2 border-brand/40 bg-brand/5 p-3 text-center">
          <p className="text-xs text-ink-500">Valor total a receber</p>
          <p className="sgo-type-24 font-semibold text-ink-900">{formatBRL(total)}</p>
        </div>
      )}
      <Select
        label="Como recebemos" value={method} onValueChange={setMethod}
        options={[{ value: '', label: '— não informado —' }, ...METHODS.map((m) => ({ value: m, label: m }))]}
      />
      <div><Label>Observação (opcional)</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} /></div>
      {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
      {ok && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{ok}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Save className="h-5 w-5" /> Registrar coleta</Button>
    </div>
  );
}

function Dashboard({ d }: { d: OilDash }) {
  if (d.totalLiters === 0) return <p className="text-sm text-ink-500">Ainda não há coletas no período.</p>;
  const maxU = Math.max(...d.byUnit.map((u) => u.total), 1);
  const maxM = Math.max(...d.monthly.map((m) => m.total), 1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cell label="Litros (6m)" value={d.totalLiters.toLocaleString('pt-BR')} />
        <Cell label="Médio/litro" value={perL(d.avgPricePerLiter)} />
        <Cell label="Recebido (6m)" value={formatBRL(d.totalValue)} className="col-span-2 sm:col-span-1" />
      </div>
      <div>
        <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">Por unidade</h2>
        <div className="space-y-2">
          {d.byUnit.map((u) => (
            <div key={u.key} className="rounded-lg border bg-surface p-2.5">
              <div className="flex items-center justify-between text-sm"><span className="font-semibold text-ink-900">{u.name}</span><span className="font-bold">{formatBRL(u.total)}</span></div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${(u.total / maxU) * 100}%` }} /></div>
              <p className="mt-1 text-xs text-ink-500">{u.liters.toLocaleString('pt-BR')} L · {perL(u.liters > 0 ? u.total / u.liters : 0)}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">Como recebemos</h2>
        <div className="space-y-1">
          {d.byMethod.map((m) => (
            <div key={m.key} className="flex items-center justify-between rounded-lg border bg-surface px-3 py-1.5 text-sm">
              <span>{m.name}</span><span className="font-semibold">{formatBRL(m.total)} <span className="text-xs font-normal text-ink-500">· {m.liters.toLocaleString('pt-BR')} L</span></span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">Tendência mensal (R$ recebido)</h2>
        <div className="flex items-end gap-2 rounded-lg border bg-surface p-3" style={{ height: 140 }}>
          {d.monthly.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-semibold text-ink-900">{Math.round(m.total)}</span>
              <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(4, (m.total / maxM) * 90)}px` }} />
              <span className="text-[10px] text-ink-500">{mlabel(m.month)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, className }: { label: string; value: string; className?: string }) {
  return <StatCard label={label} value={value} className={className} />;
}

function History({ rows, isAdmin, canEditDate = false }: { rows: OilRow[]; isAdmin: boolean; canEditDate?: boolean }) {
  const [unit, setUnit] = useState('');
  const [dateEditId, setDateEditId] = useState<string | null>(null);
  const unitNames = [...new Set(rows.map((r) => r.unit))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const shown = unit ? rows.filter((r) => r.unit === unit) : rows;
  if (rows.length === 0) return <p className="text-sm text-ink-500">Nenhuma coleta registrada.</p>;

  return (
    <div className="space-y-2">
      {unitNames.length > 1 && (
        <div className="max-w-sm">
          <Select
            aria-label="Filtrar por unidade" value={unit} onValueChange={setUnit}
            options={[{ value: '', label: 'Todas as unidades' }, ...unitNames.map((u) => ({ value: u, label: shortUnitName(u) }))]}
          />
        </div>
      )}
      <ListGroup>
        {shown.map((r) => (
        <div key={r.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1 font-semibold text-ink-900"><Droplets className="h-4 w-4 text-ink-900" /> {r.liters.toLocaleString('pt-BR')} L · {formatBRL(r.total)}</p>
              <p className="text-xs text-ink-500">{r.date} · {r.unit} · {perL(r.price)}{r.method ? ` · ${r.method}` : ''}{r.supplier !== 'Sem fornecedor' ? ` · ${r.supplier}` : ''}{r.by ? ` · ${r.by}` : ''}</p>
            </div>
          </div>
          {r.dateEdited && <p className="mt-1 text-xs font-semibold text-danger">Data corrigida{r.dateEditedByName ? ` por ${r.dateEditedByName}` : ''} — desconta na meta</p>}
          {(isAdmin || canEditDate) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {canEditDate && <Button size="sm" variant="ghost" onClick={() => setDateEditId((id) => (id === r.id ? null : r.id))}><Pencil className="h-4 w-4" /> Editar data</Button>}
              {isAdmin && <DeleteOpButton entity="oil" id={r.id} label={`a coleta de óleo (${r.date}, ${r.unit})`} />}
            </div>
          )}
          {dateEditId === r.id && <InlineDateEdit module="oil" id={r.id} current={r.date} onClose={() => setDateEditId(null)} />}
        </div>
        ))}
      </ListGroup>
    </div>
  );
}
