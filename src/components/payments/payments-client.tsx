'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Banknote, Plus, Pencil, Trash2, AlertTriangle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { formatBRL, cn } from '@/lib/utils';
import { InlineDateEdit } from '@/components/shared/inline-date-edit';
import { Button as DsButton } from '@/components/ui/ds/button';
import { Banner } from '@/components/ui/ds/banner';
import { List as DsList, ListRow } from '@/components/ui/ds/list-row';
import { StatusBadge as DsStatusBadge, type Tone as DsTone } from '@/components/ui/ds/status-badge';
import { Sheet } from '@/components/ui/ds/sheet';
import { Select as DsSelect } from '@/components/ui/ds/select';
import { SearchField } from '@/components/ui/ds/field';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';

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

/** Semáforo legado das solicitações → tons do design system. */
const DS_STATUS: Record<PayReq['status'], DsTone> = {
  PENDING: 'warning', APPROVED: 'info', REJECTED: 'danger', PAID: 'success',
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
  const [dateEditId, setDateEditId] = useState<string | null>(null);
  // Seleção para aprovação em lote (aba "Para Aprovar").
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [batchMsg, setBatchMsg] = useState<{ tone: 'success' | 'warning' | 'danger'; title: string; description?: string } | null>(null);
  const selTotal = useMemo(() => toApprove.filter((r) => sel.has(r.id)).reduce((s, r) => s + r.amount, 0), [toApprove, sel]);

  async function approveSelected() {
    if (sel.size === 0) return;
    const ids = [...sel];
    if (!confirm(`Aprovar ${ids.length} pagamento(s), somando ${formatBRL(selTotal)}?`)) return;
    setBusy(true);
    setBatchMsg(null);
    try {
      const res = await fetch('/api/payments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approveMany', ids }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setBatchMsg({ tone: 'danger', title: d.error ?? 'Falha ao aprovar em lote' }); return; }
      setSel(new Set());
      setBatchMsg(
        d.failed?.length
          ? { tone: 'warning', title: `${d.approved} aprovada(s), ${d.failed.length} não passaram`, description: 'As que falharam podem já ter sido aprovadas por outra pessoa ou estar fora do seu perfil de aprovação.' }
          : { tone: 'success', title: `${d.approved} pagamento(s) aprovado(s)`, description: 'O Financeiro foi avisado uma única vez, com o total consolidado.' },
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

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
      <>
        <div className="flex flex-wrap gap-2">
          {isAdmin && <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
            const v = prompt('Novo valor (R$):', String(r.amount).replace('.', ','));
            if (v === null) return;
            const amount = parseFloat(v.replace(/\./g, '').replace(',', '.'));
            if (!(amount > 0)) { alert('Valor inválido'); return; }
            act(r.id, 'adminEdit', { amount });
          }} aria-label="Editar valor"><Pencil className="h-4 w-4" /> Editar valor</Button>}
          {canEditDate && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDateEditId((id) => (id === r.id ? null : r.id))} aria-label="Editar data"><Pencil className="h-4 w-4" /> Editar data</Button>}
          {isAdmin && <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => { if (confirm(`Excluir este pagamento (${TYPE_LABEL[r.type]} · ${formatBRL(r.amount)})? Registrado na Auditoria.`)) act(r.id, 'adminDelete'); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /> Excluir</Button>}
        </div>
        {dateEditId === r.id && <InlineDateEdit module="payment" id={r.id} current={(r.entryDate ?? r.requestedAt ?? '').slice(0, 10)} onClose={() => setDateEditId(null)} />}
      </>
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
        <>
          {toApprove.length > 1 && (
            // Barra de lote: gruda no topo para o gestor não precisar rolar de
            // volta depois de marcar dezenas de itens.
            <div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-card border border-line bg-glass px-3 py-2 backdrop-blur-xl">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-700">
                <input
                  type="checkbox"
                  checked={sel.size === toApprove.length && toApprove.length > 0}
                  ref={(el) => { if (el) el.indeterminate = sel.size > 0 && sel.size < toApprove.length; }}
                  onChange={() => setSel((s) => (s.size === toApprove.length ? new Set() : new Set(toApprove.map((r) => r.id))))}
                  style={{ accentColor: 'var(--sgo-brand)' }}
                  className="h-4 w-4 rounded outline-none focus-visible:shadow-sgo-focus"
                />
                Selecionar todas ({toApprove.length})
              </label>
              <span className="text-[13px] tabular-nums text-ink-500">
                {sel.size} selecionada(s) · {formatBRL(selTotal)}
              </span>
              <span className="ml-auto flex gap-2">
                {sel.size > 0 && <DsButton size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpar</DsButton>}
                <DsButton size="sm" disabled={sel.size === 0} loading={busy} onClick={approveSelected}>
                  <Check className="h-4 w-4" /> Aprovar selecionadas
                </DsButton>
              </span>
            </div>
          )}
          {batchMsg && (
            <Banner tone={batchMsg.tone} title={batchMsg.title} description={batchMsg.description} onDismiss={() => setBatchMsg(null)} />
          )}
          <List
            items={toApprove}
            selection={toApprove.length > 1 ? { ids: sel, onToggle: (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }) } : undefined}
            actions={(r) => (
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => act(r.id, 'approve')}><Check className="h-4 w-4" /> Aprovar</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => { const m = prompt('Motivo da rejeição:'); if (m) act(r.id, 'reject', { reason: m }); }}><X className="h-4 w-4" /> Rejeitar</Button>
              </div>
            )}
          />
        </>
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
      <div className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-sgo-surface p-3">
        <div className="min-w-[9rem] flex-1">
          <DsSelect
            label="Tipo"
            size="sm"
            value={type}
            onValueChange={(v) => setType(v as typeof type)}
            options={[
              { value: 'ALL', label: 'Todos os tipos' },
              { value: 'FREELANCER', label: 'Freelancer' },
              { value: 'OVERTIME', label: 'Hora Extra' },
              { value: 'MISC', label: 'Avulso' },
            ]}
          />
        </div>
        {unitNames.length > 1 && (
          <div className="min-w-[9rem] flex-1">
            <DsSelect
              label="Unidade"
              size="sm"
              value={unit}
              onValueChange={setUnit}
              options={[{ value: 'ALL', label: 'Todas as unidades' }, ...unitNames.map((u) => ({ value: u, label: shortUnitName(u) }))]}
            />
          </div>
        )}
        <div className="min-w-[9rem] flex-1">
          <DsSelect
            label="Status"
            size="sm"
            value={status}
            onValueChange={(v) => setStatus(v as typeof status)}
            options={[
              { value: 'ALL', label: 'Todos os status' },
              { value: 'PENDING', label: 'Pendente' },
              { value: 'APPROVED', label: 'Aprovada' },
              { value: 'PAID', label: 'Paga' },
              { value: 'REJECTED', label: 'Rejeitada' },
            ]}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <SearchField label="Busca" value={q} onValueChange={setQ} placeholder="prestador ou beneficiário…" inputSize="sm" />
        </div>
        <span className="ml-auto pb-2 text-[13px] tabular-nums text-ink-500">{filtered.length} de {items.length}</span>
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

