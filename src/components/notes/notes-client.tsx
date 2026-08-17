'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Save, AlertTriangle, Pencil, X, Trash2, Undo2, FileSpreadsheet, Printer, CalendarClock, Plus } from 'lucide-react';
import { InlineDateEdit } from '@/components/shared/inline-date-edit';
import { Button } from '@/components/ui/button';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ds/action-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { FilterBar, FilterSelect, FilterChip } from '@/components/ui/filter-bar';
import { Select as DsSelect } from '@/components/ui/ds/select';
import { SearchField } from '@/components/ui/ds/field';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';
import { QrScanner } from '@/components/notes/qr-scanner';
import { formatBRL } from '@/lib/utils';
import { parseChaveAcesso } from '@/lib/notes/chave';
import { GasImportModal } from '@/components/notes/gas-import-modal';
import { Group } from '@/components/ui/ds/group';
import { Sheet } from '@/components/ui/ds/sheet';
import { NotesTabs } from '@/components/notes/notes-tabs';

interface Unit { id: string; name: string }
interface Supplier { id: string; name: string; cnpj: string | null; isGas?: boolean }

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

export function NotesClient({ units, notes, suppliers = [], canManage = false, canEditDate = false, sinceDays = 60, aba = 'lista' }: {
  units: Unit[]; notes: NoteDTO[]; suppliers?: Supplier[]; canManage?: boolean; canEditDate?: boolean; sinceDays?: number;
  /** Aba ativa, vinda da URL (`?aba=`). Deixou de ser estado quando o gás ganhou rota própria. */
  aba?: 'lista' | 'venc';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [novaNota, setNovaNota] = useState(false);

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

  /**
   * Cinco abas viraram três, e agora as três são NAVEGAÇÃO.
   *
   * "Registrar nota" saiu porque era um FORMULÁRIO ocupando uma aba: quem
   * entrava para consultar levava o formulário na cara. Virou o botão "Nova
   * nota", que abre uma folha por cima e sai quando termina.
   *
   * "Análise" saiu porque era a MESMA lista de "Notas" — no código era este
   * mesmo componente, mudando só um parâmetro de detalhe. O que ela tinha de
   * próprio (totais, export e os campos extras por linha) continua aqui
   * dentro, para o mesmo público de antes.
   *
   * "Análise de gás" ganhou rota própria (`/modulos/notas/gas`), então some o
   * segundo trilho de abas que existia empilhado sob o primeiro.
   */
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <NotesTabs value={aba} sinceDays={sinceDays} />
        <Button size="sm" className="ml-auto" onClick={() => setNovaNota(true)}>
          <Plus className="h-4 w-4" /> Nova nota
        </Button>
        {canManage && (
          <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-brand px-3 py-1.5 text-sm font-semibold text-brand transition-colors hover:bg-brand/10">
            <FileSpreadsheet className="h-4 w-4" /> Importar em lote (XLSX)
          </button>
        )}
      </div>
      {showImport && <GasImportModal onClose={() => setShowImport(false)} />}

      <Sheet
        open={novaNota}
        onClose={() => setNovaNota(false)}
        title="Nova nota"
        description="Leia o QR/DANFE ou preencha à mão. A nota entra na lista assim que salvar."
      >
        <NewNote units={units} suppliers={suppliers} onDone={() => { setNovaNota(false); router.refresh(); }} />
      </Sheet>

      {aba === 'venc' && <DueTracking units={units} />}
      {aba === 'lista' && (
        <FilterableNotes
          notes={notes} units={units} sinceDays={sinceDays}
          canManage={canManage} canEditDate={canEditDate} busy={busy} onStatus={status}
        />
      )}
    </div>
  );
}

/**
 * Lista de notas por DATA DE LANÇAMENTO (mais nova → mais antiga) com filtros
 * completos (16/07).
 *
 * Era usada duas vezes — "Notas" e "Análise" — mudando só o `full`. Agora é uma
 * lista só, e o `full` virou um interruptor aqui dentro: uma caixa de seleção
 * custa menos que uma aba inteira para a mesma diferença, e o público não muda
 * (o detalhe e os totais seguem restritos a quem gerencia).
 */
