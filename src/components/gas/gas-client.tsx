'use client';

import { useMemo, useRef, useState } from 'react';
import { StatCard } from '@/components/ui/ds/stat-card';
import { useRouter } from 'next/navigation';
import { ScanLine, Save, AlertTriangle, TrendingUp, TrendingDown, Pencil, X, Trash2, CalendarClock, Plus, Scale, Power, Paperclip, Download, FileText, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { abaInicial, podeAba, type AcessoAbas } from '@/lib/permissions/abas';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { SearchField } from '@/components/ui/ds/field';
import { FilterBar, FilterSelect, FilterChip } from '@/components/ui/filter-bar';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';
import { QrScanner } from '@/components/notes/qr-scanner';
import { InlineDateEdit } from '@/components/shared/inline-date-edit';
import { postAdmin } from '@/lib/admin-client';
import { parseChaveAcesso } from '@/lib/notes/chave';
import { formatBRL } from '@/lib/utils';
import { PRESETS_DE_PERIODO, datasDoPreset, type PresetDePeriodo } from '@/lib/gas/periodo';
import { Group } from '@/components/ui/ds/group';
import { Sheet } from '@/components/ui/ds/sheet';
import { ActionMenu } from '@/components/ui/ds/action-menu';

interface Unit { id: string; name: string }
interface Supplier { id: string; name: string; cnpj: string | null }
interface GroupStat { key: string; name: string; count: number; avg: number; last: number; min: number; max: number; kg: number; total: number }
interface MonthPoint { month: string; avg: number; count: number }
export interface GasOutlierRow { id: string; unitId: string; unitName: string; date: string; pricePerKg: number; kg: number; total: number }
export interface GasDash { totalReceipts: number; avgPrice: number; lastPrice: number | null; totalKg: number; totalValue: number; byUnit: GroupStat[]; bySupplier: GroupStat[]; monthly: MonthPoint[]; alertPct: number; tetoPrecoKg: number; foraDaFaixa: GasOutlierRow[] }
/** Documento (PDF/imagem) anexado a um contrato. */
export interface ContractDocUI { id: string; path: string; fileName: string | null; mimeType: string | null; uploadedAt: string; uploadedByName: string | null }
export interface GasRow {
  id: string; unitId: string; date: string; unit: string; supplier: string; qty: number; total: number;
  price: number; variation: number | null; alerted: boolean; by: string;
  dateEdited?: boolean; dateEditedByName?: string | null;
}
export interface GasContractUI {
  id: string; unitId: string; unitName: string; supplierId: string; supplierName: string;
  startDate: string; endDate: string; quantityKg: number; pricePerKg: number; initialUsedKg: number;
  purchasedKg: number; usedKg: number; progressPct: number; remainingKg: number; expired: boolean; active: boolean; note: string | null;
  foraDoContrato?: { id: string; date: string; kg: number; supplierName: string; motivo: 'FORA_DO_PERIODO' | 'OUTRO_FORNECEDOR' | 'SEM_FORNECEDOR' }[];
  foraDoContratoKg?: number;
  /** Documentos anexados (mais recente primeiro). */
  documents?: ContractDocUI[];
}
export interface PurchasedUI { kg: number; total: number; count: number }

const kg = (n: number) => `R$ ${n.toFixed(4).replace('.', ',')}/kg`;
/** 'AAAA-MM-DD' → 'DD/MM/AAAA', sem Date (fuso não muda um dia operacional). */
const br = (iso: string) => { const [y, m, d] = iso.split('-'); return d ? `${d}/${m}/${y}` : iso; };
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function mlabel(m: string) { const [y, mm] = m.split('-'); return `${MONTHS[Number(mm) - 1]}/${y.slice(2)}`; }

export function GasClient({ canLaunch, isAdmin, canEditDate = false, units, suppliers, dashboard, receipts, contracts = [], purchased, canManageContracts = false, filter, basePath = '/modulos/gas', abas = {} }: {
  canLaunch: boolean; isAdmin: boolean; canEditDate?: boolean; units: Unit[]; suppliers: Supplier[]; dashboard: GasDash; receipts: GasRow[];
  contracts?: GasContractUI[]; purchased?: PurchasedUI; canManageContracts?: boolean; filter?: { unitId: string; supplierId: string; mes: string }; basePath?: string;

  /** Abas liberadas para o perfil (Configurações → Perfis de acesso). */
  abas?: AcessoAbas;
}) {
  const [tab, setTab] = useState<'painel' | 'lancar' | 'historico' | 'contratos'>(abaInicial(abas, 'GAS', canLaunch ? 'lancar' : 'painel') as 'painel' | 'lancar' | 'historico' | 'contratos');
  const tabs: { key: typeof tab; label: string; show: boolean }[] = [
    { key: 'painel', label: 'Dashboard', show: true },
    { key: 'lancar', label: 'Lançar recebimento', show: canLaunch },
    { key: 'historico', label: 'Histórico', show: true },
    { key: 'contratos', label: `Contratos (${contracts.filter((c) => c.active).length})`, show: true },
  ];
  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="Seções de Recebimento de Gás"
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        options={tabs.filter((t) => t.show && podeAba(abas, t.key)).map((t) => ({ value: t.key, label: t.label }))}
      />
      {tab === 'lancar' && canLaunch && <Launch units={units} suppliers={suppliers} />}
      {tab === 'painel' && (
        <>
          <DashFilters units={units} suppliers={suppliers} filter={filter} purchased={purchased} basePath={basePath} />
          <ContractProgress contracts={contracts.filter((c) => c.active && !c.expired)} compact />
          <Dashboard d={dashboard} isAdmin={isAdmin} receipts={receipts} contracts={contracts} units={units} />
        </>
      )}
      {tab === 'historico' && <History rows={receipts} isAdmin={isAdmin} canEditDate={canEditDate} />}
      {tab === 'contratos' && <ContractsTab contracts={contracts} units={units} suppliers={suppliers} canManage={canManageContracts} isAdmin={isAdmin} />}
    </div>
  );
}

