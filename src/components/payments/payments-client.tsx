'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Banknote, Plus, Pencil, Trash2, AlertTriangle, ChevronDown, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
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
import { ActionMenu } from '@/components/ui/ds/action-menu';
import { Select as DsSelect } from '@/components/ui/ds/select';
import { TimePicker } from '@/components/ui/ds/time-picker';
import { SearchField } from '@/components/ui/ds/field';
import { FilterBar, FilterSelect, FilterChip } from '@/components/ui/filter-bar';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';

export interface PayDetail {
  workDate: string | null; shift: string | null; workStartTime: string | null; workEndTime: string | null;
  hours: number | null; transportValue: number | null; coverageSector: string | null;
  workSectorId?: string | null; workSectorName?: string | null;
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
  unitId?: string;
  unitCode?: string;
  requestedBy: string | null;
  title: string; // descrição curta (freelancer/colaborador/beneficiário)
  rejectionReason?: string | null;
  divergent?: boolean;
  standardValue?: number | null;
  /// recorrência (04/09): passou do limite semanal do freelancer; weekCount = quantas na semana, contando esta
  recurrent?: boolean;
  weekCount?: number | null;
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
/** Setor de uma unidade (Mapa de Funções): o freelancer já nasce alocado num deles. */
interface SectorOpt { id: string; name: string; unitId: string }

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

import { abaInicial, podeAba, type AcessoAbas } from '@/lib/permissions/abas';

type Tab = 'nova' | 'minhas' | 'aprovar' | 'pagar' | 'historico';

/**
 * Diz quando a lista não cabe inteira na tela.
 *
 * Sem isto, o teto some: a pessoa vê 500 linhas, aprova as 500 e acha que
 * acabou — quando ainda havia 200 esperando. O silêncio é o problema, não o
 * teto.
 */
function ListaCortada({ mostrando, total, limite }: { mostrando: number; total?: number; limite: number }) {
  if (mostrando < limite) return null;
  return (
    <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
      Mostrando <b>{mostrando}</b>{typeof total === 'number' ? <> de <b>{total}</b></> : null} lançamento(s).
      {typeof total === 'number' && total > mostrando
        ? ' Resolva estes e recarregue para ver os próximos — a fila continua depois deles.'
        : ' Há mais na fila do que cabe numa tela.'}
    </p>
  );
}

export function PaymentsClient({
  abas = {},
  isFinanceView,
  isAdmin = false,
  canEditDate = false,
  units,
  freelancers,
  miscTypes,
  suppliers = [],
  sectors = [],
  filtradoPor = [],
  mine,
  toApprove,
  toPay,
  totais,
  limite = 500,
  history,
}: {
  isFinanceView: boolean;
  isAdmin?: boolean;
  canEditDate?: boolean;
  units: Unit[];
  freelancers: Freelancer[];
  miscTypes: MiscType[];
  suppliers?: Supplier[];
  /** Setores ativos das unidades do usuário — obrigatório no freelancer (04/09). */
  sectors?: SectorOpt[];
  /** Nomes das unidades filtradas pelo seletor do cabeçalho; vazio = todas. */
  filtradoPor?: string[];
  mine: PayReq[];
  toApprove: PayReq[];
  toPay: PayReq[];
  /** Quantas existem DE VERDADE em cada fila (count, não tamanho da lista). */
  totais?: { mine: number; toApprove: number; toPay: number; history: number };
  /** Teto de linhas por lista — acima dele a tela avisa que há mais. */
  limite?: number;
  history: PayReq[];
  /** Abas liberadas para o perfil (Configurações → Perfis de acesso). */
  abas?: AcessoAbas;
}) {
  const router = useRouter();
  /* Abre na aba que o perfil PODE ver — abrir numa aba fechada mostraria a
     tela vazia e pareceria defeito. */
  const [tab, setTab] = useState<Tab>(abaInicial(abas, 'PAYMENTS', toApprove.length > 0 ? 'aprovar' : 'nova') as Tab);
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

  async function rejectSelected() {
    if (sel.size === 0) return;
    const ids = [...sel];
    const reason = prompt(`Reprovar ${ids.length} pagamento(s), somando ${formatBRL(selTotal)}.\nMotivo (vale para todos, vai para cada solicitante):`);
    if (reason === null) return;
    if (!reason.trim()) { alert('Informe o motivo da reprovação.'); return; }
    setBusy(true);
    setBatchMsg(null);
    try {
      const res = await fetch('/api/payments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rejectMany', ids, reason: reason.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setBatchMsg({ tone: 'danger', title: d.error ?? 'Falha ao reprovar em lote' }); return; }
      setSel(new Set());
      setBatchMsg(
        d.failed?.length
          ? { tone: 'warning', title: `${d.rejected} reprovada(s), ${d.failed.length} não passaram`, description: 'As que falharam podem já ter sido resolvidas por outra pessoa ou estar fora do seu perfil de aprovação.' }
          : { tone: 'success', title: `${d.rejected} pagamento(s) reprovado(s)`, description: 'Cada solicitante foi avisado com o motivo.' },
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
        {/* Três botões rotulados por lançamento — e dois deles com o MESMO
            lápis, que era o que confundia nas notas. Mesmo menu do resto. */}
        <div className="flex justify-end">
          <ActionMenu
            label={`Ações do pagamento de ${r.title}`}
            items={[
              ...(isAdmin ? [{
                label: 'Editar valor', icon: <Pencil />, disabled: busy,
                onSelect: () => {
                  const v = prompt('Novo valor (R$):', String(r.amount).replace('.', ','));
                  if (v === null) return;
                  const amount = parseFloat(v.replace(/\./g, '').replace(',', '.'));
                  if (!(amount > 0)) { alert('Valor inválido'); return; }
                  act(r.id, 'adminEdit', { amount });
                },
              }] : []),
              ...(canEditDate ? [{
                label: 'Corrigir data', icon: <CalendarClock />, disabled: busy,
                onSelect: () => setDateEditId((id) => (id === r.id ? null : r.id)),
              }] : []),
              ...(isAdmin ? [{
                label: 'Excluir pagamento', icon: <Trash2 />, destructive: true, disabled: busy,
                onSelect: () => { if (confirm(`Excluir este pagamento (${TYPE_LABEL[r.type]} · ${formatBRL(r.amount)})? Registrado na Auditoria.`)) act(r.id, 'adminDelete'); },
              }] : []),
            ]}
          />
        </div>
        {dateEditId === r.id && <InlineDateEdit module="payment" id={r.id} current={(r.entryDate ?? r.requestedAt ?? '').slice(0, 10)} onClose={() => setDateEditId(null)} />}
      </>
    );
  }

  const tabs: { key: Tab; label: string; badge?: number; show: boolean }[] = [
    { key: 'nova', label: 'Nova', show: podeAba(abas, 'nova') },
    { key: 'minhas', label: 'Minhas', show: podeAba(abas, 'minhas') },
    /* O crachá vem do TOTAL de verdade. Com o tamanho da lista ele exibia o
       teto — 100 com 340 pendências — e ninguém tinha como saber das outras. */
    { key: 'aprovar', label: 'Para Aprovar', badge: totais?.toApprove ?? toApprove.length, show: podeAba(abas, 'aprovar') },
    { key: 'pagar', label: 'Pagar', badge: totais?.toPay ?? toPay.length, show: isFinanceView && podeAba(abas, 'pagar') },
    { key: 'historico', label: 'Histórico', show: podeAba(abas, 'historico') },
  ];

  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="Seções de Pagamentos"
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        options={tabs.filter((t) => t.show).map((t) => ({ value: t.key, label: t.label, badge: t.badge, badgeTone: 'danger' as const }))}
      />

      {/* De qual unidade é o que está na tela — antes a rede inteira vinha
          misturada enquanto o cabeçalho dizia uma unidade só. */}
      {tab !== 'nova' && units.length > 1 && (
        <p className="text-xs text-ink-500">
          {filtradoPor.length > 0
            ? <>Mostrando <strong className="text-ink-900">{filtradoPor.join(', ')}</strong>. <a href="?unit=todas" className="font-semibold text-brand hover:underline">Ver todas as unidades</a></>
            : <>Mostrando <strong className="text-ink-900">todas as unidades</strong> do seu acesso — escolha uma no seletor do cabeçalho para filtrar.</>}
        </p>
      )}

      {tab === 'nova' && <NewRequest units={units} freelancers={freelancers} miscTypes={miscTypes} suppliers={suppliers} sectors={sectors} onDone={() => { setTab('minhas'); router.refresh(); }} />}

      <ListaCortada mostrando={
        tab === 'minhas' ? mine.length : tab === 'aprovar' ? toApprove.length : tab === 'pagar' ? toPay.length : tab === 'historico' ? history.length : 0
      } total={
        tab === 'minhas' ? totais?.mine : tab === 'aprovar' ? totais?.toApprove : tab === 'pagar' ? totais?.toPay : tab === 'historico' ? totais?.history : undefined
      } limite={limite} />

      {tab === 'minhas' && <List items={mine} />}

      {tab === 'aprovar' && (
        <>
          {toApprove.length > 1 && (
            // Barra de lote: gruda no topo para o gestor não precisar rolar de
            // volta depois de marcar dezenas de itens.
            <div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-card border border-line bg-glass px-3 py-2 backdrop-blur-xl">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-700">
                <input
                  type="checkbox"
                  checked={sel.size === toApprove.length && toApprove.length > 0}
                  ref={(el) => { if (el) el.indeterminate = sel.size > 0 && sel.size < toApprove.length; }}
                  onChange={() => setSel((s) => (s.size === toApprove.length ? new Set() : new Set(toApprove.map((r) => r.id))))}
                  style={{ accentColor: 'var(--sgo-brand)' }}
                  className="h-4 w-4 rounded outline-none focus-visible:shadow-sgo-focus"
                />
                {/* "todas" só é verdade quando a lista não foi cortada. Com o
                    teto atingido, dizer "todas" faria o gestor aprovar 500 e
                    achar que zerou a fila. */}
                Selecionar {toApprove.length >= limite ? 'as carregadas' : 'todas'} ({toApprove.length})
              </label>
              <span className="text-xs tabular-nums text-ink-500">
                {sel.size} selecionada(s) · {formatBRL(selTotal)}
              </span>
              <span className="ml-auto flex gap-2">
                {sel.size > 0 && <DsButton size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpar</DsButton>}
                <DsButton size="sm" variant="danger" disabled={sel.size === 0 || busy} onClick={rejectSelected}>
                  <X className="h-4 w-4" /> Reprovar selecionadas
                </DsButton>
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
            editor={{ sectors }}
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
  return (
    <div className="space-y-3">
      <FilterBar
        collapsible
        active={(type !== 'ALL' ? 1 : 0) + (unit !== 'ALL' ? 1 : 0) + (status !== 'ALL' ? 1 : 0) + (q.trim() ? 1 : 0)}
        onClear={type !== 'ALL' || unit !== 'ALL' || status !== 'ALL' || q.trim() ? () => { setType('ALL'); setUnit('ALL'); setStatus('ALL'); setQ(''); } : undefined}
        search={<SearchField aria-label="Buscar pagamentos" value={q} onValueChange={setQ} placeholder="Buscar prestador ou beneficiário…" inputSize="sm" />}
        summary={
          <>
            {type !== 'ALL' && <FilterChip>{TYPE_LABEL[type as keyof typeof TYPE_LABEL]}</FilterChip>}
            {unit !== 'ALL' && <FilterChip>{shortUnitName(unit)}</FilterChip>}
            {status !== 'ALL' && <FilterChip>{STATUS[status as PayReq['status']].label}</FilterChip>}
          </>
        }
        result={<>{filtered.length} de {items.length}</>}
      >
        <FilterSelect
          label="Tipo"
          value={type}
          onValueChange={(v) => setType(v as typeof type)}
          options={[
            { value: 'ALL', label: 'Todos os tipos' },
            { value: 'FREELANCER', label: 'Freelancer' },
            { value: 'OVERTIME', label: 'Hora Extra' },
            { value: 'MISC', label: 'Avulso' },
          ]}
        />
        {unitNames.length > 1 && (
          <FilterSelect
            label="Unidade"
            value={unit}
            onValueChange={setUnit}
            options={[{ value: 'ALL', label: 'Todas as unidades' }, ...unitNames.map((u) => ({ value: u, label: shortUnitName(u) }))]}
          />
        )}
        <FilterSelect
          label="Status"
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
      </FilterBar>
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
    rows.push(['Setor / função', d?.workSectorName ?? 'a alocar no Mapa']);
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
  if (r.recurrent) rows.push(['Recorrência', `${r.weekCount ?? '?'} solicitações na semana`]);
  rows.push(['Unidade', r.unit]);
  rows.push(['Solicitado por', `${r.requestedBy ?? '—'}${r.requestedAt ? ` em ${new Date(r.requestedAt).toLocaleString('pt-BR')}` : ''}`]);
  if (d?.approvedBy) rows.push(['Aprovado por', `${d.approvedBy}${d.approvedAt ? ` em ${fmtDate(d.approvedAt)}` : ''}`]);
  if (d?.paidBy) rows.push(['Pago por', `${d.paidBy}${d.paidAt ? ` em ${fmtDate(d.paidAt)}` : ''}`]);
  if (r.rejectionReason) rows.push(['Rejeição', r.rejectionReason]);
  return (
    <div className="mt-2 space-y-1 rounded-md bg-canvas p-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 text-xs">
          <span className="shrink-0 text-ink-500">{k}</span>
          <span className="text-right font-medium text-ink-900">{v}</span>
        </div>
      ))}
      {d?.hasAttachment && d.attachmentPath && (
        <a href={`/${d.attachmentPath}`} target="_blank" rel="noreferrer" className="block pt-1 text-xs font-semibold text-brand underline">Ver anexo</a>
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
    r.recurrent ? `Recorrente: ${r.weekCount ?? '?'}ª na semana` : null,
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
          {r.recurrent && <DsStatusBadge tone="danger" dot>Recorrente</DsStatusBadge>}
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

function List({ items, actions, selection, editor }: {
  items: PayReq[];
  actions?: (r: PayReq) => React.ReactNode;
  /** Quando presente, cada linha ganha caixa de seleção (aprovação em lote). */
  selection?: { ids: Set<string>; onToggle: (id: string) => void };
  /** Quando presente, o detalhe ganha "Editar": o aprovador corrige antes de aprovar (04/09). */
  editor?: { sectors: SectorOpt[] };
}) {
  const router = useRouter();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const detail = items.find((i) => i.id === detailId) ?? null;
  const abrir = (id: string) => { setDetailId(id); setEditing(false); };
  if (items.length === 0) return <p className="text-sm text-ink-500">Nada por aqui.</p>;

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
              <p className="text-sm font-bold text-ink-900">📅 {fmtDay(day)}</p>
              <span className="text-xs text-ink-500">{dayItems.length} lançamento(s) · {formatBRL(dayTotal)}</span>
            </div>
            {unitNames.map((u) => (
              <div key={u} className="space-y-1.5">
                {unitNames.length > 1 && <p className="sgo-type-11 pt-0.5 text-ink-500">{shortUnitName(u)} <span className="font-normal">({byUnit.get(u)!.length})</span></p>}
                <DsList>
                  {byUnit.get(u)!.map((r) => (
                    <Row
                      key={r.id}
                      r={r}
                      onOpen={() => abrir(r.id)}
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
        onClose={() => { setDetailId(null); setEditing(false); }}
        title={detail ? `${editing ? 'Editar · ' : ''}${TYPE_LABEL[detail.type]} · ${detail.title}` : ''}
        description={detail ? `${formatBRL(detail.amount)} · ${shortUnitName(detail.unit)}` : undefined}
        footer={detail && !editing && (actions || editor) ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {editor && detail.status === 'PENDING' && (
              <DsButton size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar</DsButton>
            )}
            {actions?.(detail)}
          </div>
        ) : undefined}
      >
        {detail && editing && editor && (
          <ApproverEditForm
            r={detail}
            sectors={editor.sectors.filter((s) => s.unitId === detail.unitId)}
            onDone={() => { setEditing(false); router.refresh(); }}
            onCancel={() => setEditing(false)}
          />
        )}
        {detail && !editing && (
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
            {detail.recurrent && (
              <Banner
                tone="danger"
                title="Freelancer recorrente na semana"
                description={`${detail.weekCount ?? '?'} solicitações na semana do dia de trabalho (segunda a domingo), contando esta. Confira antes de aprovar.`}
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

function NewRequest({ units, freelancers, miscTypes, suppliers, sectors, onDone }: { units: Unit[]; freelancers: Freelancer[]; miscTypes: MiscType[]; suppliers: Supplier[]; sectors: SectorOpt[]; onDone: () => void }) {
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
  const [workSectorId, setWorkSectorId] = useState(''); // setor/função contratado — obrigatório (04/09)
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
  const unitSectors = useMemo(() => sectors.filter((s) => s.unitId === unitId), [sectors, unitId]);
  // Trocou a unidade: o setor era da outra.
  useEffect(() => { setWorkSectorId(''); }, [unitId]);
  // Cobertura de setor escolhida: o setor de mesmo nome já vem marcado.
  useEffect(() => {
    if (!coverage || !coverageSector) return;
    const igual = unitSectors.find((s) => s.name.trim().toLowerCase() === coverageSector.trim().toLowerCase());
    if (igual) setWorkSectorId(igual.id);
  }, [coverage, coverageSector, unitSectors]);

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
    if (type === 'FREELANCER') {
      if (!freelancerId) { setErr('Escolha o freelancer.'); return; }
      if (!workDate) { setErr('Informe o dia do trabalho.'); return; }
      if (!workSectorId) { setErr('Escolha o setor/função para o qual o freelancer foi contratado.'); return; }
    }
    if (!unitId || (!coverage && !autoPriced && !effAmt)) { setErr('Informe unidade e valor.'); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { type, unitId, amount: effAmt, description };
      if (type === 'FREELANCER') Object.assign(body, { freelancerId, workDate, shift, workSectorId, workStartTime: workStartTime || undefined, workEndTime: workEndTime || undefined, transportValue: transportValue ? parseFloat(transportValue.replace(',', '.')) : undefined, hours: hours ? Number(hours) : undefined, coverageSector: coverage && coverageSector ? coverageSector : undefined });
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
                <p className="mt-1 text-xs text-ink-500">Valor do dia: <b>{formatBRL((selectedFreelancer?.sectorRates ?? []).find((r) => r.sectorName === coverageSector)?.dayValue ?? 0)}</b>{transportValue ? ' + VT' : ''} (calculado automaticamente).</p>
              )}
            </div>
          )}
          <DatePicker label="Dia do trabalho" value={workDate || null} onValueChange={(v) => setWorkDate(v ?? '')} />
          <DsSelect
            label="Setor / função contratada"
            required
            placeholder={unitSectors.length ? 'Selecione o setor…' : 'Unidade sem setores cadastrados'}
            value={workSectorId}
            onValueChange={setWorkSectorId}
            disabled={unitSectors.length === 0}
            options={unitSectors.map((s) => ({ value: s.id, label: s.name }))}
            hint={unitSectors.length ? undefined : 'O Admin cadastra os setores em Pessoas → Mapa de Funções.'}
          />
          <div className="grid grid-cols-2 gap-2">
            <TimePicker label="Hora início" value={workStartTime || null} onValueChange={(v) => setWorkStartTime(v ?? '')} />
            <TimePicker label="Hora fim" value={workEndTime || null} onValueChange={(v) => setWorkEndTime(v ?? '')} />
          </div>
          <p className="text-xs text-ink-500">O freelancer já entra no Mapa da unidade nesse dia, no setor escolhido. Sem horário, conta o dia todo.</p>
          <div><Label>Vale transporte (R$, opcional)</Label><Input inputMode="decimal" value={transportValue} onChange={(e) => setTransportValue(e.target.value)} placeholder="0,00" /></div>
          {calc?.configured && (
            <div className="rounded-lg border-2 border-brand/40 bg-brand/5 p-3">
              <p className="text-xs text-ink-500">Valor calculado ({calc.dayTypeLabel})</p>
              <p className="sgo-type-24 font-semibold text-ink-900">{formatBRL(calc.amount)}</p>
              <p className="text-xs text-ink-500">{calc.hours}h × {formatBRL(calc.rate ?? 0)}/h{calc.transport > 0 ? ` + ${formatBRL(calc.transport)} VT` : ''}</p>
            </div>
          )}
          {calc && !calc.configured && workDate && workStartTime && workEndTime && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Sem valor/hora cadastrado para este dia nesta unidade. Informe o valor manualmente abaixo (o Admin pode cadastrar em Configurações → Valor do freelancer).</p>
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
          <p className="text-xs text-ink-500">Valor é estimativa para aprovação; o cálculo final (50%/100%, reflexos) é do RH/folha.</p>
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
                value={supplierId}
                onValueChange={(v) => { const s = suppliers.find((x) => x.id === v); setSupplierId(v); if (s) setBeneficiary(s.name); }}
                options={[{ value: '', label: '— nenhum / digitar abaixo —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
              />
            </div>
          )}
          <div><Label>Beneficiário</Label><Input value={beneficiary} onChange={(e) => { setBeneficiary(e.target.value); setSupplierId(''); }} /></div>
          <div><Label>Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </>
      )}

      {!autoPriced && <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>}

      {freelaDivergent && selectedFreelancer && (
        <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Valor diferente do padrão cadastrado ({formatBRL(selectedFreelancer.defaultValue)}). Você pode prosseguir — o aprovador será avisado da divergência.
        </p>
      )}

      {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Plus className="h-5 w-5" /> Enviar solicitação</Button>
    </div>
  );
}

/**
 * O aprovador corrige a solicitação ANTES de aprovar (04/09). Mesmos campos do
 * lançamento, por tipo. Freelancer com valor/hora cadastrado na unidade tem o
 * valor recalculado do horário (prévia igual à da tela Nova); cobertura de setor
 * tem valor fixo do dia. O servidor confere tudo de novo e registra antes/depois.
 */
function ApproverEditForm({ r, sectors, onDone, onCancel }: { r: PayReq; sectors: SectorOpt[]; onDone: () => void; onCancel: () => void }) {
  const d = r.detail;
  const dec = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
  const num = (s: string) => parseFloat((s || '0').replace(/\./g, '').replace(',', '.')) || 0;
  const [workDate, setWorkDate] = useState(d?.workDate ?? '');
  const [start, setStart] = useState(d?.workStartTime ?? '');
  const [end, setEnd] = useState(d?.workEndTime ?? '');
  const [workSectorId, setWorkSectorId] = useState(d?.workSectorId ?? '');
  const [transport, setTransport] = useState(dec(d?.transportValue));
  const [amount, setAmount] = useState(dec(r.amount));
  const [description, setDescription] = useState(d?.description ?? '');
  const [collaboratorName, setCollaboratorName] = useState(d?.collaboratorName ?? '');
  const [hours, setHours] = useState(dec(d?.hours));
  const [reason, setReason] = useState(d?.reason ?? '');
  const [beneficiary, setBeneficiary] = useState(d?.beneficiary ?? '');
  const [calc, setCalc] = useState<{ configured: boolean; hours: number; rate: number | null; amount: number; transport: number; dayTypeLabel: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const coverage = r.type === 'FREELANCER' && Boolean(d?.coverageSector);
  const coverageAmount = coverage ? (r.standardValue ?? 0) + num(transport) : null;

  // Prévia do valor: horas × valor/hora do dia + VT, como na tela Nova.
  useEffect(() => {
    if (r.type !== 'FREELANCER' || coverage || !r.unitId || !workDate || !start || !end) { setCalc(null); return; }
    let cancelled = false;
    fetch('/api/payments/freelancer-calc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId: r.unitId, workDate, start, end, transport: num(transport) }) })
      .then((res) => res.json()).then((data) => { if (!cancelled) setCalc(data); }).catch(() => { if (!cancelled) setCalc(null); });
    return () => { cancelled = true; };
  }, [r.type, r.unitId, coverage, workDate, start, end, transport]); // eslint-disable-line react-hooks/exhaustive-deps
  const autoPriced = Boolean(calc?.configured);

  async function salvar() {
    setErr(null);
    const body: Record<string, unknown> = { action: 'approverEdit', description };
    if (r.type === 'FREELANCER') {
      if (!workDate) { setErr('Informe o dia do trabalho.'); return; }
      if (!workSectorId) { setErr('Escolha o setor/função.'); return; }
      if (Boolean(start) !== Boolean(end)) { setErr('Informe hora início e hora fim.'); return; }
      Object.assign(body, { workDate, workStartTime: start || null, workEndTime: end || null, workSectorId, transportValue: transport ? num(transport) : null });
      if (!autoPriced && !coverage) body.amount = num(amount);
    } else if (r.type === 'OVERTIME') {
      Object.assign(body, { collaboratorName, workDate: workDate || '', hours: hours ? num(hours) : null, reason, transportValue: transport ? num(transport) : null, amount: num(amount) });
    } else {
      Object.assign(body, { beneficiary, amount: num(amount) });
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${r.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha ao salvar'); return; }
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {r.type === 'FREELANCER' && (
        <>
          <p className="text-sm font-semibold text-ink-900">{r.title}{d?.pixKey ? <span className="font-normal text-ink-500"> · PIX {d.pixKey}</span> : null}</p>
          {coverage && <Banner tone="info" title={`Cobertura de setor: ${d?.coverageSector}`} description="Valor fechado por dia (do cadastro do freelancer) + vale transporte." />}
          <DatePicker label="Dia do trabalho" value={workDate || null} onValueChange={(v) => setWorkDate(v ?? '')} />
          <DsSelect
            label="Setor / função contratada" required
            placeholder={sectors.length ? 'Selecione o setor…' : 'Unidade sem setores cadastrados'}
            value={workSectorId} onValueChange={setWorkSectorId} disabled={sectors.length === 0}
            options={sectors.map((s) => ({ value: s.id, label: s.name }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <TimePicker label="Hora início" value={start || null} onValueChange={(v) => setStart(v ?? '')} />
            <TimePicker label="Hora fim" value={end || null} onValueChange={(v) => setEnd(v ?? '')} />
          </div>
          <div><Label>Vale transporte (R$)</Label><Input inputMode="decimal" value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="0,00" /></div>
          {coverage ? (
            <div className="rounded-lg border-2 border-brand/40 bg-brand/5 p-3">
              <p className="text-xs text-ink-500">Valor do dia + VT</p>
              <p className="sgo-type-24 font-semibold text-ink-900">{formatBRL(coverageAmount ?? 0)}</p>
            </div>
          ) : autoPriced && calc ? (
            <div className="rounded-lg border-2 border-brand/40 bg-brand/5 p-3">
              <p className="text-xs text-ink-500">Valor calculado ({calc.dayTypeLabel})</p>
              <p className="sgo-type-24 font-semibold text-ink-900">{formatBRL(calc.amount)}</p>
              <p className="text-xs text-ink-500">{calc.hours}h × {formatBRL(calc.rate ?? 0)}/h{calc.transport > 0 ? ` + ${formatBRL(calc.transport)} VT` : ''}</p>
            </div>
          ) : (
            <div>
              <Label>Valor (R$)</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {r.standardValue != null && <p className="mt-1 text-xs text-ink-500">Padrão cadastrado: {formatBRL(r.standardValue)}.</p>}
            </div>
          )}
        </>
      )}
      {r.type === 'OVERTIME' && (
        <>
          <div><Label>Colaborador</Label><Input value={collaboratorName} onChange={(e) => setCollaboratorName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <DatePicker label="Data" value={workDate || null} onValueChange={(v) => setWorkDate(v ?? '')} />
            <div><Label>Horas</Label><Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
          </div>
          <div><Label>Motivo</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div><Label>Vale transporte (R$)</Label><Input inputMode="decimal" value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="0,00" /></div>
          <div><Label>Valor total (R$)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </>
      )}
      {r.type === 'MISC' && (
        <>
          <div><Label>Beneficiário</Label><Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} /></div>
          <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        </>
      )}
      <div><Label>Observações</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <p className="text-xs text-ink-500">A correção fica na Auditoria (antes e depois) e o solicitante é avisado.</p>
      <div className="flex justify-end gap-2">
        <DsButton size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</DsButton>
        <DsButton size="sm" loading={busy} onClick={salvar}><Check className="h-4 w-4" /> Salvar correções</DsButton>
      </div>
    </div>
  );
}
