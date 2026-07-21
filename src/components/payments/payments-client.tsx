'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Banknote, Plus, Pencil, Trash2, AlertTriangle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { formatBRL } from '@/lib/utils';

export interface PayDetail {
  workDate: string | null; shift: string | null; workStartTime: string | null; workEndTime: string | null;
  hours: number | null; transportValue: number | null; coverageSector: string | null;
  collaboratorName: string | null; reason: string | null; beneficiary: string | null; description: string | null;
  pixKey: string | null; supplierName: string | null; miscTypeName: string | null;
  approvedBy: string | null; approvedAt: string | null; paidBy: string | null; paidAt: string | null;
  hasAttachment: boolean; attachmentPath: string | null;
}
export interface PayReq {
  id: string;
  type: 'FREELANCER' | 'OVERTIME' | 'MISC';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  amount: number;
  unit: string;
  unitCode?: string;
  requestedBy: string | null;
  title: string; // descrição curta (freelancer/colaborador/beneficiário)
  rejectionReason?: string | null;
  divergent?: boolean;
  standardValue?: number | null;
  /// data da solicitação (ISO) — exibida e base da ordenação do histórico
  requestedAt?: string;
  /// data efetiva (editada por Admin/Supervisor) — presença indica edição
  dateEdited?: boolean;
  dateEditedByName?: string | null;
  entryDate?: string | null;
  /// dia de referência (YYYY-MM-DD) p/ agrupamento por dia
  day?: string;
  detail?: PayDetail;
}
interface Unit { id: string; name: string }
interface Freelancer { id: string; name: string; defaultValue: number; unitIds: string[]; sectorRates?: { sectorName: string; dayValue: number }[] }
interface MiscType { id: string; name: string }
interface Supplier { id: string; name: string }

const TYPE_LABEL = { FREELANCER: 'Freelancer', OVERTIME: 'Hora Extra', MISC: 'Avulso' } as const;
const STATUS: Record<PayReq['status'], { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Pendente', tone: 'medium' },
  APPROVED: { label: 'Aprovada', tone: 'success' },
  REJECTED: { label: 'Rejeitada', tone: 'critical' },
  PAID: { label: 'Paga', tone: 'success' },
};

type Tab = 'nova' | 'minhas' | 'aprovar' | 'pagar' | 'historico';