/**
 * Uma solicitação = uma LINHA; o detalhe abre num Sheet (Onda 4). Antes o
 * detalhe expandia dentro do cartão e empurrava a lista inteira para baixo —
 * conferir um item fazia o gestor perder a posição de leitura dos outros.
 */
function Row({ r, onOpen, selected, onSelect }: { r: PayReq; onOpen: () => void; selected?: boolean; onSelect?: () => void }) {
  const marks = [
    r.divergent ? `Divergência: padrão ${r.standardValue != null ? formatBRL(r.standardValue) : '—'}` : null,
    r.dateEdited ? 'Data corrigida — desconta na meta' : null,
  ].filter(Boolean).join(' · ');

  return (
    <ListRow
      onClick={onOpen}
      title={`${TYPE_LABEL[r.type]} · ${r.title}`}
      subtitle={[
        formatBRL(r.amount),
        r.requestedBy ? `por ${r.requestedBy}` : null,
        r.requestedAt ? `solicitado ${new Date(r.requestedAt).toLocaleDateString('pt-BR')}` : null,
        marks || null,
      ].filter(Boolean).join(' · ')}
      trailing={
        <>
          {r.divergent && <DsStatusBadge tone="warning" dot>Divergência</DsStatusBadge>}
          <DsStatusBadge tone={DS_STATUS[r.status]} dot>{STATUS[r.status].label}</DsStatusBadge>
        </>
      }
      selectionSlot={onSelect ? (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onSelect}
          aria-label={`Selecionar ${TYPE_LABEL[r.type]} de ${r.title} para aprovação em lote`}
          style={{ accentColor: 'var(--sgo-brand)' }}
          className="h-4 w-4 rounded outline-none focus-visible:shadow-sgo-focus"
        />
      ) : undefined}
    />
  );
}