function FilterableNotes({ notes, units, sinceDays, canManage, canEditDate, busy, onStatus }: {
  notes: NoteDTO[]; units: Unit[]; sinceDays: number;
  canManage: boolean; canEditDate: boolean; busy: boolean;
  onStatus: (id: string, st: 'PROBLEM' | 'RETURNED') => void;
}) {
  const router = useRouter();
  const [detalhado, setDetalhado] = useState(false);
  const full = canManage && detalhado;
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
  /* Conta só o que a pessoa escolheu ativamente. O período NÃO entra: ele
     sempre tem um valor (60 dias por padrão), então contá-lo faria a barra
     nascer marcando "1 filtro" sem ninguém ter filtrado nada. */
  const ativos = (q.trim() ? 1 : 0) + (supplier !== 'ALL' ? 1 : 0) + (unit !== 'ALL' ? 1 : 0) + (st !== 'ALL' ? 1 : 0);
  const limpar = () => { setQ(''); setSupplier('ALL'); setUnit('ALL'); setStatus('ALL'); };

  const total = filtered.reduce((s, n) => s + n.value, 0);
  const exportHref = `/api/notes/export?dias=${sinceDays}${unit !== 'ALL' ? `&unidade=${encodeURIComponent(unit)}` : ''}${supplier !== 'ALL' ? `&fornecedor=${encodeURIComponent(supplier)}` : ''}${st !== 'ALL' ? `&status=${st}` : ''}`;

  return (
    <div className="space-y-3">
      <FilterBar
        collapsible
        active={ativos}
        onClear={ativos ? limpar : undefined}
        className="print:hidden"
        search={<SearchField aria-label="Buscar notas" inputSize="sm" value={q} onValueChange={setQ} placeholder="Buscar fornecedor, nº, CNPJ, produto…" />}
        summary={
          <>
            <FilterChip>{PERIODS.find((p) => p.dias === sinceDays)?.label ?? `${sinceDays} dias`}</FilterChip>
            {supplier !== 'ALL' && <FilterChip>{supplier}</FilterChip>}
            {unit !== 'ALL' && <FilterChip>{shortUnitName(unit)}</FilterChip>}
            {st !== 'ALL' && <FilterChip>{ST[st].label}</FilterChip>}
          </>
        }
        result={<>{filtered.length} de {notes.length}</>}
      >
        <FilterSelect
          label="Fornecedor" value={supplier} onValueChange={setSupplier}
          options={[{ value: 'ALL', label: 'Todos os fornecedores' }, ...supplierNames.map((s) => ({ value: s, label: s }))]}
        />
        {units.length > 1 && (
          <FilterSelect
            label="Unidade" value={unit} onValueChange={setUnit}
            options={[{ value: 'ALL', label: 'Todas as unidades' }, ...units.map((u) => ({ value: u.name, label: shortUnitName(u.name) }))]}
          />
        )}
        <FilterSelect
          label="Status" value={st} onValueChange={(v) => setStatus(v as typeof st)}
          options={[
            { value: 'ALL', label: 'Todos os status' },
            { value: 'RECEIVED', label: 'Recebida' },
            { value: 'PROBLEM', label: 'Com problema' },
            { value: 'RETURNED', label: 'Devolvida' },
            { value: 'PAID', label: 'Paga (legado)' },
          ]}
        />
        <FilterSelect
          label="Período" value={String(sinceDays)}
          onValueChange={(v) => router.push(`/modulos/notas?dias=${v}`)}
          options={PERIODS.map((p) => ({ value: String(p.dias), label: p.label }))}
        />
      </FilterBar>

      {/* O que era a aba "Análise": totais, export e o detalhe por linha.
          Mesmo público de antes (canManage) — só deixou de custar uma aba. */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="grid flex-1 grid-cols-2 gap-2">
            <div className="rounded-lg border bg-surface p-3 text-center"><p className="text-2xl font-black text-ink-900">{filtered.length}</p><p className="text-xs text-ink-500">notas</p></div>
            <div className="rounded-lg border bg-surface p-3 text-center"><p className="text-xl font-black text-ink-900">{formatBRL(total)}</p><p className="text-xs text-ink-500">valor total</p></div>
          </div>
          <div className="flex flex-col gap-1.5">
            <a href={exportHref} className="inline-flex items-center gap-1.5 rounded-lg border bg-surface px-3 py-1.5 text-xs font-semibold text-brand hover:border-brand"><FileSpreadsheet className="h-3.5 w-3.5 text-brand" /> Excel</a>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border bg-surface px-3 py-1.5 text-xs font-semibold text-brand hover:border-brand"><Printer className="h-3.5 w-3.5 text-brand" /> Imprimir/PDF</button>
          </div>
        </div>
      )}

      {canManage && (
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-700 print:hidden">
          <input
            type="checkbox"
            checked={detalhado}
            onChange={(e) => setDetalhado(e.target.checked)}
            className="sgo-control-icon h-4 w-4 accent-brand"
          />
          Mostrar CNPJ, emissão e produto em cada linha
        </label>
      )}

      {filtered.length === 0 && <p className="text-sm text-ink-500">Nenhuma nota com esses filtros no período.</p>}
      <Group>
        {filtered.map((n) => (
          <NoteCard key={n.id} n={n} canManage={canManage} canEditDate={canEditDate} busy={busy} onStatus={onStatus} full={full} />
        ))}
      </Group>
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

  /**
   * As MESMAS ações de antes, nas mesmas condições — só que guardadas.
   * Nada de permissão muda aqui: `canManage`, `canEditDate` e o status
   * RECEBIDA continuam decidindo o que aparece, exatamente como quando eram
   * cinco botões soltos na linha.
   */
  const acoes: ActionMenuItem[] = [
    /* Ícones DIFERENTES de propósito: os dois primeiros eram um lápis cada, e
       dois lápis iguais em ações diferentes não ajudam a escolher — só enchem
       a lista. Aqui o ícone diz o QUE muda: o conteúdo da nota, ou a data. */
    ...(canManage ? [{ label: 'Ver e editar', icon: <Pencil />, onSelect: () => setEditing(true) }] : []),
    ...(canEditDate ? [{ label: 'Corrigir data', icon: <CalendarClock />, disabled: busy, onSelect: () => setDateEditing((v) => !v) }] : []),
    // Pagamento é controlado no Teknisa — aqui só recebimento/problema/devolução (16/07)
    ...(n.status === 'RECEIVED'
      ? [
          { label: 'Marcar problema', icon: <AlertTriangle />, disabled: busy, onSelect: () => onStatus(n.id, 'PROBLEM') },
          { label: 'Devolver ao fornecedor', icon: <Undo2 />, disabled: busy, onSelect: () => onStatus(n.id, 'RETURNED') },
        ]
      : []),
    ...(canManage ? [{ label: 'Excluir nota', icon: <Trash2 />, destructive: true, disabled: deleting, onSelect: remove }] : []),
  ];

  if (editing) {
    return (
      <div className="rounded-lg border-2 border-brand/40 bg-surface p-3">
        <div className="grid grid-cols-1 gap-2">
          <div><Label className="text-xs">Fornecedor</Label><Input value={f.supplierName} onChange={(e) => set('supplierName', e.target.value)} className="h-9 text-sm" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">CNPJ</Label><Input value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Número</Label><Input value={f.number} onChange={(e) => set('number', e.target.value)} className="h-9 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DatePicker label="Emissão" size="sm" value={f.issueDate || null} onValueChange={(v) => set('issueDate', v ?? '')} />
            <DatePicker label="Vencimento" size="sm" value={f.dueDate || null} onValueChange={(v) => set('dueDate', v ?? '')} min={f.issueDate || undefined} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Valor (R$)</Label><Input inputMode="decimal" value={f.totalValue} onChange={(e) => set('totalValue', e.target.value)} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Produto</Label><Input value={f.productType} onChange={(e) => set('productType', e.target.value)} className="h-9 text-sm" /></div>
          </div>
          <div><Label className="text-xs">Observação</Label><Input value={f.observation} onChange={(e) => set('observation', e.target.value)} className="h-9 text-sm" /></div>
          {err && <p className="text-sm font-medium text-danger">{err}</p>}
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" /> Cancelar</Button>
            <Button size="sm" disabled={saving} onClick={save}><Save className="h-4 w-4" /> Salvar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Cabeçalho da linha: fornecedor, VALOR em coluna própria, situação e o
          menu. O valor saiu do meio da frase cinza — alinhado e tabular, dá
          para varrer a coluna sem ler linha por linha, que é o que se faz numa
          lista de notas. */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold text-ink-900">{n.supplier}</p>
        <p className="shrink-0 font-semibold tabular-nums text-ink-900">{formatBRL(n.value)}</p>
        <StatusBadge tone={ST[n.status].tone}>{ST[n.status].label}</StatusBadge>
        <div className="print:hidden">
          <ActionMenu label={`Ações da nota de ${n.supplier}`} items={acoes} />
        </div>
      </div>
      <p className="text-xs text-ink-500">
        {n.unit}{n.number ? ` · nº ${n.number}` : ''}{n.dueDate ? ` · vence ${fmtBR(n.dueDate)}` : ''}
        {n.requestedAt ? ` · lançada ${new Date(n.requestedAt).toLocaleDateString('pt-BR')}` : ''}
        {n.createdByName ? ` por ${n.createdByName}` : ''}
      </p>
      {full && (
        <p className="mt-0.5 text-xs text-ink-500">
          {n.cnpj ? `CNPJ ${n.cnpj} · ` : ''}{n.issueDate ? `emissão ${fmtBR(n.issueDate)} · ` : ''}{n.productType ? `produto: ${n.productType}` : 'sem tipo de produto'}
        </p>
      )}
      {n.supervisorLaunched && (
        <p className="mt-0.5 text-xs font-semibold text-danger">Lançada pela supervisão (gerente não lançou) — desconta na meta</p>
      )}
      {n.dateEdited && (
        <p className="mt-0.5 text-xs font-semibold text-danger">
          Data corrigida{n.entryDate ? ` p/ ${new Date(n.entryDate).toLocaleDateString('pt-BR')}` : ''}{n.dateEditedByName ? ` por ${n.dateEditedByName}` : ''} — desconta na meta
        </p>
      )}
      {n.observation && <p className="mt-1 text-xs text-ink-500">Obs.: {n.observation}</p>}
      {n.problemNote && <p className="mt-1 text-xs text-danger">{n.status === 'RETURNED' ? 'Devolução' : 'Problema'}: {n.problemNote}</p>}
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
      <p className="rounded-md bg-brand/10 px-3 py-2 text-xs text-ink-500">
        Foco nos boletos <strong>a vencer</strong> — a supervisão e o financeiro são avisados automaticamente dos próximos vencimentos (o pagamento em si é controlado pelo financeiro). Inclui notas comuns e recebimentos de gás.
      </p>
      <FilterBar
        collapsible
        active={activeCount}
        onClear={clear}
        summary={
          <>
            <FilterChip>{`${dias} dias`}</FilterChip>
            <FilterChip>{vencidos === '1' ? 'Incluir vencidos' : 'Só a vencer'}</FilterChip>
            {unitId && <FilterChip>{shortUnitName(units.find((u) => u.id === unitId)?.name ?? unitId)}</FilterChip>}
            {supplier && <FilterChip>{supplier}</FilterChip>}
          </>
        }
        result={<>{rows.length} boleto(s) · {formatBRL(total)}</>}
      >
        {units.length > 1 && (
          <FilterSelect
            label="Unidade"
            value={unitId}
            onValueChange={setUnitId}
            options={[{ value: '', label: 'Todas' }, ...units.map((u) => ({ value: u.id, label: u.name }))]}
          />
        )}
        <FilterSelect
          label="Fornecedor"
          value={supplier}
          onValueChange={setSupplier}
          options={[{ value: '', label: 'Todos' }, ...suppliers.map((s) => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Janela"
          value={dias}
          onValueChange={setDias}
          options={[7, 15, 30, 60, 90].map((d) => ({ value: String(d), label: `${d} dias` }))}
        />
        <FilterSelect
          label="Vencidos"
          value={vencidos}
          onValueChange={setVencidos}
          options={[{ value: '0', label: 'Só a vencer' }, { value: '1', label: 'Incluir vencidos' }]}
        />
      </FilterBar>

      {/* A contagem e o total saíram daqui: agora vivem na própria barra de
          filtro, junto do que os produziu. Repetir logo abaixo era dizer o
          mesmo número duas vezes com duas aparências. */}
      {loading ? (
        <p className="text-sm text-ink-500">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500">Nenhum boleto a vencer nesta janela.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={`${r.kind}-${r.id}`} className={`rounded-lg border p-2.5 ${r.daysToDue <= 3 ? 'border-danger/40 bg-danger/5' : 'bg-surface'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">{r.supplier}{r.kind === 'GAS' ? <span className="ml-1 rounded bg-info-bg px-1 text-[10px] font-bold text-info">GÁS</span> : null}</p>
                <StatusBadge tone={tone(r.daysToDue)}>{dueLabel(r.daysToDue)}</StatusBadge>
              </div>
              <p className="text-xs text-ink-500">{r.unit} · {formatBRL(r.value)}{r.number ? ` · nº ${r.number}` : ''} · vence {fmtBR(r.dueDate)}</p>
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

  const hl = prefilled ? 'border-warning bg-warning/5' : '';
  return (
    <div className="space-y-3">
      {units.length > 1 && (
        <DsSelect
          label="Unidade"
          value={unitId}
          onValueChange={setUnitId}
          options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
        />
      )}
      <div>
        <Label htmlFor="key"><ScanLine className="mr-1 inline h-4 w-4" /> Chave de acesso (44 dígitos — QR/DANFE)</Label>
        <div className="flex gap-2">
          <Input id="key" inputMode="numeric" value={accessKey} onChange={(e) => onKey(e.target.value)} placeholder="cole, digite ou escaneie" className="flex-1" />
          <QrScanner onResult={(chave) => onKey(chave)} />
        </div>
        {prefilled && <p className="mt-1 text-xs text-warning">Campos preenchidos pela chave — confira em amarelo.</p>}
      </div>
      <DsSelect
        label="Fornecedor (da lista de cadastrados)"
        placeholder="Selecione o fornecedor…"
        hint="Fornecedor não está na lista? Peça à Supervisão/Admin para cadastrar em Configurações → Fornecedores."
        value={supplierId}
        onValueChange={(v) => {
          const s = suppliers.find((x) => x.id === v);
          setSupplierId(v);
          setSupplierName(s?.name ?? '');
          setSupplierCnpj(s?.cnpj ?? supplierCnpj);
        }}
        options={suppliers.map((s) => ({ value: s.id, label: s.name, hint: s.isGas ? 'fornecedor de gás' : undefined }))}
      />

      {isGas && (
        <p className="rounded-md bg-brand/10 px-3 py-2 text-xs font-semibold text-ink-900">Fornecedor de gás — preencha os dados do recebimento de gás. Isso alimenta a Análise de gás (dashboard, contratos e variação).</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div><Label>CNPJ</Label><Input className={hl} value={supplierCnpj} onChange={(e) => setSupplierCnpj(e.target.value)} /></div>
        <div><Label>Número</Label><Input className={hl} value={number} onChange={(e) => setNumber(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DatePicker label="Emissão" value={issueDate || null} onValueChange={(v) => setIssueDate(v ?? '')} className={hl} />
        <DatePicker label="Vencimento do boleto" value={dueDate || null} onValueChange={(v) => setDueDate(v ?? '')} min={issueDate || undefined} />
      </div>

      {isGas ? (
        <div className="space-y-2 rounded-lg border-2 border-brand/30 bg-brand/5 p-3">
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
              {gasTotal > 0 && <p className="text-center text-sm font-bold text-ink-900">Valor total: {formatBRL(gasTotal)}</p>}
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Botijões</Label><Input inputMode="numeric" value={cylCount} onChange={(e) => setCylCount(e.target.value.replace(/\D/g, ''))} placeholder="ex: 4" /></div>
                <div><Label>Kg/botijão</Label><Input inputMode="numeric" value={cylKg} onChange={(e) => setCylKg(e.target.value.replace(/\D/g, ''))} placeholder="45" /></div>
                <div><Label>Valor total (R$)</Label><Input inputMode="decimal" value={cylTotal} onChange={(e) => setCylTotal(e.target.value)} placeholder="0,00" /></div>
              </div>
              <div><Label>Botijões vazios devolvidos</Label><Input inputMode="numeric" value={cylReturned} onChange={(e) => setCylReturned(e.target.value.replace(/\D/g, ''))} placeholder="ex: 4" /></div>
              {cKg > 0 && cTotal > 0 && <p className="text-center text-sm font-bold text-ink-900">{cc} × {ck}kg = {cKg}kg · R$ {cPricePerKg.toFixed(4).replace('.', ',')}/kg</p>}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Valor total (R$)</Label><Input inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} placeholder="0,00" /></div>
          <div><Label>Tipo de produto</Label><Input value={productType} onChange={(e) => setProductType(e.target.value)} /></div>
        </div>
      )}

      {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
      {ok && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{ok}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Save className="h-5 w-5" /> {isGas ? 'Registrar recebimento de gás' : 'Confirmar e salvar'}</Button>
    </div>
  );
}