/* ───────── Filtros do dashboard + total comprado (16/07) ───────── */
function DashFilters({ units, suppliers, filter, purchased, basePath = '/modulos/gas' }: { units: Unit[]; suppliers: Supplier[]; filter?: { unitId: string; supplierId: string; mes: string }; purchased?: PurchasedUI; basePath?: string }) {
  const router = useRouter();
  const f = filter ?? { unitId: '', supplierId: '', mes: '' };
  const nav = (patch: Partial<typeof f>) => {
    const next = { ...f, ...patch };
    const sp = new URLSearchParams();
    if (next.unitId) sp.set('unidade', next.unitId);
    if (next.supplierId) sp.set('fornecedor', next.supplierId);
    if (next.mes) sp.set('mes', next.mes);
    router.push(`${basePath}${sp.toString() ? `?${sp.toString()}` : ''}`);
  };
  const months: string[] = [];
  { const d = new Date(); for (let i = 0; i < 12; i++) { months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1); } }
  return (
    <div className="space-y-2">
      <FilterBar
        collapsible
        active={(f.unitId ? 1 : 0) + (f.supplierId ? 1 : 0) + (f.mes ? 1 : 0)}
        onClear={f.unitId || f.supplierId || f.mes ? () => router.push(basePath) : undefined}
        summary={
          <>
            {f.unitId && <FilterChip>{shortUnitName(units.find((u) => u.id === f.unitId)?.name ?? '')}</FilterChip>}
            {f.supplierId && <FilterChip>{suppliers.find((s) => s.id === f.supplierId)?.name ?? ''}</FilterChip>}
            {f.mes && <FilterChip>{f.mes.split('-').reverse().join('/')}</FilterChip>}
            {!f.unitId && !f.supplierId && !f.mes && <FilterChip>Tudo</FilterChip>}
          </>
        }
        /* SEM `result` aqui: a fileira de números logo abaixo já É o resultado
           do filtro. Com ele, "45 recebimentos" aparecia três vezes na mesma
           tela — na barra, no cartão "no filtro" e no cartão "Recebimentos". */
      >
        <FilterSelect
          label="Unidade" value={f.unitId} onValueChange={(v) => nav({ unitId: v })}
          options={[{ value: '', label: 'Todas as unidades' }, ...units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]}
        />
        <FilterSelect
          label="Fornecedor" value={f.supplierId} onValueChange={(v) => nav({ supplierId: v })}
          options={[{ value: '', label: 'Todos os fornecedores' }, ...suppliers.map((sp) => ({ value: sp.id, label: sp.name }))]}
        />
        <FilterSelect
          label="Mês" value={f.mes} onValueChange={(v) => nav({ mes: v })}
          options={[{ value: '', label: 'Todos os meses' }, ...months.map((m) => ({ value: m, label: m.split('-').reverse().join('/') }))]}
        />
      </FilterBar>
      {/* A fileira de "comprado/valor/recebimentos no filtro" saiu daqui: era a
          MESMA coisa que os cartões do Dashboard logo abaixo, com outro
          desenho. Duas fileiras de números empilhadas, dizendo o mesmo, é o
          que faz a tela parecer poluída — e nenhum dos dois vira hierarquia,
          porque os dois gritam igual. O valor total, que só existia aqui,
          virou um cartão do Dashboard. */}
    </div>
  );
}

