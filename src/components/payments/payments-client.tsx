'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Banknote, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { formatBRL } from '@/lib/utils';

export interface PayReq {
  id: string;
  type: 'FREELANCER' | 'OVERTIME' | 'MISC';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  amount: number;
  unit: string;
  requestedBy: string | null;
  title: string; // descrição curta (freelancer/colaborador/beneficiário)
  rejectionReason?: string | null;
  divergent?: boolean;
  standardValue?: number | null;
}
interface Unit { id: string; name: string }
interface Freelancer { id: string; name: string; defaultValue: number; unitIds: string[] }
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

  function adminActions(r: PayReq) {
    return (
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
          const v = prompt('Novo valor (R$):', String(r.amount).replace('.', ','));
          if (v === null) return;
          const amount = parseFloat(v.replace(/\./g, '').replace(',', '.'));
          if (!(amount > 0)) { alert('Valor inválido'); return; }
          act(r.id, 'adminEdit', { amount });
        }} aria-label="Editar valor"><Pencil className="h-4 w-4" /> Editar valor</Button>
        <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => { if (confirm(`Excluir este pagamento (${TYPE_LABEL[r.type]} · ${formatBRL(r.amount)})? Registrado na Auditoria.`)) act(r.id, 'adminDelete'); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /> Excluir</Button>
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

      {tab === 'historico' && <List items={history} actions={isAdmin ? adminActions : undefined} />}
    </div>
  );
}

function List({ items, actions }: { items: PayReq[]; actions?: (r: PayReq) => React.ReactNode }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nada por aqui.</p>;
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-brand">{TYPE_LABEL[r.type]} · {r.title}</p>
            <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground">{r.unit} · {formatBRL(r.amount)}{r.requestedBy ? ` · por ${r.requestedBy}` : ''}</p>
          {r.divergent && (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> Divergência: padrão {r.standardValue != null ? formatBRL(r.standardValue) : '—'}
            </p>
          )}
          {r.rejectionReason && <p className="mt-1 text-xs text-critical">Rejeição: {r.rejectionReason}</p>}
          {actions && <div className="mt-2">{actions(r)}</div>}
        </div>
      ))}
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
  const freelaDivergent = type === 'FREELANCER' && selectedFreelancer != null && amt > 0 && Math.abs(amt - selectedFreelancer.defaultValue) > 0.001;

  async function submit() {
    setErr(null);
    const amt = parseFloat((amount || '0').replace(',', '.'));
    if (!unitId || !amt) { setErr('Informe unidade e valor.'); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { type, unitId, amount: amt, description };
      if (type === 'FREELANCER') Object.assign(body, { freelancerId, workDate, shift, workStartTime: workStartTime || undefined, workEndTime: workEndTime || undefined, hours: hours ? Number(hours) : undefined });
      if (type === 'OVERTIME') Object.assign(body, { collaboratorName, workDate, hours: hours ? Number(hours) : undefined, reason });
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
          <div><Label>Dia do trabalho</Label><Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Hora início</Label><Input type="time" value={workStartTime} onChange={(e) => setWorkStartTime(e.target.value)} /></div>
            <div><Label>Hora fim</Label><Input type="time" value={workEndTime} onChange={(e) => setWorkEndTime(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Com o dia e a hora preenchidos, o freelancer fica disponível para alocar no Mapa da unidade naquele dia/horário.</p>
          <div><Label>Horas (p/ pagamento)</Label><Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="opcional" /></div>
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

      <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>

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
