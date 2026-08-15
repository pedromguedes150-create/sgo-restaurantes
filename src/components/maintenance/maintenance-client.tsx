'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, CalendarClock, Plus, Play, Check, X, RotateCcw, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { shortUnitName } from '@/lib/unit-name';
import { formatBRL } from '@/lib/utils';

interface UnitDTO { id: string; name: string }
interface EquipDTO { id: string; name: string; unitId: string }
interface SupplierDTO { id: string; name: string }
interface TicketDTO {
  id: string; number: number; unit: string; title: string; description: string | null;
  equipmentName: string | null; supplierId: string | null; supplierName: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELED'; cost: number | null; deadline: string | null;
  openedByName: string | null; doneByName: string | null; doneAt: string | null; resolutionNote: string | null;
}
interface PlanDTO {
  id: string; unit: string; title: string; description: string | null; equipmentName: string | null;
  frequencyDays: number; nextDueAt: string; lastDoneAt: string | null; active: boolean;
  logs: { doneAt: string; doneByName: string | null; note: string | null }[];
}
interface Summary { open: number; inProgress: number; overdue: number; doneMonth: number; costMonth: number }

const STATUS_META: Record<TicketDTO['status'], { label: string; tone: StatusTone }> = {
  OPEN: { label: 'Aberto', tone: 'medium' },
  IN_PROGRESS: { label: 'Em andamento', tone: 'black' },
  DONE: { label: 'Concluído', tone: 'success' },
  CANCELED: { label: 'Cancelado', tone: 'neutral' },
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const isOverdue = (iso: string | null) => Boolean(iso && new Date(iso) < new Date());

export function MaintenanceClient({ view, isAdmin, units, equipment, suppliers, summary, tickets, plans }: {
  view: 'chamados' | 'preventiva'; isAdmin: boolean; units: UnitDTO[]; equipment: EquipDTO[]; suppliers: SupplierDTO[];
  summary: Summary; tickets: TicketDTO[]; plans: PlanDTO[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'chamados' | 'preventiva'>(view);
  const tabClass = (t: string) => t === tab
    ? 'inline-flex items-center gap-1 rounded-full bg-sgo-brand px-3.5 py-1.5 text-sm font-semibold text-on-brand'
    : 'inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm font-medium';

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-sgo-brand"><Wrench className="h-5 w-5 text-sgo-brand" /> Manutenção</h1>
      <div className="flex flex-wrap gap-2">
        <button className={tabClass('chamados')} onClick={() => setTab('chamados')}><Wrench className="h-4 w-4" /> Chamados</button>
        <button className={tabClass('preventiva')} onClick={() => setTab('preventiva')}><CalendarClock className="h-4 w-4" /> Preventiva</button>
      </div>

      {tab === 'chamados'
        ? <TicketsTab isAdmin={isAdmin} units={units} equipment={equipment} suppliers={suppliers} summary={summary} tickets={tickets} onDone={() => router.refresh()} />
        : <PlansTab isAdmin={isAdmin} units={units} equipment={equipment} plans={plans} onDone={() => router.refresh()} />}
    </div>
  );
}

/* ─────────────────────────── Chamados ─────────────────────────── */
function TicketsTab({ isAdmin, units, equipment, suppliers, summary, tickets, onDone }: {
  isAdmin: boolean; units: UnitDTO[]; equipment: EquipDTO[]; suppliers: SupplierDTO[]; summary: Summary; tickets: TicketDTO[]; onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-sgo-brand">{summary.open}</p><p className="text-xs text-ink-500">abertos</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-sgo-brand">{summary.inProgress}</p><p className="text-xs text-ink-500">em andamento</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-danger">{summary.overdue}</p><p className="text-xs text-ink-500">atrasados</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-sgo-success">{summary.doneMonth}</p><p className="text-xs text-ink-500">feitos no mês</p></CardContent></Card>
      </div>
      {summary.costMonth > 0 && <p className="text-sm text-ink-500">Custo de manutenção no mês: <b className="text-sgo-brand">{formatBRL(summary.costMonth)}</b></p>}

      <NewTicket units={units} equipment={equipment} suppliers={suppliers} onDone={onDone} />

      <div className="space-y-2">
        {tickets.length === 0 && <p className="text-sm text-ink-500">Nenhum chamado registrado.</p>}
        {tickets.map((t) => <TicketCard key={t.id} t={t} isAdmin={isAdmin} suppliers={suppliers} onDone={onDone} />)}
      </div>
    </div>
  );
}

function NewTicket({ units, equipment, suppliers, onDone }: { units: UnitDTO[]; equipment: EquipDTO[]; suppliers: SupplierDTO[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const equipForUnit = useMemo(() => equipment.filter((e) => e.unitId === unitId), [equipment, unitId]);

  async function submit() {
    if (!title.trim()) { setMsg('Informe o título.'); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/maintenance/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, title, description, equipmentId: equipmentId || undefined, supplierId: supplierId || undefined, deadline: deadline || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      setTitle(''); setDescription(''); setEquipmentId(''); setSupplierId(''); setDeadline(''); setOpen(false); onDone();
    } finally { setBusy(false); }
  }

  if (!open) return <Button onClick={() => setOpen(true)} variant="gold" className="w-full"><Plus className="h-5 w-5" /> Novo chamado</Button>;
  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Novo chamado de manutenção</h2>
      <div className="space-y-2">
        {units.length > 1 && (
          <Select
            label="Unidade" value={unitId}
            onValueChange={(v) => { setUnitId(v); setEquipmentId(''); }}
            options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
          />
        )}
        <div><Label>O que precisa de manutenção?</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Câmara fria não gela" /></div>
        <div><Label>Detalhes (opcional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            label="Equipamento (opcional)" value={equipmentId} onValueChange={setEquipmentId}
            options={[{ value: '', label: '— nenhum —' }, ...equipForUnit.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <Select
            label="Prestador (opcional)" value={supplierId} onValueChange={setSupplierId}
            options={[{ value: '', label: '— a definir —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </div>
        <div className="max-w-[200px]"><DatePicker label="Prazo (opcional)" value={deadline || null} onValueChange={(v) => setDeadline(v ?? '')} /></div>
        {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy} className="flex-1">Abrir chamado</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}

function TicketCard({ t, isAdmin, suppliers, onDone }: { t: TicketDTO; isAdmin: boolean; suppliers: SupplierDTO[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cost, setCost] = useState('');
  const [resolution, setResolution] = useState('');
  const [supplierId, setSupplierId] = useState(t.supplierId ?? '');
  const [deadline, setDeadline] = useState(t.deadline ? t.deadline.slice(0, 10) : '');
  const meta = STATUS_META[t.status];

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch('/api/maintenance/tickets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, ...body }) });
      if (res.ok) { setFinishing(false); setEditing(false); onDone(); }
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border bg-sgo-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sgo-brand">#{t.number} · {t.title}</p>
          <p className="text-xs text-ink-500">{t.unit}{t.equipmentName ? ` · ${t.equipmentName}` : ''}{t.supplierName ? ` · ${t.supplierName}` : ''}</p>
          {t.description && <p className="mt-1 text-sm">{t.description}</p>}
          {t.deadline && <p className={`mt-1 text-xs ${isOverdue(t.deadline) && t.status !== 'DONE' && t.status !== 'CANCELED' ? 'font-semibold text-danger' : 'text-ink-500'}`}>Prazo: {fmtDate(t.deadline)}{isOverdue(t.deadline) && t.status !== 'DONE' && t.status !== 'CANCELED' ? ' (atrasado)' : ''}</p>}
          {t.status === 'DONE' && <p className="mt-1 text-xs text-sgo-success">Concluído {fmtDate(t.doneAt)}{t.doneByName ? ` por ${t.doneByName}` : ''}{t.cost != null ? ` · ${formatBRL(t.cost)}` : ''}{t.resolutionNote ? ` · ${t.resolutionNote}` : ''}</p>}
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>

      {editing && (t.status === 'OPEN' || t.status === 'IN_PROGRESS') && (
        <div className="mt-2 space-y-2 rounded-lg bg-sunken/40 p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select
              label="Prestador" size="sm" value={supplierId} onValueChange={setSupplierId}
              options={[{ value: '', label: '— a definir —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
            />
            <DatePicker label="Prazo" size="sm" value={deadline || null} onValueChange={(v) => setDeadline(v ?? '')} />
          </div>
          <Button size="sm" disabled={busy} onClick={() => act({ supplierId, deadline })}>Salvar</Button>
        </div>
      )}

      {finishing && (
        <div className="mt-2 space-y-2 rounded-lg bg-sunken/40 p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><Label className="text-xs">Custo (R$)</Label><Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className="h-9 text-sm" placeholder="0,00" /></div>
            <div><Label className="text-xs">O que foi feito</Label><Input value={resolution} onChange={(e) => setResolution(e.target.value)} className="h-9 text-sm" /></div>
          </div>
          <Button size="sm" disabled={busy} onClick={() => act({ action: 'done', cost: cost ? parseFloat(cost.replace('.', '').replace(',', '.')) : undefined, resolutionNote: resolution })}><Check className="h-4 w-4" /> Concluir</Button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {t.status === 'OPEN' && <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'start' })}><Play className="h-4 w-4" /> Iniciar</Button>}
        {(t.status === 'OPEN' || t.status === 'IN_PROGRESS') && <Button size="sm" variant="gold" disabled={busy} onClick={() => setFinishing((v) => !v)}><Check className="h-4 w-4" /> Concluir</Button>}
        {(t.status === 'OPEN' || t.status === 'IN_PROGRESS') && <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing((v) => !v)}><Pencil className="h-4 w-4" /> Prestador/prazo</Button>}
        {(t.status === 'OPEN' || t.status === 'IN_PROGRESS') && <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => { if (confirm('Cancelar este chamado?')) act({ action: 'cancel' }); }}><X className="h-4 w-4" /> Cancelar</Button>}
        {(t.status === 'DONE' || t.status === 'CANCELED') && <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: 'reopen' })}><RotateCcw className="h-4 w-4" /> Reabrir</Button>}
        {isAdmin && <DeleteOpButton entity="maintenanceTicket" id={t.id} label={`o chamado #${t.number}`} />}
      </div>
    </div>
  );
}

/* ─────────────────────────── Preventiva ─────────────────────────── */
function PlansTab({ isAdmin, units, equipment, plans, onDone }: { isAdmin: boolean; units: UnitDTO[]; equipment: EquipDTO[]; plans: PlanDTO[]; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">Planos recorrentes por equipamento. Quando vencem, gerente e supervisão são avisados na Central de Notificações.</p>
      <NewPlan units={units} equipment={equipment} onDone={onDone} />
      <div className="space-y-2">
        {plans.length === 0 && <p className="text-sm text-ink-500">Nenhum plano preventivo.</p>}
        {plans.map((p) => <PlanCard key={p.id} p={p} isAdmin={isAdmin} onDone={onDone} />)}
      </div>
    </div>
  );
}

function NewPlan({ units, equipment, onDone }: { units: UnitDTO[]; equipment: EquipDTO[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [frequencyDays, setFrequencyDays] = useState('30');
  const [firstDueAt, setFirstDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const equipForUnit = useMemo(() => equipment.filter((e) => e.unitId === unitId), [equipment, unitId]);

  async function submit() {
    if (!title.trim() || !(Number(frequencyDays) > 0)) { setMsg('Informe título e frequência (dias).'); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/maintenance/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, title, equipmentId: equipmentId || undefined, frequencyDays: Number(frequencyDays), firstDueAt: firstDueAt || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      setTitle(''); setEquipmentId(''); setFrequencyDays('30'); setFirstDueAt(''); setOpen(false); onDone();
    } finally { setBusy(false); }
  }

  if (!open) return <Button onClick={() => setOpen(true)} variant="gold" className="w-full"><Plus className="h-5 w-5" /> Novo plano preventivo</Button>;
  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Novo plano preventivo</h2>
      <div className="space-y-2">
        {units.length > 1 && (
          <Select
            label="Unidade" value={unitId}
            onValueChange={(v) => { setUnitId(v); setEquipmentId(''); }}
            options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
          />
        )}
        <div><Label>Manutenção</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Limpeza da coifa" /></div>
        <Select
          label="Equipamento (opcional)" value={equipmentId} onValueChange={setEquipmentId}
          options={[{ value: '', label: '— nenhum —' }, ...equipForUnit.map((e) => ({ value: e.id, label: e.name }))]}
        />
        <div className="grid grid-cols-2 gap-2">
          <div><Label>A cada (dias)</Label><Input inputMode="numeric" value={frequencyDays} onChange={(e) => setFrequencyDays(e.target.value.replace(/\D/g, ''))} /></div>
          <DatePicker label="1ª data (opcional)" value={firstDueAt || null} onValueChange={(v) => setFirstDueAt(v ?? '')} />
        </div>
        {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy} className="flex-1">Criar plano</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ p, isAdmin, onDone }: { p: PlanDTO; isAdmin: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [doing, setDoing] = useState(false);
  const [note, setNote] = useState('');
  const due = isOverdue(p.nextDueAt);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch('/api/maintenance/plans', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, ...body }) });
      if (res.ok) { setDoing(false); setNote(''); onDone(); }
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  return (
    <div className={`rounded-lg border bg-sgo-surface p-3 ${!p.active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sgo-brand">{p.title}</p>
          <p className="text-xs text-ink-500">{p.unit}{p.equipmentName ? ` · ${p.equipmentName}` : ''} · a cada {p.frequencyDays} dias</p>
          <p className={`mt-1 text-xs ${due && p.active ? 'font-semibold text-danger' : 'text-ink-500'}`}>Próxima: {fmtDate(p.nextDueAt)}{due && p.active ? ' (vencida)' : ''}{p.lastDoneAt ? ` · última: ${fmtDate(p.lastDoneAt)}` : ''}</p>
          {p.logs.length > 0 && <p className="mt-1 text-xs text-ink-500">Histórico: {p.logs.map((l) => fmtDate(l.doneAt)).join(', ')}</p>}
        </div>
        <StatusBadge tone={p.active ? (due ? 'critical' : 'success') : 'neutral'}>{p.active ? (due ? 'Vencida' : 'Ativa') : 'Pausada'}</StatusBadge>
      </div>

      {doing && (
        <div className="mt-2 space-y-2 rounded-lg bg-sunken/40 p-2">
          <div><Label className="text-xs">Observação (opcional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9 text-sm" placeholder="Ex.: trocada a peça X" /></div>
          <Button size="sm" disabled={busy} onClick={() => patch({ action: 'execute', note })}><Check className="h-4 w-4" /> Registrar execução</Button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {p.active && <Button size="sm" variant="gold" disabled={busy} onClick={() => setDoing((v) => !v)}><Check className="h-4 w-4" /> Registrar execução</Button>}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ active: !p.active })}>{p.active ? 'Pausar' : 'Ativar'}</Button>
        {isAdmin && <DeleteOpButton entity="maintenancePlan" id={p.id} label={`o plano "${p.title}"`} />}
      </div>
    </div>
  );
}