/* ───────── Contratos: barras de % cumprido ───────── */
function ContractProgress({ contracts, compact = false }: { contracts: GasContractUI[]; compact?: boolean }) {
  if (contracts.length === 0) return null;
  return (
    <div className="rounded-lg border bg-surface p-3">
      <p className="mb-2 sgo-type-11 font-semibold text-ink-500">Contratos vigentes — % cumprido</p>
      <div className="space-y-2.5">
        {contracts.map((c) => (
          <div key={c.id}>
            <div className="flex items-center justify-between text-sm">
              <span className="min-w-0 truncate font-medium text-ink-900">{c.unitName} · {c.supplierName}</span>
              <span className="shrink-0 text-xs tabular-nums"><b>{c.progressPct}%</b> · {c.usedKg.toLocaleString('pt-BR')}/{c.quantityKg.toLocaleString('pt-BR')} kg</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-sunken">
              <div className={`h-full rounded-full ${c.progressPct >= 100 ? 'bg-danger' : c.progressPct >= 80 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${Math.min(100, c.progressPct)}%` }} />
            </div>
            {!compact && <p className="mt-0.5 text-xs text-ink-500">{c.startDate.split('-').reverse().join('/')} → {c.endDate.split('-').reverse().join('/')} · {kg(c.pricePerKg)} acordado · restam {c.remainingKg.toLocaleString('pt-BR')} kg</p>}
            <ForaDoContrato contrato={c} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * O QUE O CONTRATO DEIXOU DE FORA.
 *
 * Não existe FK entre o recebimento e o contrato: o vínculo é INFERIDO por
 * unidade + fornecedor + janela de datas, e qualquer uma das três exclui uma
 * nota sem dizer nada. Foi assim que 429 kg sumiram de um contrato, e a
 * divergência só apareceu quando alguém somou a lista na mão.
 *
 * Enquanto não há FK, o mínimo honesto é o contrato EXPLICAR O PRÓPRIO NÚMERO:
 * a nota que quase entrou aparece com a data, o peso e o motivo — e o motivo
 * diz qual é o conserto (mexer no período do contrato, na data da nota ou no
 * fornecedor dela).
 */
const MOTIVO: Record<string, string> = {
  FORA_DO_PERIODO: 'fora do período do contrato',
  OUTRO_FORNECEDOR: 'lançada com outro fornecedor',
  SEM_FORNECEDOR: 'sem fornecedor na nota',
};

function ForaDoContrato({ contrato }: { contrato: GasContractUI }) {
  const fora = contrato.foraDoContrato ?? [];
  if (fora.length === 0) return null;
  const total = contrato.foraDoContratoKg ?? 0;
  return (
    <div className="mt-1.5 rounded-lg border border-warning/40 bg-warning-bg p-2">
      <p className="sgo-type-11 font-semibold text-ink-900">
        {total.toLocaleString('pt-BR')} kg desta unidade NÃO entraram neste contrato
        {fora.length > 1 ? ` (${fora.length} lançamentos)` : ''}
      </p>
      <ul className="mt-1 space-y-0.5">
        {fora.slice(0, 6).map((f) => (
          <li key={f.id} className="sgo-type-11 tabular-nums text-ink-700">
            {f.date.split('-').reverse().join('/')} · {f.kg.toLocaleString('pt-BR')} kg · {f.supplierName} — <b>{MOTIVO[f.motivo] ?? f.motivo}</b>
          </li>
        ))}
        {fora.length > 6 && <li className="sgo-type-11 text-ink-500">e mais {fora.length - 6}…</li>}
      </ul>
      <p className="mt-1 sgo-type-11 text-ink-500">
        Corrija o período do contrato, a data da nota ou o fornecedor dela — conforme o motivo acima.
      </p>
    </div>
  );
}

/* ───────── Aba Contratos (gestão — Supervisão/Admin) ───────── */
/* ───────── Painel de documentos por contrato ───────── */
function DocumentsPanel({ contractId, docs, canManage }: { contractId: string; docs: ContractDocUI[]; canManage: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('contractId', contractId);
    fd.append('file', file);
    setUploading(true);
    try {
      const res = await fetch('/api/gas/contracts/documents', { method: 'POST', body: fd });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha ao enviar'); return; }
      router.refresh();
      setExpanded(true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const latest = docs[0] ?? null;

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Mostrar o documento mais recente */}
        {latest && (
          <a
            href={`/${latest.path}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border bg-surface px-2 py-0.5 text-xs font-medium text-brand hover:border-brand"
          >
            {latest.mimeType === 'application/pdf' ? <FileText className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {latest.fileName ?? 'Documento'}{docs.length > 1 ? ` (+${docs.length - 1})` : ''}
          </a>
        )}
        {canManage && (
          <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-ink-500 hover:border-brand hover:text-brand ${uploading ? 'opacity-50' : ''}`}>
            <Paperclip className="h-3.5 w-3.5" />
            {uploading ? 'Enviando…' : latest ? 'Nova versão' : 'Anexar contrato'}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" onChange={handleFile} disabled={uploading} />
          </label>
        )}
        {docs.length > 1 && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-ink-500 underline-offset-2 hover:underline">
            {expanded ? 'Ocultar versões' : `Ver todas as ${docs.length} versões`}
          </button>
        )}
      </div>
      {expanded && docs.length > 1 && (
        <div className="mt-1.5 space-y-1 rounded-lg border bg-canvas p-2">
          <p className="sgo-type-11 font-semibold text-ink-500">Histórico de documentos</p>
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs">
              <a
                href={`/${d.path}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-medium text-brand hover:underline"
              >
                <Download className="h-3 w-3" />{d.fileName ?? 'Arquivo'}
              </a>
              <span className="text-ink-500">{new Date(d.uploadedAt).toLocaleDateString('pt-BR')}{d.uploadedByName ? ` · ${d.uploadedByName}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractsTab({ contracts, units, suppliers, canManage, isAdmin }: { contracts: GasContractUI[]; units: Unit[]; suppliers: Supplier[]; canManage: boolean; isAdmin: boolean }) {
  const [novoContrato, setNovoContrato] = useState(false);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ unitId: '', supplierId: '', startDate: '', endDate: '', quantityKg: '', pricePerKg: '', initialUsedKg: '', note: '' });
  const set = (k: keyof typeof form, v: string) => setForm((s2) => ({ ...s2, [k]: v }));

  // Edição de um contrato existente (unidade/fornecedor não mudam — são a identidade).
  const [editId, setEditId] = useState<string | null>(null);
  const [ef, setEf] = useState({ startDate: '', endDate: '', quantityKg: '', pricePerKg: '', note: '' });
  const setE = (k: keyof typeof ef, v: string) => setEf((s2) => ({ ...s2, [k]: v }));
  function openEdit(c: GasContractUI) {
    setEditId(c.id);
    setEf({ startDate: c.startDate, endDate: c.endDate, quantityKg: String(c.quantityKg), pricePerKg: String(c.pricePerKg).replace('.', ','), note: c.note ?? '' });
  }

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/gas/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { router.refresh(); return true; }
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? 'Falha');
      return false;
    } finally { setBusy(false); }
  }

  const num = (v: string) => parseFloat(v.replace(/\./g, '').replace(',', '.'));

  return (
    <div className="space-y-4">
      {/* O formulário ocupava a tela inteira ANTES dos contratos: quem entrava
          para conferir o andamento via primeiro seis campos vazios, e a lista
          — o motivo da visita — ficava embaixo. Virou folha, atrás do botão. */}
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setNovoContrato(true)}><Plus className="h-4 w-4" /> Novo contrato</Button>
        </div>
      )}
      {canManage && (
        <Sheet
          open={novoContrato}
          onClose={() => setNovoContrato(false)}
          title="Novo contrato"
          description="Período, quantidade contratada e preço/kg. Os recebimentos lançados abatem sozinhos."
        >
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="Unidade" size="sm" placeholder="Unidade…" value={form.unitId} onValueChange={(v) => set('unitId', v)}
                options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
              />
              <Select
                label="Fornecedor" size="sm" placeholder="Fornecedor…" value={form.supplierId} onValueChange={(v) => set('supplierId', v)}
                options={suppliers.map((sp) => ({ value: sp.id, label: sp.name }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DatePicker label="Início" size="sm" value={form.startDate || null} onValueChange={(v) => set('startDate', v ?? '')} />
              <DatePicker label="Fim" size="sm" value={form.endDate || null} onValueChange={(v) => set('endDate', v ?? '')} min={form.startDate || undefined} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Quantidade (kg)</Label><Input inputMode="decimal" value={form.quantityKg} onChange={(e) => set('quantityKg', e.target.value)} placeholder="ex.: 12000" className="h-10 text-sm" /></div>
              <div><Label className="text-xs">Preço/kg (R$)</Label><Input inputMode="decimal" value={form.pricePerKg} onChange={(e) => set('pricePerKg', e.target.value)} placeholder="ex.: 7,80" className="h-10 text-sm" /></div>
              <div><Label className="text-xs">Já comprado (kg)</Label><Input inputMode="decimal" value={form.initialUsedKg} onChange={(e) => set('initialUsedKg', e.target.value)} placeholder="posição atual" className="h-10 text-sm" /></div>
            </div>
            <Input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Observação (opcional)" className="h-10 text-sm" />
            <p className="text-xs text-ink-500">&quot;Já comprado&quot; = posição de contrato que já estava andando antes do SGO; os recebimentos lançados daqui em diante abatem sozinhos.</p>
            <Button className="w-full" disabled={busy || !form.unitId || !form.supplierId || !form.startDate || !form.endDate || !form.quantityKg || !form.pricePerKg}
              onClick={async () => {
                const ok = await post({ action: 'create', unitId: form.unitId, supplierId: form.supplierId, startDate: form.startDate, endDate: form.endDate, quantityKg: num(form.quantityKg), pricePerKg: num(form.pricePerKg), initialUsedKg: form.initialUsedKg ? num(form.initialUsedKg) : undefined, note: form.note });
                if (ok) { setForm({ unitId: '', supplierId: '', startDate: '', endDate: '', quantityKg: '', pricePerKg: '', initialUsedKg: '', note: '' }); setNovoContrato(false); }
              }}>Criar contrato</Button>
          </div>
        </Sheet>
      )}

      <ContractProgress contracts={contracts.filter((c) => c.active)} />

      <div className="space-y-1.5">
        {contracts.map((c) => (
          <div key={c.id} className={`rounded-lg border p-2.5 ${c.expired || !c.active ? 'opacity-70' : 'bg-surface'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-ink-900">{c.unitName} · {c.supplierName}</p>
              <div className="flex shrink-0 items-center gap-1.5">
                {(c.documents?.length ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                    <Paperclip className="h-3 w-3" /> Doc
                  </span>
                )}
                <span className="text-xs font-bold tabular-nums">{c.progressPct}%{c.expired ? ' · vencido' : !c.active ? ' · inativo' : ''}</span>
              </div>
            </div>
            <p className="text-xs text-ink-500 tabular-nums">
              {c.startDate.split('-').reverse().join('/')} → {c.endDate.split('-').reverse().join('/')} · {c.quantityKg.toLocaleString('pt-BR')} kg a {kg(c.pricePerKg)} ·
              comprado {c.purchasedKg.toLocaleString('pt-BR')} kg{c.initialUsedKg > 0 ? ` (+${c.initialUsedKg.toLocaleString('pt-BR')} kg posição inicial)` : ''} · restam {c.remainingKg.toLocaleString('pt-BR')} kg
            </p>
            {c.note && <p className="text-xs text-ink-500">Obs.: {c.note}</p>}
            <DocumentsPanel contractId={c.id} docs={c.documents ?? []} canManage={canManage} />
            {canManage && (editId === c.id ? (
              <div className="mt-2 space-y-2 rounded-lg border border-dashed p-2">
                <p className="sgo-type-11 font-semibold text-ink-500">Editar contrato</p>
                <div className="grid grid-cols-2 gap-2">
                  <DatePicker label="Início" size="sm" value={ef.startDate || null} onValueChange={(v) => setE('startDate', v ?? '')} />
                  <DatePicker label="Fim" size="sm" value={ef.endDate || null} onValueChange={(v) => setE('endDate', v ?? '')} min={ef.startDate || undefined} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Quantidade (kg)</Label><Input inputMode="decimal" value={ef.quantityKg} onChange={(e) => setE('quantityKg', e.target.value)} className="h-9 text-sm" /></div>
                  <div><Label className="text-xs">Preço/kg (R$)</Label><Input inputMode="decimal" value={ef.pricePerKg} onChange={(e) => setE('pricePerKg', e.target.value)} className="h-9 text-sm" /></div>
                </div>
                <Input value={ef.note} onChange={(e) => setE('note', e.target.value)} placeholder="Observação (opcional)" className="h-9 text-sm" />
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditId(null)}><X className="h-4 w-4" /> Cancelar</Button>
                  <Button size="sm" disabled={busy || !ef.startDate || !ef.endDate || !ef.quantityKg || !ef.pricePerKg} onClick={async () => {
                    if (await post({ action: 'update', id: c.id, startDate: ef.startDate, endDate: ef.endDate, quantityKg: num(ef.quantityKg), pricePerKg: num(ef.pricePerKg), note: ef.note })) setEditId(null);
                  }}><Save className="h-4 w-4" /> Salvar</Button>
                </div>
              </div>
            ) : (
              /* Quatro botões rotulados por contrato viravam uma faixa cinza
                 sob cada linha. Mesmo menu das notas e do histórico. */
              <div className="mt-1.5 flex justify-end">
                <ActionMenu
                  label={`Ações do contrato ${c.unitName} · ${c.supplierName}`}
                  items={[
                    { label: 'Editar contrato', icon: <Pencil />, disabled: busy, onSelect: () => openEdit(c) },
                    {
                      label: 'Ajustar posição inicial',
                      icon: <Scale />,
                      disabled: busy,
                      onSelect: () => {
                        const v = prompt('Ajustar posição inicial (kg já comprados antes do SGO):', String(c.initialUsedKg).replace('.', ','));
                        if (v === null) return;
                        void post({ action: 'update', id: c.id, initialUsedKg: num(v) });
                      },
                    },
                    { label: c.active ? 'Inativar contrato' : 'Reativar contrato', icon: <Power />, disabled: busy, onSelect: () => void post({ action: 'update', id: c.id, active: !c.active }) },
                    ...(isAdmin ? [{
                      label: 'Excluir contrato',
                      icon: <Trash2 />,
                      destructive: true,
                      disabled: busy,
                      onSelect: () => { if (confirm('Excluir este contrato? (auditado)')) void post({ action: 'delete', id: c.id }); },
                    }] : []),
                  ]}
                />
              </div>
            ))}
          </div>
        ))}
        {contracts.length === 0 && <p className="text-sm text-ink-500">Nenhum contrato cadastrado.</p>}
      </div>
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
  // Botijão (P45)
  const [kind, setKind] = useState<'BULK' | 'CYLINDER'>('BULK');
  const [cylCount, setCylCount] = useState('');
  const [cylKg, setCylKg] = useState('45');
  const [cylReturned, setCylReturned] = useState('');
  const [cylTotal, setCylTotal] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const q = parseFloat((qty || '0').replace(',', '.'));
  const price = parseFloat((unitPrice || '0').replace(',', '.'));
  const total = q > 0 && price > 0 ? q * price : 0;
  // botijão
  const cc = parseInt(cylCount || '0', 10);
  const ck = parseInt(cylKg || '45', 10) || 45;
  const cTotal = parseFloat((cylTotal || '0').replace(',', '.'));
  const cKg = cc > 0 ? cc * ck : 0;
  const cPricePerKg = cKg > 0 && cTotal > 0 ? cTotal / cKg : 0;

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
    const body: Record<string, unknown> = { unitId, supplierId, accessKey, noteNumber, observation: obs };
    if (kind === 'CYLINDER') {
      if (!unitId || !(cc > 0) || !(cTotal > 0)) { setErr('Informe unidade, nº de botijões e valor total.'); return; }
      Object.assign(body, { kind: 'CYLINDER', cylinderCount: cc, cylinderKg: ck, cylindersReturned: cylReturned ? parseInt(cylReturned, 10) : undefined, totalValue: cTotal });
    } else {
      if (!unitId || !(q > 0) || !(price > 0)) { setErr('Informe unidade, quantidade (kg) e valor por kg.'); return; }
      Object.assign(body, { quantityKg: q, pricePerKg: price });
    }
    setBusy(true);
    try {
      const res = await fetch('/api/gas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      const v = data.variationPct;
      setOk(`Registrado: ${kg(data.pricePerKg)}.${v != null ? ` Variação ${v > 0 ? '+' : ''}${v}% vs anterior.` : ''}${data.alerted ? ' ⚠ Acima do limite — supervisão avisada.' : ''}`);
      setAccessKey(''); setNoteNumber(''); setQty(''); setUnitPrice(''); setObs(''); setSupplierId(''); setCylCount(''); setCylReturned(''); setCylTotal('');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {units.length > 1 && (
        <Select label="Unidade" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
      )}
      <div>
        <Label htmlFor="k"><ScanLine className="mr-1 inline h-4 w-4" /> Chave da nota (QR/código de barras)</Label>
        <div className="flex gap-2">
          <Input id="k" inputMode="numeric" value={accessKey} onChange={(e) => onKey(e.target.value)} placeholder="cole, digite ou escaneie" className="flex-1" />
          <QrScanner onResult={(chave) => onKey(chave)} />
        </div>
        {noteNumber && <p className="mt-1 text-xs text-ink-500">Nota nº {noteNumber}</p>}
      </div>
      <Select
        label="Fornecedor"
        value={supplierId}
        onValueChange={setSupplierId}
        options={[{ value: '', label: '— sem fornecedor —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
        hint={suppliers.length === 0 ? 'Nenhum fornecedor cadastrado. Peça ao Admin/Supervisor para cadastrar em Configurações → Fornecedores.' : undefined}
      />
      {/* Forma de recebimento */}
      <div>
        <Label>Forma de recebimento</Label>
        <div className="flex gap-1">
          <button type="button" onClick={() => setKind('BULK')} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${kind === 'BULK' ? 'bg-brand text-on-brand' : ''}`}>Granel (kg)</button>
          <button type="button" onClick={() => setKind('CYLINDER')} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${kind === 'CYLINDER' ? 'bg-brand text-on-brand' : ''}`}>Botijão (P45)</button>
        </div>
      </div>

      {kind === 'BULK' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Quantidade (kg)</Label><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="ex: 45" /></div>
            <div><Label>Valor por kg (R$)</Label><Input inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0,0000" /></div>
          </div>
          {total > 0 && (
            <div className="rounded-lg border-2 border-brand/40 bg-brand/5 p-3 text-center">
              <p className="text-xs text-ink-500">Valor total (calculado)</p>
              <p className="sgo-type-24 font-semibold text-ink-900">{formatBRL(total)}</p>
              <p className="text-xs text-ink-500">{kg(price)}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Botijões recebidos</Label><Input inputMode="numeric" value={cylCount} onChange={(e) => setCylCount(e.target.value.replace(/\D/g, ''))} placeholder="ex: 4" /></div>
            <div><Label>Kg por botijão</Label><Input inputMode="numeric" value={cylKg} onChange={(e) => setCylKg(e.target.value.replace(/\D/g, ''))} placeholder="45" /></div>
            <div><Label>Valor total (R$)</Label><Input inputMode="decimal" value={cylTotal} onChange={(e) => setCylTotal(e.target.value)} placeholder="0,00" /></div>
          </div>
          <div><Label>Botijões vazios devolvidos (troca)</Label><Input inputMode="numeric" value={cylReturned} onChange={(e) => setCylReturned(e.target.value.replace(/\D/g, ''))} placeholder="ex: 4" /></div>
          {cKg > 0 && cTotal > 0 && (
            <div className="rounded-lg border-2 border-brand/40 bg-brand/5 p-3 text-center">
              <p className="text-xs text-ink-500">{cc} botijão(ões) × {ck}kg = {cKg}kg · valor total {formatBRL(cTotal)}</p>
              <p className="sgo-type-24 font-semibold text-ink-900">{kg(cPricePerKg)}</p>
            </div>
          )}
        </>
      )}

      <div><Label>Observação (opcional)</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} /></div>

      {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
      {ok && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{ok}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Save className="h-5 w-5" /> Registrar recebimento</Button>
    </div>
  );
}

/* ───────── Dashboard ───────── */
function Dashboard({ d, isAdmin, receipts, contracts, units }: { d: GasDash; isAdmin: boolean; receipts: GasRow[]; contracts: GasContractUI[]; units: Unit[] }) {
  const router = useRouter();
  const [pct, setPct] = useState(String(d.alertPct));
  const [teto, setTeto] = useState(String(d.tetoPrecoKg));
  const [busy, setBusy] = useState(false);
  async function savePct() { setBusy(true); const r = await postAdmin({ entity: 'gas', action: 'setAlertPct', pct: Number(pct) }); setBusy(false); if (r.ok) router.refresh(); else alert(r.error ?? 'Falha'); }
  async function saveTeto() { setBusy(true); const r = await postAdmin({ entity: 'gas', action: 'setMaxPriceKg', teto: Number(teto.replace(',', '.')) }); setBusy(false); if (r.ok) router.refresh(); else alert(r.error ?? 'Falha'); }

  if (d.totalReceipts === 0) return <p className="text-sm text-ink-500">Ainda não há recebimentos de gás no período. Lance o primeiro para ver os comparativos.</p>;

  return (
    <div className="space-y-4">
      <ForaDaFaixa rows={d.foraDaFaixa} teto={d.tetoPrecoKg} />

      {/* Uma fileira só. O "Valor total" veio da fileira duplicada que existia
          acima — era o único número dela que não se repetia aqui. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Cell label="Recebimentos" value={String(d.totalReceipts)} />
        <Cell label="Volume comprado" value={`${d.totalKg.toLocaleString('pt-BR')} kg`} />
        <Cell label="Valor total" value={formatBRL(d.totalValue)} className="col-span-2 sm:col-span-1" />
        <Cell label="Preço médio/kg" value={kg(d.avgPrice)} />
        <Cell label="Último preço/kg" value={d.lastPrice != null ? kg(d.lastPrice) : '—'} />
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2">
          <div><label className="text-xs text-ink-500">Alertar acima de (%)</label><Input inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} className="h-9 w-24 text-sm" /></div>
          <Button size="sm" variant="outline" disabled={busy} onClick={savePct}>Salvar limite</Button>
          <div><label className="text-xs text-ink-500">Recusar preço acima de (R$/kg)</label><Input inputMode="decimal" value={teto} onChange={(e) => setTeto(e.target.value)} className="h-9 w-28 text-sm" /></div>
          <Button size="sm" variant="outline" disabled={busy} onClick={saveTeto}>Salvar teto</Button>
        </div>
      )}

      <PriceEvolutionSection receipts={receipts} contracts={contracts} alertPct={d.alertPct} tetoPrecoKg={d.tetoPrecoKg} />

      <Compare title="Por unidade" rows={d.byUnit} />
      <Compare title="Por fornecedor" rows={d.bySupplier} />

      <div>
        <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">Tendência mensal (preço médio/kg)</h2>
        <MonthlyBars points={d.monthly} />
      </div>

      <VariacaoPorUnidadeCard units={units} />
    </div>
  );
}

/**
 * Filtro de VARIAÇÃO por unidade e período, com saída em PDF e Excel.
 *
 * Não calcula nada aqui: monta a URL do relatório (`/modulos/gas/relatorio`),
 * que já recalcula a variação da série inteira e já sabe exportar. Duas telas
 * somando a mesma variação por conta própria é como uma delas acaba errada.
 * O PDF é a própria folha do relatório abrindo no diálogo de impressão
 * (`?imprimir=1`), para a impressão sair igual ao que a tela mostra.
 */
function VariacaoPorUnidadeCard({ units }: { units: Unit[] }) {
  const [unitId, setUnitId] = useState('');
  const [preset, setPreset] = useState<PresetDePeriodo>('3m');
  const [de, setDe] = useState<string | null>(null);
  const [ate, setAte] = useState<string | null>(null);

  const datas = preset === 'custom' ? (de && ate ? { start: de, end: ate } : null) : datasDoPreset(preset);
  const qs = datas ? new URLSearchParams({ start: datas.start, end: datas.end, ...(unitId ? { unit: unitId } : {}) }).toString() : null;

  return (
    <div className="rounded-lg border p-3">
      <p className="mb-1 flex items-center gap-1.5 sgo-type-11 font-semibold text-ink-900"><TrendingUp className="h-4 w-4 text-brand" /> Variação por unidade e período</p>
      <p className="mb-2 text-xs text-ink-500">Escolha a unidade e o período e gere o relatório de variação do preço/kg — na tela, em PDF ou em Excel.</p>
      <div className="flex flex-wrap items-end gap-2">
        {units.length > 1 && (
          <div className="w-52">
            <Select
              label="Unidade" size="sm" value={unitId} onValueChange={setUnitId}
              options={[{ value: '', label: 'Todas as unidades' }, ...units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]}
            />
          </div>
        )}
        <div className="w-44">
          <Select
            label="Período" size="sm" value={preset} onValueChange={(v) => setPreset(v as PresetDePeriodo)}
            options={PRESETS_DE_PERIODO.map((p) => ({ value: p.valor, label: p.rotulo }))}
          />
        </div>
        {preset === 'custom' && (
          <>
            <div className="w-40"><DatePicker label="De" size="sm" value={de} onValueChange={setDe} /></div>
            <div className="w-40"><DatePicker label="Até" size="sm" value={ate} onValueChange={setAte} min={de ?? undefined} /></div>
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={qs ? `/modulos/gas/relatorio?${qs}` : undefined}
          aria-disabled={!qs}
          className={`inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand ${qs ? 'hover:bg-brand-hover' : 'pointer-events-none opacity-50'}`}
        >
          <TrendingUp className="h-4 w-4" /> Ver relatório
        </a>
        <a
          href={qs ? `/modulos/gas/relatorio?${qs}&imprimir=1` : undefined}
          target="_blank" rel="noreferrer"
          aria-disabled={!qs}
          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold ${qs ? 'hover:border-brand' : 'pointer-events-none opacity-50'}`}
        >
          <FileText className="h-4 w-4 text-brand" /> PDF
        </a>
        <a
          href={qs ? `/api/gas/export?${qs}` : undefined}
          aria-disabled={!qs}
          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold ${qs ? 'hover:border-brand' : 'pointer-events-none opacity-50'}`}
        >
          <Download className="h-4 w-4 text-brand" /> Excel
        </a>
      </div>
    </div>
  );
}

/* ─── Gráfico de evolução de preço/kg ─── */

const PERIOD_OPTS = [
  { v: '3m', l: '3 meses' },
  { v: '6m', l: '6 meses' },
  { v: '12m', l: '12 meses' },
  { v: 'all', l: 'Tudo' },
] as const;
type PeriodKey = typeof PERIOD_OPTS[number]['v'];

function cutoffDate(period: PeriodKey): string | null {
  if (period === 'all') return null;
  const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * Seção de evolução do preço/kg por unidade.
 *
 * Usa os recebimentos que já vêm para o cliente (até 300 entradas) e os
 * contratos para sobrepor o preço acordado como linha de referência. Não faz
 * chamada adicional ao servidor.
 *
 * Notas com preço acima do teto ficam marcadas com ⚠ mas NÃO escalam o eixo Y.
 */
function PriceEvolutionSection({ receipts, contracts, alertPct, tetoPrecoKg }: {
  receipts: GasRow[];
  contracts: GasContractUI[];
  alertPct: number;
  tetoPrecoKg: number;
}) {
  const [selUnit, setSelUnit] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('12m');

  const unitNames = useMemo(() => [...new Set(receipts.map((r) => r.unitId))].map((uid) => {
    const r = receipts.find((x) => x.unitId === uid);
    return { id: uid, name: r?.unit ?? uid };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [receipts]);

  const cutoff = cutoffDate(period);
  const filtered = useMemo(() => receipts.filter((r) =>
    (!selUnit || r.unitId === selUnit) && (!cutoff || r.date >= cutoff),
  ), [receipts, selUnit, cutoff]);

  const byUnit = useMemo(() => {
    const m = new Map<string, { name: string; rows: GasRow[] }>();
    for (const r of filtered) {
      const cur = m.get(r.unitId) ?? { name: r.unit, rows: [] };
      cur.rows.push(r);
      m.set(r.unitId, cur);
    }
    return [...m.entries()].map(([uid, v]) => ({ unitId: uid, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [filtered]);

  if (receipts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="sgo-type-11 font-semibold text-ink-900">Evolução do preço/kg</h2>
        <div className="flex flex-wrap gap-1.5">
          {unitNames.length > 1 && (
            <select
              value={selUnit}
              onChange={(e) => setSelUnit(e.target.value)}
              className="h-7 rounded-md border bg-surface px-2 text-xs font-medium text-ink-900"
              aria-label="Filtrar por unidade"
            >
              <option value="">Todas as unidades</option>
              {unitNames.map((u) => <option key={u.id} value={u.id}>{shortUnitName(u.name)}</option>)}
            </select>
          )}
          <div className="flex overflow-hidden rounded-md border">
            {PERIOD_OPTS.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setPeriod(o.v)}
                className={`px-2 py-1 text-xs font-medium ${period === o.v ? 'bg-brand text-on-brand' : 'bg-surface text-ink-500'}`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      </div>
      {byUnit.length === 0 && <p className="text-sm text-ink-500">Nenhum recebimento no período.</p>}
      {byUnit.map((u) => {
        const unitContracts = contracts.filter((c) => c.unitId === u.unitId && c.active);
        return (
          <UnitPriceChart
            key={u.unitId}
            unitName={u.name}
            rows={u.rows}
            contracts={unitContracts}
            alertPct={alertPct}
            tetoPrecoKg={tetoPrecoKg}
            showUnitTitle={byUnit.length > 1}
          />
        );
      })}
    </div>
  );
}

interface ChartPt {
  date: string; price: number; supplier: string; kg: number; total: number;
  alerted: boolean; isOutlier: boolean; variationPct: number | null;
}

/** Gráfico de linha SVG para o preço/kg de uma unidade ao longo do tempo. */
function UnitPriceChart({ unitName, rows, contracts, alertPct, tetoPrecoKg, showUnitTitle }: {
  unitName: string; rows: GasRow[]; contracts: GasContractUI[];
  alertPct: number; tetoPrecoKg: number; showUnitTitle: boolean;
}) {
  const [hovered, setHovered] = useState<ChartPt | null>(null);

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  [rows]);

  const points: ChartPt[] = useMemo(() => sorted.map((r) => ({
    date: r.date, price: r.price, supplier: r.supplier, kg: r.qty, total: r.total,
    alerted: r.alerted, isOutlier: r.price > tetoPrecoKg, variationPct: r.variation,
  })), [sorted, tetoPrecoKg]);

  const validPoints = points.filter((p) => !p.isOutlier);
  if (validPoints.length === 0) return null;

  // Contratos que tocam o período dos recebimentos
  const firstDate = sorted[0]?.date ?? '';
  const lastDate = sorted[sorted.length - 1]?.date ?? '';
  const activeContracts = contracts.filter((c) => c.endDate >= firstDate && c.startDate <= lastDate);

  const allPrices = validPoints.map((p) => p.price);
  const refPrices = activeContracts.map((c) => c.pricePerKg);
  const allForScale = [...allPrices, ...refPrices].filter((p) => p > 0);
  if (allForScale.length === 0) return null;

  const minP = Math.min(...allForScale);
  const maxP = Math.max(...allForScale);
  /* Margem de 3% para os pontos não colarem nas bordas. */
  const amp = maxP - minP || maxP * 0.05;
  const lo = minP - amp * 0.12;
  const hi = maxP + amp * 0.12;

  const VW = 480; const VH = 200;
  const PAD = { t: 24, r: 16, b: 36, l: 58 };
  const cW = VW - PAD.l - PAD.r;
  const cH = VH - PAD.t - PAD.b;

  const n = sorted.length;
  const xOf = (i: number) => PAD.l + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yOf = (p: number) => PAD.t + cH - ((p - lo) / (hi - lo)) * cH;

  /* Y axis: 4 labels */
  const yStep = (hi - lo) / 4;
  const yLabels = [0, 1, 2, 3, 4].map((i) => lo + i * yStep);

  /* X axis: show at most 6 date labels */
  const step = Math.max(1, Math.ceil(n / 6));
  const xLabels: { i: number; date: string }[] = sorted.map((r, i) => ({ i, date: r.date })).filter((_, i) => i % step === 0 || i === n - 1);

  /* Polyline for valid points */
  const lineSegs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (points[i].isOutlier) continue;
    const x = xOf(i); const y = yOf(points[i].price);
    lineSegs.push(`${i === 0 || points[i - 1]?.isOutlier ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const linePath = lineSegs.join(' ');

  function ptColor(p: ChartPt): string {
    if (p.isOutlier) return 'var(--sgo-ink-400)';
    // Contratos vigentes no dia do recebimento
    const dayContracts = activeContracts.filter((c) => p.date >= c.startDate && p.date <= c.endDate);
    const contractPrice = dayContracts.length ? Math.min(...dayContracts.map((c) => c.pricePerKg)) : null;
    if (contractPrice !== null && p.price > contractPrice * (1 + alertPct / 100)) return 'var(--sgo-danger)';
    if (contractPrice !== null && p.price > contractPrice) return 'var(--sgo-warning)';
    return 'var(--sgo-brand)';
  }

  return (
    <div className="rounded-lg border bg-surface p-3">
      {showUnitTitle && <p className="mb-1.5 text-sm font-semibold text-ink-900">{shortUnitName(unitName)}</p>}
      <div className="relative">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full overflow-visible" style={{ height: 180 }}>
          {/* Y axis labels + grid lines */}
          {yLabels.map((p, i) => (
            <g key={i}>
              <line x1={PAD.l} y1={yOf(p)} x2={VW - PAD.r} y2={yOf(p)} stroke="var(--sgo-ink-200)" strokeWidth={0.5} />
              <text x={PAD.l - 3} y={yOf(p) + 3} textAnchor="end" fontSize={9} fill="var(--sgo-ink-500)">
                {p.toFixed(2).replace('.', ',')}
              </text>
            </g>
          ))}
          {/* X axis labels */}
          {xLabels.map(({ i, date }) => {
            const [y, m, d] = date.split('-');
            return (
              <text key={i} x={xOf(i)} y={VH - PAD.b + 12} textAnchor="middle" fontSize={9} fill="var(--sgo-ink-500)">
                {d}/{m}/{y?.slice(2)}
              </text>
            );
          })}
          {/* Contract reference lines */}
          {activeContracts.map((c, ci) => {
            const y = yOf(c.pricePerKg);
            /* clip to chart area */
            if (y < PAD.t - 4 || y > PAD.t + cH + 4) return null;
            /* x range of the contract within the chart */
            const x1 = PAD.l;
            const x2 = VW - PAD.r;
            return (
              <g key={ci}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--sgo-brand)" strokeWidth={1.5} strokeDasharray="5,3" opacity={0.55} />
                <text x={x2 - 2} y={y - 3} textAnchor="end" fontSize={8} fill="var(--sgo-brand)" opacity={0.8}>
                  {c.supplierName} R$ {c.pricePerKg.toFixed(4).replace('.', ',')}
                </text>
              </g>
            );
          })}
          {/* Main line */}
          {linePath && <path d={linePath} fill="none" stroke="var(--sgo-brand)" strokeWidth={2} strokeLinejoin="round" />}
          {/* Points */}
          {sorted.map((r, i) => {
            const p = points[i];
            const cx = xOf(i); const cy = p.isOutlier ? PAD.t + 4 : yOf(p.price);
            return (
              <g key={r.id}>
                <circle
                  cx={cx} cy={cy} r={5}
                  fill={ptColor(p)}
                  stroke="white" strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(p)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setHovered((h) => h?.date === p.date && h.supplier === p.supplier ? null : p)}
                />
                {p.isOutlier && (
                  <text x={cx} y={cy + 14} textAnchor="middle" fontSize={8} fill="var(--sgo-ink-400)">⚠</text>
                )}
              </g>
            );
          })}
        </svg>
        {/* Legenda */}
        <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-ink-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-5 rounded-full bg-brand opacity-60" style={{ borderTop: '2px dashed var(--sgo-brand)' }} /> Preço contratado</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" /> Dentro do contrato</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-warning" /> Acima do contratado</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-danger" /> Acima do limite ({alertPct}%)</span>
        </div>
      </div>
      {/* Tooltip — detalhe do ponto selecionado */}
      {hovered && (
        <div className="mt-2 rounded-lg border border-brand/20 bg-brand/5 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
            <span className="font-semibold text-ink-900">{br(hovered.date)}</span>
            <span className="font-bold text-brand">{kg(hovered.price)}</span>
            {hovered.variationPct !== null && (
              <span className={hovered.variationPct > 0 ? 'font-semibold text-danger' : 'font-semibold text-success'}>
                {hovered.variationPct > 0 ? '+' : ''}{hovered.variationPct}% vs anterior
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-ink-500">
            <span>{hovered.supplier}</span>
            <span>{hovered.kg.toLocaleString('pt-BR')} kg</span>
            <span>{formatBRL(hovered.total)}</span>
            {hovered.isOutlier && <span className="font-semibold text-warning">⚠ Preço fora da faixa — corrigir no Histórico</span>}
          </div>
          {/* Comparação com os contratos ativos naquele dia */}
          {activeContracts
            .filter((c) => hovered.date >= c.startDate && hovered.date <= c.endDate)
            .map((c) => {
              const diff = hovered.price - c.pricePerKg;
              const pct = Math.round((diff / c.pricePerKg) * 100 * 10) / 10;
              return (
                <div key={c.id} className="mt-0.5 text-ink-500">
                  Contrato {c.supplierName}: {kg(c.pricePerKg)}
                  {' '}
                  <span className={diff > 0 ? 'font-semibold text-danger' : 'font-semibold text-success'}>
                    ({diff > 0 ? '+' : ''}{pct}% vs contratado)
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, className }: { label: string; value: string; className?: string }) {
  return <StatCard label={label} value={value} className={className} />;
}

/**
 * Notas com preço/kg fora de qualquer faixa real.
 *
 * Elas não eram só um número feio num cartão: como todo gráfico de gás é
 * escalado pela série, UMA nota assim achatava as colunas de todos os meses e
 * as barras de todas as unidades. Antes, a tela só ficava estranha e não dizia
 * por quê. Agora a nota sai NOMEADA — unidade, data e preço — porque o conserto
 * é abrir esse lançamento no Histórico e corrigir kg/valor.
 */
function ForaDaFaixa({ rows, teto }: { rows: GasOutlierRow[]; teto: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-danger/40 bg-danger/10 p-3">
      <p className="text-sm font-semibold text-danger">
        {rows.length === 1 ? '1 lançamento com preço fora da faixa' : `${rows.length} lançamentos com preço fora da faixa`} (acima de {formatBRL(teto)}/kg)
      </p>
      <p className="mt-0.5 text-xs text-ink-700">
        Enquanto estiverem assim, eles distorcem o preço médio e achatam os gráficos abaixo. Quase sempre é o valor TOTAL da nota
        (ou o preço do botijão inteiro) lançado no lugar do preço por quilo. Corrija kg/valor na aba Histórico.
      </p>
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="text-xs tabular-nums text-ink-900">
            <b>{kg(r.pricePerKg)}</b> · {r.unitName} · {br(r.date)} · {r.kg.toLocaleString('pt-BR')} kg · {formatBRL(r.total)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Compare({ title, rows }: { title: string; rows: GroupStat[] }) {
  if (rows.length === 0) return null;
  /* Mesma escala das colunas mensais, e pelo mesmo motivo: uma unidade com nota
     fora de faixa zerava a barra de todas as outras. */
  const vals = rows.map((r) => r.avg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return (
    <div>
      <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">{title}</h2>
      <Group>
        {rows.map((r) => (
          <div key={r.key} className="p-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-ink-900">{r.name}</span>
              <span className="font-bold">{kg(r.avg)} <span className="text-xs font-normal text-ink-500">méd</span></span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${alturaDaBarra(r.avg, min, max, 100, 1)}%` }} /></div>
            <p className="mt-1 text-xs text-ink-500">{r.count} compra(s) · <b className="text-brand">{r.kg.toLocaleString('pt-BR')} kg</b> · último {kg(r.last)} · mín {kg(r.min)} · máx {kg(r.max)}</p>
          </div>
        ))}
      </Group>
    </div>
  );
}

/**
 * Altura de uma coluna/barra de PREÇO, numa escala que começa perto do dado.
 *
 * As barras iam de zero ao máximo da série, e isso falha nos dois extremos:
 *
 *  - Com dado limpo, o gás varia de R$ 6,46 a R$ 7,02. Partindo do zero, a
 *    menor coluna já tem 92% da altura da maior — todas parecem iguais, e o
 *    gráfico que existe para mostrar a variação é justamente o que a esconde.
 *  - Com UMA nota fora de escala (o caso relatado), o máximo dispara e todas as
 *    outras colunas caem no piso. Era esse o "as colunas não estão subindo".
 *
 * A escala vai do menor ao maior da série, com uma FOLGA embaixo (em múltiplos
 * da própria amplitude) para o menor não sumir. `min === max` (um mês só, ou
 * preço estável) cai em meia altura, que é honesto: não há variação a mostrar.
 *
 * A folga é o que decide o quanto a diferença é ampliada, e os dois gráficos
 * querem coisas diferentes:
 *
 *  - **Tendência mensal** (`folga` 0,2): é uma série no tempo, lida pela forma.
 *    Ampliar é o serviço — sem isso não se vê que o preço subiu.
 *  - **Comparação entre unidades** (`folga` 1): aqui o comprimento lê-se como
 *    grandeza. Com folga 1 a menor barra fica em EXATAMENTE metade da maior,
 *    qualquer que seja a diferença: a ordem e o "esta está mais cara" aparecem,
 *    sem que 2 centavos virem o dobro. O número exato está escrito ao lado.
 */
export function alturaDaBarra(valor: number, min: number, max: number, alturaMax = 90, folga = 0.2): number {
  if (!(max > min)) return Math.round(alturaMax * 0.5);
  const base = min - (max - min) * folga;
  const frac = (valor - base) / (max - base);
  return Math.max(4, Math.round(frac * alturaMax));
}

function MonthlyBars({ points }: { points: MonthPoint[] }) {
  if (points.length === 0) return <p className="text-sm text-ink-500">Sem dados.</p>;
  const vals = points.map((p) => p.avg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return (
    <div className="flex items-end gap-2 rounded-lg border bg-surface p-3" style={{ height: 140 }}>
      {points.map((p) => (
        <div key={p.month} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] font-semibold text-ink-900">{p.avg.toFixed(2).replace('.', ',')}</span>
          <div className="w-full rounded-t bg-brand" style={{ height: `${alturaDaBarra(p.avg, min, max)}px` }} />
          <span className="text-[10px] text-ink-500">{mlabel(p.month)}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────── Histórico ───────── */
function History({ rows, isAdmin, canEditDate = false }: { rows: GasRow[]; isAdmin: boolean; canEditDate?: boolean }) {
  const router = useRouter();
  // Filtros do histórico (16/07): busca + unidade + fornecedor sobre todos os lançamentos carregados
  const [q, setQ] = useState('');
  const [unit, setUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  // Correção de lançamento (kg/valor) por erro do gerente — NÃO interfere na meta (16/07)
  const [editId, setEditId] = useState<string | null>(null);
  const [dateEditId, setDateEditId] = useState<string | null>(null);
  const [eKg, setEKg] = useState('');
  const [eTotal, setETotal] = useState('');
  const [eBusy, setEBusy] = useState(false);
  const unitNames = useMemo(() => [...new Set(rows.map((r) => r.unit))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);
  const supplierNames = useMemo(() => [...new Set(rows.map((r) => r.supplier))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);
  const shown = useMemo(() => rows.filter((r) =>
    (!unit || r.unit === unit) && (!supplier || r.supplier === supplier) &&
    (!q.trim() || r.date.includes(q.trim()) || r.by.toLowerCase().includes(q.trim().toLowerCase()) || String(r.qty).includes(q.trim()) || String(r.total).includes(q.trim())),
  ), [rows, q, unit, supplier]);
  if (rows.length === 0) return <p className="text-sm text-ink-500">Nenhum recebimento registrado.</p>;

  function startEdit(r: GasRow) { setEditId(r.id); setEKg(String(r.qty).replace('.', ',')); setETotal(String(r.total).replace('.', ',')); }

  /** Mesma chamada do DeleteOpButton, agora como item de menu (auditado). */
  async function removeRow(r: GasRow) {
    if (!confirm(`Excluir o recebimento de gás (${r.date}, ${r.unit})? Esta ação é registrada na Auditoria e não pode ser desfeita.`)) return;
    const res = await fetch('/api/admin/ops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'gas', action: 'delete', id: r.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error ?? 'Falha ao excluir'); return; }
    router.refresh();
  }
  async function saveEdit(r: GasRow) {
    const kgN = parseFloat(eKg.replace(',', '.'));
    const totN = parseFloat(eTotal.replace(',', '.'));
    if (!(kgN > 0) || !(totN > 0)) { alert('Informe kg e valor válidos.'); return; }
    setEBusy(true);
    try {
      const res = await fetch('/api/gas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit', id: r.id, quantityKg: kgN, totalValue: totN }) });
      if (res.ok) { setEditId(null); router.refresh(); } else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setEBusy(false); }
  }
  return (
    <div className="space-y-2">
      <FilterBar
        collapsible
        active={(q.trim() ? 1 : 0) + (unit ? 1 : 0) + (supplier ? 1 : 0)}
        onClear={q.trim() || unit || supplier ? () => { setQ(''); setUnit(''); setSupplier(''); } : undefined}
        search={<SearchField aria-label="Buscar recebimentos" inputSize="sm" value={q} onValueChange={setQ} placeholder="Buscar data, quem lançou, kg, valor…" />}
        summary={
          <>
            {unit && <FilterChip>{shortUnitName(unit)}</FilterChip>}
            {supplier && <FilterChip>{supplier}</FilterChip>}
          </>
        }
        result={<>{shown.length} de {rows.length}</>}
      >
        {unitNames.length > 1 && (
          <FilterSelect
            label="Unidade" value={unit} onValueChange={setUnit}
            options={[{ value: '', label: 'Todas as unidades' }, ...unitNames.map((u) => ({ value: u, label: shortUnitName(u) }))]}
          />
        )}
        <FilterSelect
          label="Fornecedor" value={supplier} onValueChange={setSupplier}
          options={[{ value: '', label: 'Todos os fornecedores' }, ...supplierNames.map((sp2) => ({ value: sp2, label: sp2 }))]}
        />
      </FilterBar>
      {shown.map((r) => {
        const tone: StatusTone = r.variation == null ? 'neutral' : r.variation > 0 ? (r.alerted ? 'critical' : 'medium') : 'success';
        return (
          <div key={r.id} className="rounded-lg border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink-900">{kg(r.price)} <span className="text-xs font-normal text-ink-500">· {r.unit}</span></p>
                <p className="text-xs text-ink-500">{r.date} · {r.supplier} · {r.qty.toLocaleString('pt-BR')} kg · {formatBRL(r.total)}{r.by ? ` · ${r.by}` : ''}</p>
              </div>
              {r.variation != null && (
                <StatusBadge tone={tone}>{r.variation > 0 ? <TrendingUp className="mr-0.5 inline h-3 w-3" /> : <TrendingDown className="mr-0.5 inline h-3 w-3" />}{r.variation > 0 ? '+' : ''}{r.variation}%</StatusBadge>
              )}
              {/* Mesmo menu das notas. Antes eram três botões soltos por linha,
                  dois deles com o MESMO lápis — e, com a lista de notas já
                  usando "···", o módulo ficava metade de um jeito e metade de
                  outro na mesma tela. */}
              {(isAdmin || canEditDate) && (
                <ActionMenu
                  label={`Ações do recebimento de ${r.date}`}
                  items={[
                    ...((isAdmin || canEditDate) ? [{ label: 'Corrigir kg e valor', icon: <Pencil />, onSelect: () => startEdit(r) }] : []),
                    ...(canEditDate ? [{ label: 'Corrigir data', icon: <CalendarClock />, onSelect: () => setDateEditId((id) => (id === r.id ? null : r.id)) }] : []),
                    ...(isAdmin ? [{ label: 'Excluir recebimento', icon: <Trash2 />, destructive: true, onSelect: () => void removeRow(r) }] : []),
                  ]}
                />
              )}
            </div>
            {r.alerted && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-danger"><AlertTriangle className="h-3.5 w-3.5" /> Alta acima do limite</p>}
            {r.dateEdited && <p className="mt-1 text-xs font-semibold text-danger">Data corrigida{r.dateEditedByName ? ` por ${r.dateEditedByName}` : ''} — desconta na meta</p>}
            {editId === r.id ? (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2">
                <div><span className="block text-[11px] text-ink-500">Quantidade (kg)</span><Input value={eKg} onChange={(e) => setEKg(e.target.value)} inputMode="decimal" className="h-9 w-28 text-sm" /></div>
                <div><span className="block text-[11px] text-ink-500">Valor total (R$)</span><Input value={eTotal} onChange={(e) => setETotal(e.target.value)} inputMode="decimal" className="h-9 w-28 text-sm" /></div>
                <Button size="sm" disabled={eBusy} onClick={() => void saveEdit(r)}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
                <span className="w-full text-[11px] text-ink-500">Correção de erro de lançamento — recalcula o preço/kg. Não interfere na meta do gerente.</span>
              </div>
            ) : null}
            {dateEditId === r.id && <InlineDateEdit module="gas" id={r.id} current={r.date} onClose={() => setDateEditId(null)} />}
          </div>
        );
      })}
    </div>
  );
}
