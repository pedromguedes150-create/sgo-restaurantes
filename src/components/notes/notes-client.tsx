'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Save, AlertTriangle, Pencil, X, Trash2, Undo2, FileSpreadsheet, Printer, CalendarClock } from 'lucide-react';
import { InlineDateEdit } from '@/components/shared/inline-date-edit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { FilterBar, FilterField, FilterSelect } from '@/components/ui/filter-bar';
import { QrScanner } from '@/components/notes/qr-scanner';
import { formatBRL } from '@/lib/utils';
import { parseChaveAcesso } from '@/lib/notes/chave';
import { GasClient, type GasDash, type GasRow, type GasContractUI, type PurchasedUI } from '@/components/gas/gas-client';

interface Unit { id: string; name: string }
interface Supplier { id: string; name: string; cnpj: string | null; isGas?: boolean }

export interface NotesGasProps {
  canLaunch: boolean; isAdmin: boolean; canEditDate: boolean; canManageContracts: boolean;
  dashboard: GasDash; receipts: GasRow[]; contracts: GasContractUI[]; purchased: PurchasedUI;
  filter: { unitId: string; supplierId: string; mes: string };
}
export interface NoteDTO {
  id: string; unit: string; supplier: string; value: number;
  status: 'RECEIVED' | 'PAID' | 'PROBLEM' | 'RETURNED'; number: string | null; problemNote: string | null;
  cnpj: string; issueDate: string; dueDate: string; productType: string; observation: string;
  requestedAt?: string; entryDate?: string | null; dateEdited?: boolean; dateEditedByName?: string | null;
  supervisorLaunched?: boolean; createdByName?: string;
}
const ST: Record<NoteDTO['status'], { label: string; tone: StatusTone }> = {
  RECEIVED: { label: 'Recebida', tone: 'medium' },
  PAID: { label: 'Paga', tone: 'success' }, // legado (pagamento é controlado no Teknisa)
  PROBLEM: { label: 'Com problema', tone: 'critical' },
  RETURNED: { label: 'Devolvida', tone: 'neutral' },
};
const fmtBR = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Períodos do filtro (padrão 60 dias — pedido 16/07). */
const PERIODS = [
  { dias: 60, label: 'Últimos 60 dias' },
  { dias: 90, label: 'Últimos 90 dias' },
  { dias: 180, label: 'Últimos 180 dias' },
  { dias: 365, label: 'Último ano' },
];

export function NotesClient({ units, notes, suppliers = [], canManage = false, canEditDate = false, sinceDays = 60, gas }: {
  units: Unit[]; notes: NoteDTO[]; suppliers?: Supplier[]; canManage?: boolean; canEditDate?: boolean; sinceDays?: number; gas?: NotesGasProps;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'nova' | 'lista' | 'analise' | 'gas' | 'venc'>('lista');
  const [busy, setBusy] = useState(false);

  async function status(id: string, st: 'PROBLEM' | 'RETURNED') {
    let problemNote: string | undefined;
    if (st === 'PROBLEM') { const m = prompt('Descreva o problema:'); if (!m) return; problemNote = m; }
    if (st === 'RETURNED') { const m = prompt('Motivo da devolução (ex.: nota errada, valor divergente):'); if (!m) return; problemNote = m; }
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: st, problemNote }) });
      if (res.ok) router.refresh();
    } finally { setBusy(false); }
  }

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'lista', label: 'Notas' },
    { key: 'nova', label: 'Registrar nota' },
    { key: 'venc', label: 'Vencimentos' },
    ...(canManage ? [{ key: 'analise' as const, label: 'Análise' }] : []),
    ...(gas ? [{ key: 'gas' as const, label: 'Análise de gás' }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'nova' && <NewNote units={units} suppliers={suppliers} onDone={() => { setTab('lista'); router.refresh(); }} />}
      {tab === 'venc' && <DueTracking units={units} />}
      {tab === 'gas' && gas && (
        <GasClient
          basePath="/modulos/notas"
          canLaunch={false}
          isAdmin={gas.isAdmin}
          canEditDate={gas.canEditDate}
          canManageContracts={gas.canManageContracts}
          units={units}
          suppliers={suppliers.filter((s) => s.isGas).map((s) => ({ id: s.id, name: s.name, cnpj: s.cnpj ?? null }))}
          dashboard={gas.dashboard}
          receipts={gas.receipts}
          contracts={gas.contracts}
          purchased={gas.purchased}
          filter={gas.filter}
        />
      )}
      {tab === 'lista' && (
        <FilterableNotes
          notes={notes} units={units} sinceDays={sinceDays}
          canManage={canManage} canEditDate={canEditDate} busy={busy} onStatus={status}
          full={false}
        />
      )}
      {tab === 'analise' && (
        <FilterableNotes
          notes={notes} units={units} sinceDays={sinceDays}
          canManage={canManage} canEditDate={canEditDate} busy={busy} onStatus={status}
          full
        />
      )}
    </div>
  );
}