export function PaymentsClient({
  isFinanceView,
  isAdmin = false,
  canEditDate = false,
  units,
  freelancers,
  miscTypes,
  suppliers = [],
  mine,
  toApprove,
  toPay,
  history,
}: {
  isFinanceView: boolean;
  isAdmin?: boolean;
  canEditDate?: boolean;
  units: Unit[];
  freelancers: Freelancer[];
  miscTypes: MiscType[];
  suppliers?: Supplier[];
  mine: PayReq[];
  toApprove: PayReq[];
  toPay: PayReq[];
  history: PayReq[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(toApprove.length > 0 ? 'aprovar' : 'nova');
  const [busy, setBusy] = useState(false);

  async function act(id: string, action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally {
      setBusy(false);
    }
  }

  async function editDate(r: PayReq) {
    const v = prompt('Data correta do lançamento (AAAA-MM-DD) — a edição desconta % na meta do gerente:', (r.entryDate ?? r.requestedAt ?? '').slice(0, 10));
    if (!v) return;
    setBusy(true);
    try {
      const res = await fetch('/api/entry-date', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module: 'payment', id: r.id, date: v.trim() }) });
      if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  function adminActions(r: PayReq) {
    return (
      <div className="flex flex-wrap gap-2">
        {isAdmin && <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
          const v = prompt('Novo valor (R$):', String(r.amount).replace('.', ','));
          if (v === null) return;
          const amount = parseFloat(v.replace(/\./g, '').replace(',', '.'));
          if (!(amount > 0)) { alert('Valor inválido'); return; }
          act(r.id, 'adminEdit', { amount });
        }} aria-label="Editar valor"><Pencil className="h-4 w-4" /> Editar valor</Button>}
        {canEditDate && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void editDate(r)} aria-label="Editar data"><Pencil className="h-4 w-4" /> Editar data</Button>}
        {isAdmin && <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => { if (confirm(`Excluir este pagamento (${TYPE_LABEL[r.type]} · ${formatBRL(r.amount)})? Registrado na Auditoria.`)) act(r.id, 'adminDelete'); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /> Excluir</Button>}
      </div>
    );
  }

  const tabs: { key: Tab; label: string; badge?: number; show: boolean }[] = [
    { key: 'nova', label: 'Nova', show: true },
    { key: 'minhas', label: 'Minhas', show: true },
    { key: 'aprovar', label: 'Para Aprovar', badge: toApprove.length, show: true },
    { key: 'pagar', label: 'Pagar', badge: toPay.length, show: isFinanceView },
    { key: 'historico', label: 'Histórico', show: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground'
                : 'rounded-full border px-3 py-1.5 text-sm font-medium'
            }
          >
            {t.label}
            {t.badge ? <span className="ml-1 rounded-full bg-critical px-1.5 text-xs text-white">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'nova' && <NewRequest units={units} freelancers={freelancers} miscTypes={miscTypes} suppliers={suppliers} onDone={() => { setTab('minhas'); router.refresh(); }} />}

      {tab === 'minhas' && <List items={mine} />}

      {tab === 'aprovar' && (
        <List
          items={toApprove}
          actions={(r) => (
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => act(r.id, 'approve')}><Check className="h-4 w-4" /> Aprovar</Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => { const m = prompt('Motivo da rejeição:'); if (m) act(r.id, 'reject', { reason: m }); }}><X className="h-4 w-4" /> Rejeitar</Button>
            </div>
          )}
        />
      )}

      {tab === 'pagar' && (
        <List
          items={toPay}
          actions={(r) => (
            <Button size="sm" variant="gold" disabled={busy} onClick={() => act(r.id, 'pay')}><Banknote className="h-4 w-4" /> Marcar paga</Button>
          )}
        />
      )}

      {tab === 'historico' && <HistoryTab items={history} actions={isAdmin || canEditDate ? adminActions : undefined} />}
    </div>
  );
}