function List({ items, actions, selection }: {
  items: PayReq[];
  actions?: (r: PayReq) => React.ReactNode;
  /** Quando presente, cada linha ganha caixa de seleção (aprovação em lote). */
  selection?: { ids: Set<string>; onToggle: (id: string) => void };
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = items.find((i) => i.id === detailId) ?? null;
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
                {unitNames.length > 1 && <p className="sgo-type-11 pt-0.5 text-ink-400">{shortUnitName(u)} <span className="font-normal">({byUnit.get(u)!.length})</span></p>}
                <DsList>
                  {byUnit.get(u)!.map((r) => (
                    <Row
                      key={r.id}
                      r={r}
                      onOpen={() => setDetailId(r.id)}
                      selected={selection?.ids.has(r.id)}
                      onSelect={selection ? () => selection.onToggle(r.id) : undefined}
                    />
                  ))}
                </DsList>
              </div>
            ))}
          </div>
        );
      })}

      {/* Detalhe fora do fluxo: a lista não se mexe quando se abre um item. */}
      <Sheet
        open={!!detail}
        onClose={() => setDetailId(null)}
        title={detail ? `${TYPE_LABEL[detail.type]} · ${detail.title}` : ''}
        description={detail ? `${formatBRL(detail.amount)} · ${shortUnitName(detail.unit)}` : undefined}
        footer={detail && actions ? actions(detail) : undefined}
      >
        {detail && (
          <>
            {detail.dateEdited && (
              <Banner
                tone="warning"
                title="Data corrigida — desconta na meta"
                description={[
                  detail.entryDate ? `Para ${new Date(detail.entryDate).toLocaleDateString('pt-BR')}` : null,
                  detail.dateEditedByName ? `por ${detail.dateEditedByName}` : null,
                ].filter(Boolean).join(' ')}
              />
            )}
            {detail.divergent && (
              <Banner
                tone="warning"
                title="Valor fora do padrão"
                description={`Padrão cadastrado: ${detail.standardValue != null ? formatBRL(detail.standardValue) : '—'}`}
              />
            )}
            <DetailView r={detail} />
          </>
        )}
      </Sheet>
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
      <DsSelect
        label="Tipo"
        value={type}
        onValueChange={(v) => setType(v as typeof type)}
        options={[
          { value: 'FREELANCER', label: 'Freelancer' },
          { value: 'OVERTIME', label: 'Hora Extra' },
          { value: 'MISC', label: 'Pagamento Avulso' },
        ]}
      />
      {units.length > 1 && (
        <DsSelect
          label="Unidade"
          value={unitId}
          onValueChange={setUnitId}
          options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
        />
      )}

      {type === 'FREELANCER' && (
        <>
          <DsSelect
            label="Freelancer"
            placeholder="Selecione…"
            value={freelancerId}
            onValueChange={(v) => { setFreelancerId(v); const f = unitFreelancers.find((x) => x.id === v); if (f) setAmount(String(f.defaultValue)); }}
            options={unitFreelancers.map((f) => ({ value: f.id, label: f.name }))}
          />
          {(selectedFreelancer?.sectorRates?.length ?? 0) > 0 && (
            <label className="flex items-center gap-2 rounded-lg border border-dashed p-2 text-sm">
              <input type="checkbox" checked={coverage} onChange={(e) => { setCoverage(e.target.checked); setCoverageSector(''); }} />
              <span><b>Cobertura temporária de setor</b> — valor fechado por dia (varia por setor)</span>
            </label>
          )}
          {coverage && (
            <div>
              <Label>Setor coberto</Label>
              <DsSelect
                aria-label="Setor coberto"
                placeholder="Selecione o setor…"
                value={coverageSector}
                onValueChange={setCoverageSector}
                options={(selectedFreelancer?.sectorRates ?? []).map((r) => ({ value: r.sectorName, label: r.sectorName, hint: `${formatBRL(r.dayValue)}/dia` }))}
              />
              {coverageSector && (
                <p className="mt-1 text-xs text-muted-foreground">Valor do dia: <b>{formatBRL((selectedFreelancer?.sectorRates ?? []).find((r) => r.sectorName === coverageSector)?.dayValue ?? 0)}</b>{transportValue ? ' + VT' : ''} (calculado automaticamente).</p>
              )}
            </div>
          )}
          <DatePicker label="Dia do trabalho" value={workDate || null} onValueChange={(v) => setWorkDate(v ?? '')} />
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
            <p className="rounded-lg bg-medium/10 px-3 py-2 text-xs text-warning">Sem valor/hora cadastrado para este dia nesta unidade. Informe o valor manualmente abaixo (o Admin pode cadastrar em Configurações → Valor do freelancer).</p>
          )}
          <div><Label>Observações (opcional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex: cobriu falta, evento…" /></div>
        </>
      )}

      {type === 'OVERTIME' && (
        <>
          <div><Label>Colaborador</Label><Input value={collaboratorName} onChange={(e) => setCollaboratorName(e.target.value)} placeholder="nome (via RH)" /></div>
          <div className="grid grid-cols-2 gap-2">
            <DatePicker label="Data" value={workDate || null} onValueChange={(v) => setWorkDate(v ?? '')} />
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
            <DsSelect
              aria-label="Tipo de pagamento"
              placeholder="Selecione…"
              value={miscTypeId}
              onValueChange={setMiscTypeId}
              options={miscTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
          {suppliers.length > 0 && (
            <div>
              <Label>Fornecedor (opcional)</Label>
              <DsSelect
                aria-label="Fornecedor"
                placeholder="— nenhum / digitar abaixo —"
                value={supplierId}
                onValueChange={(v) => { const s = suppliers.find((x) => x.id === v); setSupplierId(v); if (s) setBeneficiary(s.name); }}
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              />
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
