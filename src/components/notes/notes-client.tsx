'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Save, AlertTriangle, Pencil, X, Trash2, Undo2, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { QrScanner } from '@/components/notes/qr-scanner';
import { formatBRL } from '@/lib/utils';
import { parseChaveAcesso } from '@/lib/notes/chave';

interface Unit { id: string; name: string }
interface Supplier { id: string; name: string; cnpj: string | null }
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

export function NotesClient({ units, notes, suppliers = [], canManage = false, canEditDate = false, sinceDays = 60 }: {
  units: Unit[]; notes: NoteDTO[]; suppliers?: Supplier[]; canManage?: boolean; canEditDate?: boolean; sinceDays?: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'nova' | 'lista' | 'analise'>('lista');
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
    ...(canManage ? [{ key: 'analise' as const, label: 'Análise' }] : []),
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

  async function editDate() {
    const v = prompt('Data correta do lançamento (AAAA-MM-DD) — a edição desconta % na meta do gerente:', (n.entryDate ?? n.requestedAt ?? '').slice(0, 10));
    if (!v) return;
    const res = await fetch('/api/entry-date', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module: 'note', id: n.id, date: v.trim() }) });
    if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
  }
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
        {canEditDate && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void editDate()}><Pencil className="h-4 w-4" /> Editar data</Button>}
        {n.status === 'RECEIVED' && (
          <>
            {/* Pagamento é controlado no Teknisa — aqui só recebimento/problema/devolução (16/07) */}
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => onStatus(n.id, 'PROBLEM')}><AlertTriangle className="h-4 w-4" /> Problema</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus(n.id, 'RETURNED')}><Undo2 className="h-4 w-4" /> Devolver</Button>
          </>
        )}
        {canManage && <Button size="sm" variant="destructive" disabled={deleting} onClick={remove}><Trash2 className="h-4 w-4" /> Excluir</Button>}
      </div>
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

  async function submit() {
    setErr(null);
    const v = parseFloat((totalValue || '0').replace('.', '').replace(',', '.')) || parseFloat(totalValue);
    // Fornecedor SÓ da lista de cadastrados (16/07 — sem digitação livre)
    if (!unitId || !supplierId || !v) { setErr('Preencha unidade, fornecedor (da lista) e valor.'); return; }
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
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">Fornecedor não está na lista? Peça à Supervisão/Admin para cadastrar em Configurações → Fornecedores.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>CNPJ</Label><Input className={hl} value={supplierCnpj} onChange={(e) => setSupplierCnpj(e.target.value)} /></div>
        <div><Label>Número</Label><Input className={hl} value={number} onChange={(e) => setNumber(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Emissão</Label><Input className={hl} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
        <div><Label>Vencimento</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Valor total (R$)</Label><Input inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} placeholder="0,00" /></div>
        <div><Label>Tipo de produto</Label><Input value={productType} onChange={(e) => setProductType(e.target.value)} /></div>
      </div>
      {err && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">{err}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Save className="h-5 w-5" /> Confirmar e salvar</Button>
    </div>
  );
}