function HistoryTab({ items, actions }: { items: PayReq[]; actions?: (r: PayReq) => React.ReactNode }) {
  const [type, setType] = useState<'ALL' | PayReq['type']>('ALL');
  const [unit, setUnit] = useState('ALL');
  const [status, setStatus] = useState<'ALL' | PayReq['status']>('ALL');
  const [q, setQ] = useState('');
  const unitNames = useMemo(() => [...new Set(items.map((i) => i.unit))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [items]);
  const filtered = useMemo(() => items.filter((i) =>
    (type === 'ALL' || i.type === type) &&
    (unit === 'ALL' || i.unit === unit) &&
    (status === 'ALL' || i.status === status) &&
    (!q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase()) || (i.requestedBy ?? '').toLowerCase().includes(q.trim().toLowerCase()))
  ), [items, type, unit, status, q]);
  const sel = 'h-9 rounded-lg border-2 border-input bg-background px-2 text-sm';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2">
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={sel}>
          <option value="ALL">Todos os tipos</option>
          <option value="FREELANCER">Freelancer</option>
          <option value="OVERTIME">Hora Extra</option>
          <option value="MISC">Avulso</option>
        </select>
        {unitNames.length > 1 && (
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={sel}>
            <option value="ALL">Todas as unidades</option>
            {unitNames.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={sel}>
          <option value="ALL">Todos os status</option>
          <option value="PENDING">Pendente</option>
          <option value="APPROVED">Aprovada</option>
          <option value="PAID">Paga</option>
          <option value="REJECTED">Rejeitada</option>
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar prestador/beneficiário…" className="h-9 w-48 text-sm" />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} de {items.length}</span>
      </div>
      <List items={filtered} actions={actions} />
    </div>
  );
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : iso;
}
function fmtDate(iso?: string | null): string { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'; }

/** Detalhes completos da solicitação (para conferência do supervisor) — 16/07. */
function DetailView({ r }: { r: PayReq }) {
  const d = r.detail;
  const rows: [string, string | null][] = [];
  if (r.type === 'FREELANCER') {
    rows.push(['Freelancer', r.title]);
    if (d?.pixKey) rows.push(['Chave PIX', d.pixKey]);
    if (d?.coverageSector) rows.push(['Cobertura de setor', d.coverageSector]);
    if (d?.workDate) rows.push(['Dia do trabalho', fmtDay(d.workDate)]);
    if (d?.workStartTime || d?.workEndTime) rows.push(['Horário', `${d?.workStartTime ?? '?'} – ${d?.workEndTime ?? '?'}`]);
    if (d?.hours != null) rows.push(['Horas', String(d.hours)]);
  } else if (r.type === 'OVERTIME') {
    rows.push(['Colaborador', d?.collaboratorName ?? r.title]);
    if (d?.workDate) rows.push(['Data', fmtDay(d.workDate)]);
    if (d?.hours != null) rows.push(['Horas', String(d.hours)]);
    if (d?.reason) rows.push(['Motivo', d.reason]);
  } else {
    if (d?.miscTypeName) rows.push(['Tipo', d.miscTypeName]);
    if (d?.beneficiary) rows.push(['Beneficiário', d.beneficiary]);
    if (d?.supplierName) rows.push(['Fornecedor', d.supplierName]);
  }
  if (d?.transportValue) rows.push(['Vale transporte', formatBRL(d.transportValue)]);
  if (d?.description) rows.push(['Observações', d.description]);
  rows.push(['Valor', formatBRL(r.amount)]);
  if (r.divergent) rows.push(['Valor padrão', r.standardValue != null ? formatBRL(r.standardValue) : '—']);
  rows.push(['Unidade', r.unit]);
  rows.push(['Solicitado por', `${r.requestedBy ?? '—'}${r.requestedAt ? ` em ${new Date(r.requestedAt).toLocaleString('pt-BR')}` : ''}`]);
  if (d?.approvedBy) rows.push(['Aprovado por', `${d.approvedBy}${d.approvedAt ? ` em ${fmtDate(d.approvedAt)}` : ''}`]);
  if (d?.paidBy) rows.push(['Pago por', `${d.paidBy}${d.paidAt ? ` em ${fmtDate(d.paidAt)}` : ''}`]);
  if (r.rejectionReason) rows.push(['Rejeição', r.rejectionReason]);
  return (
    <div className="mt-2 space-y-1 rounded-md bg-surface p-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 text-xs">
          <span className="shrink-0 text-muted-foreground">{k}</span>
          <span className="text-right font-medium text-foreground">{v}</span>
        </div>
      ))}
      {d?.hasAttachment && d.attachmentPath && (
        <a href={`/${d.attachmentPath}`} target="_blank" rel="noreferrer" className="block pt-1 text-xs font-semibold text-accent underline">Ver anexo</a>
      )}
    </div>
  );
}

function Row({ r, open, onToggle, actions }: { r: PayReq; open: boolean; onToggle: () => void; actions?: (r: PayReq) => React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <button onClick={onToggle} className="flex w-full items-start justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="block font-semibold text-brand">{TYPE_LABEL[r.type]} · {r.title}</span>
          <span className="block text-xs text-muted-foreground">
            {formatBRL(r.amount)}{r.requestedBy ? ` · por ${r.requestedBy}` : ''}
            {r.requestedAt ? ` · solicitado ${new Date(r.requestedAt).toLocaleDateString('pt-BR')}` : ''}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {r.dateEdited && (
        <p className="mt-0.5 text-xs font-semibold text-critical">
          Data corrigida{r.entryDate ? ` p/ ${new Date(r.entryDate).toLocaleDateString('pt-BR')}` : ''}{r.dateEditedByName ? ` por ${r.dateEditedByName}` : ''} — desconta na meta
        </p>
      )}
      {r.divergent && (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-medium">
          <AlertTriangle className="h-3.5 w-3.5" /> Divergência: padrão {r.standardValue != null ? formatBRL(r.standardValue) : '—'}
        </p>
      )}
      {open && <DetailView r={r} />}
      {actions && <div className="mt-2">{actions(r)}</div>}
    </div>
  );
}