/**
 * Lista de notas por DATA DE LANÇAMENTO (mais nova → mais antiga) com filtros
 * completos (16/07). `full` = modo Análise (totais + campos completos).
 */
function FilterableNotes({ notes, units, sinceDays, canManage, canEditDate, busy, onStatus, full }: {
  notes: NoteDTO[]; units: Unit[]; sinceDays: number;
  canManage: boolean; canEditDate: boolean; busy: boolean;
  onStatus: (id: string, st: 'PROBLEM' | 'RETURNED') => void; full: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('ALL');
  const [unit, setUnit] = useState('ALL');
  const [st, setStatus] = useState<'ALL' | NoteDTO['status']>('ALL');
  const supplierNames = useMemo(() => [...new Set(notes.map((n) => n.supplier))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [notes]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return notes.filter((n) =>
      (supplier === 'ALL' || n.supplier === supplier) &&
      (unit === 'ALL' || n.unit === unit) &&
      (st === 'ALL' || n.status === st) &&
      (!t ||
        n.supplier.toLowerCase().includes(t) || (n.number ?? '').toLowerCase().includes(t) ||
        n.cnpj.toLowerCase().includes(t) || n.productType.toLowerCase().includes(t) ||
        n.observation.toLowerCase().includes(t) || (n.problemNote ?? '').toLowerCase().includes(t) ||
        (n.createdByName ?? '').toLowerCase().includes(t) || String(n.value).includes(t)),
    );
  }, [notes, q, supplier, unit, st]);
  const total = filtered.reduce((s, n) => s + n.value, 0);
  const sel = 'h-9 rounded-lg border-2 border-input bg-background px-2 text-sm';
  const exportHref = `/api/notes/export?dias=${sinceDays}${unit !== 'ALL' ? `&unidade=${encodeURIComponent(unit)}` : ''}${supplier !== 'ALL' ? `&fornecedor=${encodeURIComponent(supplier)}` : ''}${st !== 'ALL' ? `&status=${st}` : ''}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2 print:hidden">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar fornecedor, nº, CNPJ, produto, obs., valor…" className="h-9 w-56 text-sm" />
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={sel}>
          <option value="ALL">Todos os fornecedores</option>
          {supplierNames.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {units.length > 1 && (
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={sel}>
            <option value="ALL">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        )}
        <select value={st} onChange={(e) => setStatus(e.target.value as typeof st)} className={sel}>
          <option value="ALL">Todos os status</option>
          <option value="RECEIVED">Recebida</option>
          <option value="PROBLEM">Com problema</option>
          <option value="RETURNED">Devolvida</option>
          <option value="PAID">Paga (legado)</option>
        </select>
        <select value={sinceDays} onChange={(e) => router.push(`/modulos/notas?dias=${e.target.value}`)} className={sel}>
          {PERIODS.map((p) => <option key={p.dias} value={p.dias}>{p.label}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} de {notes.length}</span>
      </div>

      {full && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="grid flex-1 grid-cols-2 gap-2">
            <div className="rounded-lg border bg-card p-3 text-center"><p className="text-2xl font-black text-brand">{filtered.length}</p><p className="text-xs text-muted-foreground">notas</p></div>
            <div className="rounded-lg border bg-card p-3 text-center"><p className="text-xl font-black text-brand">{formatBRL(total)}</p><p className="text-xs text-muted-foreground">valor total</p></div>
          </div>
          <div className="flex flex-col gap-1.5">
            <a href={exportHref} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold text-brand hover:border-accent"><FileSpreadsheet className="h-3.5 w-3.5 text-accent" /> Excel</a>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold text-brand hover:border-accent"><Printer className="h-3.5 w-3.5 text-accent" /> Imprimir/PDF</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma nota com esses filtros no período.</p>}
        {filtered.map((n) => (
          <NoteCard key={n.id} n={n} canManage={canManage} canEditDate={canEditDate} busy={busy} onStatus={onStatus} full={full} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ n, canManage, canEditDate = false, busy, onStatus, full = false }: {
  n: NoteDTO; canManage: boolean; canEditDate?: boolean; busy: boolean;
  onStatus: (id: string, st: 'PROBLEM' | 'RETURNED') => void; full?: boolean;
}) {
  const router = useRouter();
  const [dateEditing, setDateEditing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [f, setF] = useState({ supplierName: n.supplier, cnpj: n.cnpj, number: n.number ?? '', issueDate: n.issueDate, dueDate: n.dueDate, totalValue: String(n.value).replace('.', ','), productType: n.productType, observation: n.observation });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setErr(null); setSaving(true);
    try {
      const res = await fetch(`/api/notes/${n.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        supplierName: f.supplierName, supplierCnpj: f.cnpj, number: f.number, issueDate: f.issueDate || null, dueDate: f.dueDate || null,
        totalValue: parseFloat((f.totalValue || '0').replace('.', '').replace(',', '.')) || parseFloat(f.totalValue), productType: f.productType, observation: f.observation,
      }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      setEditing(false); router.refresh();
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!window.confirm(`Excluir a nota de ${n.supplier} (${formatBRL(n.value)})? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/notes/${n.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert(data.error ?? 'Falha ao excluir'); return; }
      router.refresh();
    } finally { setDeleting(false); }
  }

  if (editing) {
    return (
      <div className="rounded-lg border-2 border-accent/40 bg-card p-3">
        <div className="grid grid-cols-1 gap-2">
          <div><Label className="text-xs">Fornecedor</Label><Input value={f.supplierName} onChange={(e) => set('supplierName', e.target.value)} className="h-9 text-sm" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">CNPJ</Label><Input value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Número</Label><Input value={f.number} onChange={(e) => set('number', e.target.value)} className="h-9 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Emissão</Label><Input type="date" value={f.issueDate} onChange={(e) => set('issueDate', e.target.value)} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Vencimento</Label><Input type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} className="h-9 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Valor (R$)</Label><Input inputMode="decimal" value={f.totalValue} onChange={(e) => set('totalValue', e.target.value)} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Produto</Label><Input value={f.productType} onChange={(e) => set('productType', e.target.value)} className="h-9 text-sm" /></div>
          </div>
          <div><Label className="text-xs">Observação</Label><Input value={f.observation} onChange={(e) => set('observation', e.target.value)} className="h-9 text-sm" /></div>
          {err && <p className="text-sm font-medium text-critical">{err}</p>}
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" /> Cancelar</Button>
            <Button size="sm" disabled={saving} onClick={save}><Save className="h-4 w-4" /> Salvar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-brand">{n.supplier}</p>
        <StatusBadge tone={ST[n.status].tone}>{ST[n.status].label}</StatusBadge>
      </div>
      <p className="text-xs text-muted-foreground">
        {n.unit} · {formatBRL(n.value)}{n.number ? ` · nº ${n.number}` : ''}{n.dueDate ? ` · vence ${fmtBR(n.dueDate)}` : ''}
        {n.requestedAt ? ` · lançada ${new Date(n.requestedAt).toLocaleDateString('pt-BR')}` : ''}
        {n.createdByName ? ` por ${n.createdByName}` : ''}
      </p>
      {full && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {n.cnpj ? `CNPJ ${n.cnpj} · ` : ''}{n.issueDate ? `emissão ${fmtBR(n.issueDate)} · ` : ''}{n.productType ? `produto: ${n.productType}` : 'sem tipo de produto'}
        </p>
      )}
      {n.supervisorLaunched && (
        <p className="mt-0.5 text-xs font-semibold text-critical">Lançada pela supervisão (gerente não lançou) — desconta na meta</p>
      )}
      {n.dateEdited && (
        <p className="mt-0.5 text-xs font-semibold text-critical">
          Data corrigida{n.entryDate ? ` p/ ${new Date(n.entryDate).toLocaleDateString('pt-BR')}` : ''}{n.dateEditedByName ? ` por ${n.dateEditedByName}` : ''} — desconta na meta
        </p>
      )}
      {n.observation && <p className="mt-1 text-xs text-muted-foreground">Obs.: {n.observation}</p>}
      {n.problemNote && <p className="mt-1 text-xs text-critical">{n.status === 'RETURNED' ? 'Devolução' : 'Problema'}: {n.problemNote}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 print:hidden">
        {canManage && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Ver/Editar</Button>}
        {canEditDate && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDateEditing((v) => !v)}><Pencil className="h-4 w-4" /> Editar data</Button>}
        {n.status === 'RECEIVED' && (
          <>
            {/* Pagamento é controlado no Teknisa — aqui só recebimento/problema/devolução (16/07) */}
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => onStatus(n.id, 'PROBLEM')}><AlertTriangle className="h-4 w-4" /> Problema</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus(n.id, 'RETURNED')}><Undo2 className="h-4 w-4" /> Devolver</Button>
          </>
        )}
        {canManage && <Button size="sm" variant="destructive" disabled={deleting} onClick={remove}><Trash2 className="h-4 w-4" /> Excluir</Button>}
      </div>

      {dateEditing && (
        <InlineDateEdit module="note" id={n.id} current={(n.entryDate ?? n.requestedAt ?? '').slice(0, 10)} onClose={() => setDateEditing(false)} />
      )}
    </div>
  );
}

interface DueRow { id: string; kind: 'NOTE' | 'GAS'; unitId: string; unit: string; supplier: string; value: number; dueDate: string; daysToDue: number; number: string | null }

/** Acompanhamento de vencimentos — foco em boletos a vencer; alerta a supervisão + financeiro. */
function DueTracking({ units }: { units: Unit[] }) {
  const [rows, setRows] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitId, setUnitId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [dias, setDias] = useState('30');
  const [vencidos, setVencidos] = useState('0');

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ dias });
    if (unitId) p.set('unitId', unitId);
    if (supplier) p.set('supplier', supplier);
    if (vencidos === '1') p.set('vencidos', '1');
    try {
      const res = await fetch(`/api/notes/due?${p.toString()}`, { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setRows(d.rows ?? []);
    } finally { setLoading(false); }
  }, [unitId, supplier, dias, vencidos]);
  useEffect(() => { void load(); }, [load]);

  const suppliers = useMemo(() => [...new Set(rows.map((r) => r.supplier))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const activeCount = [unitId, supplier, vencidos === '1' ? '1' : ''].filter(Boolean).length;
  const clear = () => { setUnitId(''); setSupplier(''); setVencidos('0'); setDias('30'); };

  const tone = (d: number): StatusTone => (d < 0 ? 'critical' : d <= 3 ? 'critical' : d <= 7 ? 'medium' : 'success');
  const dueLabel = (d: number) => (d < 0 ? `vencido há ${-d}d` : d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d}d`);

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-accent/10 px-3 py-2 text-xs text-muted-foreground">
        Foco nos boletos <strong>a vencer</strong> — a supervisão e o financeiro são avisados automaticamente dos próximos vencimentos (o pagamento em si é controlado pelo financeiro). Inclui notas comuns e recebimentos de gás.
      </p>
      <FilterBar active={activeCount} onClear={clear}>
        {units.length > 1 && (
          <FilterField label="Unidade"><FilterSelect value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">Todas</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</FilterSelect></FilterField>
        )}
        <FilterField label="Fornecedor"><FilterSelect value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">Todos</option>{suppliers.map((s) => <option key={s} value={s}>{s}</option>)}</FilterSelect></FilterField>
        <FilterField label="Janela"><FilterSelect value={dias} onChange={(e) => setDias(e.target.value)}><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option></FilterSelect></FilterField>
        <FilterField label="Vencidos"><FilterSelect value={vencidos} onChange={(e) => setVencidos(e.target.value)}><option value="0">Só a vencer</option><option value="1">Incluir vencidos</option></FilterSelect></FilterField>
      </FilterBar>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span><strong className="text-brand">{rows.length}</strong> boleto(s)</span>
        <span>total <strong className="text-brand">{formatBRL(total)}</strong></span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum boleto a vencer nesta janela.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={`${r.kind}-${r.id}`} className={`rounded-lg border p-2.5 ${r.daysToDue <= 3 ? 'border-critical/40 bg-critical/5' : 'bg-card'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-brand">{r.supplier}{r.kind === 'GAS' ? <span className="ml-1 rounded bg-accent/15 px-1 text-[10px] font-bold text-accent">GÁS</span> : null}</p>
                <StatusBadge tone={tone(r.daysToDue)}>{dueLabel(r.daysToDue)}</StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">{r.unit} · {formatBRL(r.value)}{r.number ? ` · nº ${r.number}` : ''} · vence {fmtBR(r.dueDate)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewNote({ units, suppliers, onDone }: { units: Unit[]; suppliers: Supplier[]; onDone: () => void }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [accessKey, setAccessKey] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierCnpj, setSupplierCnpj] = useState('');
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [productType, setProductType] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Campos de GÁS (aparecem quando o fornecedor é de gás)
  const [kind, setKind] = useState<'BULK' | 'CYLINDER'>('BULK');
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [cylCount, setCylCount] = useState('');
  const [cylKg, setCylKg] = useState('45');
  const [cylReturned, setCylReturned] = useState('');
  const [cylTotal, setCylTotal] = useState('');

  const selected = suppliers.find((s) => s.id === supplierId);
  const isGas = Boolean(selected?.isGas);

  function onKey(v: string) {
    setAccessKey(v);
    const parsed = parseChaveAcesso(v);
    if (parsed.valid) {
      if (parsed.cnpjFormatted) setSupplierCnpj(parsed.cnpjFormatted);
      if (parsed.number) setNumber(parsed.number);
      if (parsed.issueDate) setIssueDate(parsed.issueDate.toISOString().slice(0, 10));
      setPrefilled(true);
    } else setPrefilled(false);
  }

  // Gás — cálculos de conferência
  const q = parseFloat((qty || '0').replace(',', '.'));
  const price = parseFloat((unitPrice || '0').replace(',', '.'));
  const gasTotal = q > 0 && price > 0 ? q * price : 0;
  const cc = parseInt(cylCount || '0', 10);
  const ck = parseInt(cylKg || '45', 10) || 45;
  const cTotal = parseFloat((cylTotal || '0').replace(',', '.'));
  const cKg = cc > 0 ? cc * ck : 0;
  const cPricePerKg = cKg > 0 && cTotal > 0 ? cTotal / cKg : 0;

  async function submit() {
    setErr(null); setOk(null);
    if (!unitId || !supplierId) { setErr('Preencha unidade e fornecedor (da lista).'); return; }

    if (isGas) {
      // Lançamento de GÁS (cria GasReceipt) — vencimento do boleto incluso
      const body: Record<string, unknown> = { unitId, supplierId, accessKey, noteNumber: number, dueDate };
      if (kind === 'CYLINDER') {
        if (!(cc > 0) || !(cTotal > 0)) { setErr('Informe nº de botijões e valor total.'); return; }
        Object.assign(body, { kind: 'CYLINDER', cylinderCount: cc, cylinderKg: ck, cylindersReturned: cylReturned ? parseInt(cylReturned, 10) : undefined, totalValue: cTotal });
      } else {
        if (!(q > 0) || !(price > 0)) { setErr('Informe quantidade (kg) e valor por kg.'); return; }
        Object.assign(body, { quantityKg: q, pricePerKg: price });
      }
      setBusy(true);
      try {
        const res = await fetch('/api/gas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
        const v = data.variationPct;
        setOk(`Recebimento de gás registrado.${v != null ? ` Variação ${v > 0 ? '+' : ''}${v}% vs anterior.` : ''}${data.alerted ? ' ⚠ Acima do limite — supervisão avisada.' : ''}`);
        setTimeout(onDone, 900);
      } finally { setBusy(false); }
      return;
    }

    // Nota comum
    const v = parseFloat((totalValue || '0').replace('.', '').replace(',', '.')) || parseFloat(totalValue);
    if (!v) { setErr('Preencha o valor da nota.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, source: accessKey ? 'QRCODE' : 'MANUAL', accessKey, supplierId, supplierName, supplierCnpj, number, issueDate, dueDate, totalValue: v, productType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      onDone();
    } finally { setBusy(false); }
  }

  const hl = prefilled ? 'border-medium bg-medium/5' : '';
  return (
    <div className="space-y-3">
      {units.length > 1 && (
        <div><Label>Unidade</Label>
          <select className="h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <Label htmlFor="key"><ScanLine className="mr-1 inline h-4 w-4" /> Chave de acesso (44 dígitos — QR/DANFE)</Label>
        <div className="flex gap-2">
          <Input id="key" inputMode="numeric" value={accessKey} onChange={(e) => onKey(e.target.value)} placeholder="cole, digite ou escaneie" className="flex-1" />
          <QrScanner onResult={(chave) => onKey(chave)} />
        </div>
        {prefilled && <p className="mt-1 text-xs text-[#92600A]">Campos preenchidos pela chave — confira em amarelo.</p>}
      </div>
      <div>
        <Label>Fornecedor (da lista de cadastrados)</Label>
        <select className="h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={supplierId} onChange={(e) => {
          const s = suppliers.find((x) => x.id === e.target.value);
          setSupplierId(e.target.value);
          setSupplierName(s?.name ?? '');
          setSupplierCnpj(s?.cnpj ?? supplierCnpj);
        }}>
          <option value="">Selecione o fornecedor…</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isGas ? ' (gás)' : ''}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">Fornecedor não está na lista? Peça à Supervisão/Admin para cadastrar em Configurações → Fornecedores.</p>
      </div>

      {isGas && (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-xs font-semibold text-accent">Fornecedor de gás — preencha os dados do recebimento de gás. Isso alimenta a Análise de gás (dashboard, contratos e variação).</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div><Label>CNPJ</Label><Input className={hl} value={supplierCnpj} onChange={(e) => setSupplierCnpj(e.target.value)} /></div>
        <div><Label>Número</Label><Input className={hl} value={number} onChange={(e) => setNumber(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>{isGas ? 'Emissão' : 'Emissão'}</Label><Input className={hl} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
        <div><Label>Vencimento do boleto</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>

      {isGas ? (
        <div className="space-y-2 rounded-lg border-2 border-accent/30 bg-accent/5 p-3">
          <div>
            <Label>Forma de recebimento</Label>
            <div className="flex gap-1">
              <button type="button" onClick={() => setKind('BULK')} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${kind === 'BULK' ? 'bg-primary text-primary-foreground' : ''}`}>Granel (kg)</button>
              <button type="button" onClick={() => setKind('CYLINDER')} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${kind === 'CYLINDER' ? 'bg-primary text-primary-foreground' : ''}`}>Botijão (P45)</button>
            </div>
          </div>
          {kind === 'BULK' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Quantidade (kg)</Label><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="ex: 45" /></div>
                <div><Label>Valor por kg (R$)</Label><Input inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0,0000" /></div>
              </div>
              {gasTotal > 0 && <p className="text-center text-sm font-bold text-brand">Valor total: {formatBRL(gasTotal)}</p>}
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Botijões</Label><Input inputMode="numeric" value={cylCount} onChange={(e) => setCylCount(e.target.value.replace(/\D/g, ''))} placeholder="ex: 4" /></div>
                <div><Label>Kg/botijão</Label><Input inputMode="numeric" value={cylKg} onChange={(e) => setCylKg(e.target.value.replace(/\D/g, ''))} placeholder="45" /></div>
                <div><Label>Valor total (R$)</Label><Input inputMode="decimal" value={cylTotal} onChange={(e) => setCylTotal(e.target.value)} placeholder="0,00" /></div>
              </div>
              <div><Label>Botijões vazios devolvidos</Label><Input inputMode="numeric" value={cylReturned} onChange={(e) => setCylReturned(e.target.value.replace(/\D/g, ''))} placeholder="ex: 4" /></div>
              {cKg > 0 && cTotal > 0 && <p className="text-center text-sm font-bold text-brand">{cc} × {ck}kg = {cKg}kg · R$ {cPricePerKg.toFixed(4).replace('.', ',')}/kg</p>}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Valor total (R$)</Label><Input inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} placeholder="0,00" /></div>
          <div><Label>Tipo de produto</Label><Input value={productType} onChange={(e) => setProductType(e.target.value)} /></div>
        </div>
      )}

      {err && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">{err}</p>}
      {ok && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{ok}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Save className="h-5 w-5" /> {isGas ? 'Registrar recebimento de gás' : 'Confirmar e salvar'}</Button>
    </div>
  );
}