function List({ items, actions }: { items: PayReq[]; actions?: (r: PayReq) => React.ReactNode }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nada por aqui.</p>;

  // Agrupa por DIA (mais recente primeiro) e, dentro do dia, por UNIDADE (pedido 16/07)
  const byDay = new Map<string, PayReq[]>();
  for (const r of items) { const k = r.day ?? (r.requestedAt?.slice(0, 10) ?? '—'); const arr = byDay.get(k) ?? []; arr.push(r); byDay.set(k, arr); }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const dayItems = byDay.get(day)!;
        const byUnit = new Map<string, PayReq[]>();
        for (const r of dayItems) { const arr = byUnit.get(r.unit) ?? []; arr.push(r); byUnit.set(r.unit, arr); }
        const unitNames = [...byUnit.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const dayTotal = dayItems.reduce((s, r) => s + r.amount, 0);
        return (
          <div key={day} className="space-y-2">
            <div className="flex items-center justify-between border-b pb-1">
              <p className="text-sm font-bold text-brand">📅 {fmtDay(day)}</p>
              <span className="text-xs text-muted-foreground">{dayItems.length} lançamento(s) · {formatBRL(dayTotal)}</span>
            </div>
            {unitNames.map((u) => (
              <div key={u} className="space-y-1.5">
                {unitNames.length > 1 && <p className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{u} <span className="font-normal">({byUnit.get(u)!.length})</span></p>}
                {byUnit.get(u)!.map((r) => <Row key={r.id} r={r} open={open.has(r.id)} onToggle={() => toggle(r.id)} actions={actions} />)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function NewRequest({ units, freelancers, miscTypes, suppliers, onDone }: { units: Unit[]; freelancers: Freelancer[]; miscTypes: MiscType[]; suppliers: Supplier[]; onDone: () => void }) {
  const [supplierId, setSupplierId] = useState('');
  const [type, setType] = useState<'FREELANCER' | 'OVERTIME' | 'MISC'>('FREELANCER');
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [freelancerId, setFreelancerId] = useState('');
  const [miscTypeId, setMiscTypeId] = useState('');
  const [amount, setAmount] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [shift, setShift] = useState('');
  const [workStartTime, setWorkStartTime] = useState('');
  const [workEndTime, setWorkEndTime] = useState('');
  const [transportValue, setTransportValue] = useState('');
  const [coverage, setCoverage] = useState(false); // cobertura temporária de setor (16/07)
  const [coverageSector, setCoverageSector] = useState('');
  const [calc, setCalc] = useState<{ configured: boolean; hours: number; rate: number | null; amount: number; transport: number; dayTypeLabel: string } | null>(null);
  const [hours, setHours] = useState('');
  const [collaboratorName, setCollaboratorName] = useState('');
  const [reason, setReason] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unitFreelancers = useMemo(() => freelancers.filter((f) => f.unitIds.includes(unitId)), [freelancers, unitId]);
  const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

  const selectedFreelancer = useMemo(() => freelancers.find((f) => f.id === freelancerId), [freelancers, freelancerId]);
  const amt = parseFloat((amount || '0').replace(',', '.'));
  const autoPriced = type === 'FREELANCER' && Boolean(calc?.configured);
  const freelaDivergent = type === 'FREELANCER' && !autoPriced && selectedFreelancer != null && amt > 0 && Math.abs(amt - selectedFreelancer.defaultValue) > 0.001;

  // Prévia do valor do freelancer (horas × valor/hora do dia + vale transporte)
  useEffect(() => {
    if (type !== 'FREELANCER' || coverage || !unitId || !workDate || !workStartTime || !workEndTime) { setCalc(null); return; }
    const t = parseFloat((transportValue || '0').replace(',', '.')) || 0;
    let cancelled = false;
    fetch('/api/payments/freelancer-calc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, workDate, start: workStartTime, end: workEndTime, transport: t }) })
      .then((r) => r.json()).then((d) => { if (!cancelled) setCalc(d); }).catch(() => { if (!cancelled) setCalc(null); });
    return () => { cancelled = true; };
  }, [type, unitId, workDate, workStartTime, workEndTime, transportValue, coverage]);

  async function submit() {
    setErr(null);
    const manualAmt = parseFloat((amount || '0').replace(',', '.'));
    const covRate = coverage ? (selectedFreelancer?.sectorRates ?? []).find((r) => r.sectorName === coverageSector)?.dayValue ?? 0 : 0;
    const effAmt = coverage ? covRate : autoPriced ? (calc?.amount ?? 0) : manualAmt;
    if (coverage && !coverageSector) { setErr('Escolha o setor da cobertura.'); return; }
    if (!unitId || (!coverage && !autoPriced && !effAmt)) { setErr('Informe unidade e valor.'); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { type, unitId, amount: effAmt, description };
      if (type === 'FREELANCER') Object.assign(body, { freelancerId, workDate, shift, workStartTime: workStartTime || undefined, workEndTime: workEndTime || undefined, transportValue: transportValue ? parseFloat(transportValue.replace(',', '.')) : undefined, hours: hours ? Number(hours) : undefined, coverageSector: coverage && coverageSector ? coverageSector : undefined });
      if (type === 'OVERTIME') Object.assign(body, { collaboratorName, workDate, hours: hours ? Number(hours) : undefined, reason, transportValue: transportValue ? parseFloat(transportValue.replace(',', '.')) : undefined });
      if (type === 'MISC') Object.assign(body, { miscTypeId, beneficiary, supplierId: supplierId || undefined });
      const res = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Tipo</Label>
        <select className={sel} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="FREELANCER">Freelancer</option>
          <option value="OVERTIME">Hora Extra</option>
          <option value="MISC">Pagamento Avulso</option>
        </select>
      </div>
      {units.length > 1 && (
        <div>
          <Label>Unidade</Label>
          <select className={sel} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      {type === 'FREELANCER' && (
        <>
          <div>
            <Label>Freelancer</Label>
            <select className={sel} value={freelancerId} onChange={(e) => { setFreelancerId(e.target.value); const f = unitFreelancers.find((x) => x.id === e.target.value); if (f) setAmount(String(f.defaultValue)); }}>
              <option value="">Selecione…</option>
              {unitFreelancers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {(selectedFreelancer?.sectorRates?.length ?? 0) > 0 && (
            <label className="flex items-center gap-2 rounded-lg border border-dashed p-2 text-sm">
              <input type="checkbox" checked={coverage} onChange={(e) => { setCoverage(e.target.checked); setCoverageSector(''); }} />
              <span><b>Cobertura temporária de setor</b> — valor fechado por dia (varia por setor)</span>
            </label>
          )}
          {coverage && (
            <div>
              <Label>Setor coberto</Label>
              <select className={sel} value={coverageSector} onChange={(e) => setCoverageSector(e.target.value)}>
                <option value="">Selecione o setor…</option>
                {(selectedFreelancer?.sectorRates ?? []).map((r) => <option key={r.sectorName} value={r.sectorName}>{r.sectorName} — {formatBRL(r.dayValue)}/dia</option>)}
              </select>
              {coverageSector && (
                <p className="mt-1 text-xs text-muted-foreground">Valor do dia: <b>{formatBRL((selectedFreelancer?.sectorRates ?? []).find((r) => r.sectorName === coverageSector)?.dayValue ?? 0)}</b>{transportValue ? ' + VT' : ''} (calculado automaticamente).</p>
              )}
            </div>
          )}
          <div><Label>Dia do trabalho</Label><Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Hora início</Label><Input type="time" value={workStartTime} onChange={(e) => setWorkStartTime(e.target.value)} /></div>
            <div><Label>Hora fim</Label><Input type="time" value={workEndTime} onChange={(e) => setWorkEndTime(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Com o dia e a hora preenchidos, o freelancer fica disponível para alocar no Mapa da unidade naquele dia/horário.</p>
          <div><Label>Vale transporte (R$, opcional)</Label><Input inputMode="decimal" value={transportValue} onChange={(e) => setTransportValue(e.target.value)} placeholder="0,00" /></div>
          {calc?.configured && (
            <div className="rounded-lg border-2 border-accent/40 bg-accent/5 p-3">
              <p className="text-xs text-muted-foreground">Valor calculado ({calc.dayTypeLabel})</p>
              <p className="text-2xl font-black text-brand">{formatBRL(calc.amount)}</p>
              <p className="text-xs text-muted-foreground">{calc.hours}h × {formatBRL(calc.rate ?? 0)}/h{calc.transport > 0 ? ` + ${formatBRL(calc.transport)} VT` : ''}</p>
            </div>
          )}
          {calc && !calc.configured && workDate && workStartTime && workEndTime && (
            <p className="rounded-lg bg-medium/10 px-3 py-2 text-xs text-[#92600A]">Sem valor/hora cadastrado para este dia nesta unidade. Informe o valor manualmente abaixo (o Admin pode cadastrar em Configurações → Valor do freelancer).</p>
          )}
          <div><Label>Observações (opcional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex: cobriu falta, evento…" /></div>
        </>
      )}

      {type === 'OVERTIME' && (
        <>
          <div><Label>Colaborador</Label><Input value={collaboratorName} onChange={(e) => setCollaboratorName(e.target.value)} placeholder="nome (via RH)" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Data</Label><Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
            <div><Label>Horas</Label><Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
          </div>
          <div><Label>Motivo</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div><Label>Vale transporte (R$, opcional — soma ao total)</Label><Input inputMode="decimal" value={transportValue} onChange={(e) => setTransportValue(e.target.value)} placeholder="0,00" /></div>
          <p className="text-xs text-muted-foreground">Valor é estimativa para aprovação; o cálculo final (50%/100%, reflexos) é do RH/folha.</p>
        </>
      )}

      {type === 'MISC' && (
        <>
          <div>
            <Label>Tipo de pagamento</Label>
            <select className={sel} value={miscTypeId} onChange={(e) => setMiscTypeId(e.target.value)}>
              <option value="">Selecione…</option>
              {miscTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {suppliers.length > 0 && (
            <div>
              <Label>Fornecedor (opcional)</Label>
              <select className={sel} value={supplierId} onChange={(e) => { const s = suppliers.find((x) => x.id === e.target.value); setSupplierId(e.target.value); if (s) setBeneficiary(s.name); }}>
                <option value="">— nenhum / digitar abaixo —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div><Label>Beneficiário</Label><Input value={beneficiary} onChange={(e) => { setBeneficiary(e.target.value); setSupplierId(''); }} /></div>
          <div><Label>Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </>
      )}

      {!autoPriced && <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>}

      {freelaDivergent && selectedFreelancer && (
        <p className="flex items-center gap-2 rounded-lg bg-medium/10 px-3 py-2 text-sm font-medium text-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Valor diferente do padrão cadastrado ({formatBRL(selectedFreelancer.defaultValue)}). Você pode prosseguir — o aprovador será avisado da divergência.
        </p>
      )}

      {err && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">{err}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Plus className="h-5 w-5" /> Enviar solicitação</Button>
    </div>
  );
}
