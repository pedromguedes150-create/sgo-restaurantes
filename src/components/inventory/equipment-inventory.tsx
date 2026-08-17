'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, X, Save, ArrowDownCircle, ArrowUpCircle, ClipboardCheck, Printer, AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
import { formatBRL } from '@/lib/utils';

interface Unit { id: string; name: string }
interface Supplier { id: string; name: string }
export interface EquipItem { id: string; unitId: string; unit: string; name: string; category: string | null; supplier: string | null; unitLabel: string; unitValue: number; currentQty: number; minQty: number | null; location: string | null; active: boolean; totalValue: number; low: boolean }
export interface EquipMove { id: string; item: string; unitLabel: string; unit: string; type: 'IN' | 'OUT' | 'ADJUST'; qty: number; balanceAfter: number; note: string | null; date: string; by: string }
export interface EquipSummary { items: number; totalValue: number; lowStock: number }

const MOVE = { IN: { label: 'Entrada', tone: 'success' as const }, OUT: { label: 'Saída', tone: 'critical' as const }, ADJUST: { label: 'Ajuste', tone: 'medium' as const } };

async function call(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/inventory-equip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Falha' };
}

export function EquipmentInventory({ canEdit, isAdmin, units, suppliers, items, movements, summary }: {
  canEdit: boolean; isAdmin: boolean; units: Unit[]; suppliers: Supplier[]; items: EquipItem[]; movements: EquipMove[]; summary: EquipSummary;
}) {
  const [tab, setTab] = useState<'estoque' | 'movimentar' | 'contagem' | 'historico'>('estoque');
  const [unitId, setUnitId] = useState<string>(units[0]?.id ?? '');
  const multi = units.length > 1;
  const shown = useMemo(() => (multi && unitId ? items.filter((i) => i.unitId === unitId) : items), [items, unitId, multi]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'estoque', label: 'Estoque' },
    { key: 'movimentar', label: 'Movimentar' },
    { key: 'contagem', label: 'Contagem' },
    { key: 'historico', label: 'Histórico' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 print:hidden">
        <Cell label="Itens ativos" value={String(summary.items)} />
        <Cell label="Valor em estoque" value={formatBRL(summary.totalValue)} />
        <Cell label="Estoque baixo" value={String(summary.lowStock)} tone={summary.lowStock > 0 ? 'critical' : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {tabs.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>{t.label}</button>)}
        {multi && (
          <div className="ml-auto w-44">
            <Select aria-label="Unidade" size="sm" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
          </div>
        )}
      </div>

      {tab === 'estoque' && <Estoque items={shown} canEdit={canEdit} isAdmin={isAdmin} suppliers={suppliers} unitId={multi ? unitId : units[0]?.id ?? ''} />}
      {tab === 'movimentar' && canEdit && <Movimentar items={shown.filter((i) => i.active)} />}
      {tab === 'movimentar' && !canEdit && <p className="text-sm text-ink-500">Sem permissão para movimentar.</p>}
      {tab === 'contagem' && <Contagem items={shown.filter((i) => i.active)} canEdit={canEdit} unitName={units.find((u) => u.id === unitId)?.name ?? ''} />}
      {tab === 'historico' && <Historico moves={movements} />}
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'critical' }) {
  return <div className="rounded-lg border bg-surface py-3 text-center"><p className={tone === 'critical' && value !== '0' ? 'text-xl font-black text-danger' : 'text-xl font-black text-ink-900'}>{value}</p><p className="text-xs text-ink-500">{label}</p></div>;
}

/* ───────── Estoque (lista + novo + editar) ───────── */
function Estoque({ items, canEdit, isAdmin, suppliers, unitId }: { items: EquipItem[]; canEdit: boolean; isAdmin: boolean; suppliers: Supplier[]; unitId: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-2">
      {canEdit && (creating ? <ItemForm suppliers={suppliers} unitId={unitId} onDone={() => { setCreating(false); router.refresh(); }} onCancel={() => setCreating(false)} /> : <Button variant="gold" className="w-full" onClick={() => setCreating(true)}><Plus className="h-5 w-5" /> Novo item</Button>)}
      {items.length === 0 && <p className="text-sm text-ink-500">Nenhum item cadastrado.</p>}
      {items.map((i) => <ItemRow key={i.id} i={i} canEdit={canEdit} isAdmin={isAdmin} suppliers={suppliers} onChange={() => router.refresh()} />)}
    </div>
  );
}

function ItemRow({ i, canEdit, isAdmin, suppliers, onChange }: { i: EquipItem; canEdit: boolean; isAdmin: boolean; suppliers: Supplier[]; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-lg border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink-900">{i.name}{i.low && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger"><AlertTriangle className="h-3 w-3" /> baixo</span>}</p>
          <p className="text-xs text-ink-500">{i.category ? `${i.category} · ` : ''}{i.supplier ? `${i.supplier} · ` : ''}{i.location ? `local: ${i.location} · ` : ''}{formatBRL(i.unitValue)}/{i.unitLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-ink-900">{i.currentQty.toLocaleString('pt-BR')} <span className="text-xs font-normal text-ink-500">{i.unitLabel}</span></p>
          <p className="text-xs text-ink-500">{formatBRL(i.totalValue)}</p>
        </div>
      </div>
      {canEdit && (
        <div className="mt-2 flex items-center gap-1">
          <button onClick={async () => { const r = await call({ entity: 'item', action: 'toggle', id: i.id, active: !i.active }); if (r.ok) onChange(); }}><StatusBadge tone={i.active ? 'success' : 'critical'}>{i.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          {isAdmin && <Button size="sm" variant="ghost" className="text-danger" aria-label="Excluir" onClick={async () => { if (!confirm(`Excluir "${i.name}"? Só é possível se não houver movimentações; senão, inative.`)) return; const r = await call({ entity: 'item', action: 'delete', id: i.id }); if (r.ok) onChange(); else alert(r.error ?? 'Falha'); }}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      )}
      {editing && <div className="mt-2"><ItemForm suppliers={suppliers} unitId={i.unitId} edit={i} onDone={() => { setEditing(false); onChange(); }} onCancel={() => setEditing(false)} /></div>}
    </div>
  );
}

function ItemForm({ suppliers, unitId, edit, onDone, onCancel }: { suppliers: Supplier[]; unitId: string; edit?: EquipItem; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(edit?.name ?? '');
  const [category, setCategory] = useState(edit?.category ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [unitLabel, setUnitLabel] = useState(edit?.unitLabel ?? 'un');
  const [unitValue, setUnitValue] = useState(edit ? String(edit.unitValue).replace('.', ',') : '');
  const [minQty, setMinQty] = useState(edit?.minQty != null ? String(edit.minQty).replace('.', ',') : '');
  const [location, setLocation] = useState(edit?.location ?? '');
  const [initialQty, setInitialQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (s: string) => parseFloat((s || '').replace(',', '.'));

  async function submit() {
    if (!name.trim()) { setMsg('Informe o nome.'); return; }
    setBusy(true); setMsg(null);
    const base = { name, category, supplierId: supplierId || undefined, unitLabel, unitValue: unitValue ? num(unitValue) : 0, minQty: minQty ? num(minQty) : undefined, location };
    const r = edit
      ? await call({ entity: 'item', action: 'update', id: edit.id, ...base })
      : await call({ entity: 'item', action: 'create', unitId, ...base, initialQty: initialQty ? num(initialQty) : undefined });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    onDone();
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
        <div><Label className="text-xs">Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 text-sm" placeholder="ex: Cozinha" /></div>
        <Select label="Fornecedor" size="sm" value={supplierId} onValueChange={setSupplierId} options={[{ value: '', label: '— nenhum —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
        <div><Label className="text-xs">Unidade (un/cx/kg/L)</Label><Input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} className="h-10 text-sm" /></div>
        <div><Label className="text-xs">Valor unitário (R$)</Label><Input inputMode="decimal" value={unitValue} onChange={(e) => setUnitValue(e.target.value)} className="h-10 text-sm" /></div>
        <div><Label className="text-xs">Estoque mínimo</Label><Input inputMode="decimal" value={minQty} onChange={(e) => setMinQty(e.target.value)} className="h-10 text-sm" placeholder="opcional" /></div>
        <div><Label className="text-xs">Local</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} className="h-10 text-sm" placeholder="opcional" /></div>
        {!edit && <div className="col-span-2"><Label className="text-xs">Quantidade inicial</Label><Input inputMode="decimal" value={initialQty} onChange={(e) => setInitialQty(e.target.value)} className="h-10 text-sm" placeholder="opcional (gera entrada)" /></div>}
      </div>
      {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy} onClick={submit}><Save className="h-4 w-4" /> {edit ? 'Salvar' : 'Cadastrar'}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ───────── Movimentar (entrada/saída) ───────── */
function Movimentar({ items }: { items: EquipItem[] }) {
  const router = useRouter();
  const [itemId, setItemId] = useState('');
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [qty, setQty] = useState('');
  const [unitValue, setUnitValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sel = items.find((i) => i.id === itemId);

  async function submit() {
    const q = parseFloat((qty || '0').replace(',', '.'));
    if (!itemId || !(q > 0)) { setMsg('Escolha o item e a quantidade.'); return; }
    setBusy(true); setMsg(null);
    const r = await call({ entity: 'movement', action: 'create', itemId, type, qty: q, unitValue: unitValue ? parseFloat(unitValue.replace(',', '.')) : undefined, note });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setQty(''); setUnitValue(''); setNote(''); router.refresh();
  }

  if (items.length === 0) return <p className="text-sm text-ink-500">Cadastre itens antes de movimentar.</p>;
  return (
    <div className="space-y-3">
      <Select label="Item" placeholder="— selecione —" value={itemId} onValueChange={setItemId} options={items.map((i) => ({ value: i.id, label: i.name, hint: `${i.currentQty} ${i.unitLabel} em estoque` }))} />
      <div className="flex gap-2">
        <button onClick={() => setType('IN')} className={type === 'IN' ? 'flex flex-1 items-center justify-center gap-1 rounded-lg bg-success/15 px-3 py-2 text-sm font-bold text-success' : 'flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm'}><ArrowDownCircle className="h-4 w-4" /> Entrada</button>
        <button onClick={() => setType('OUT')} className={type === 'OUT' ? 'flex flex-1 items-center justify-center gap-1 rounded-lg bg-danger/15 px-3 py-2 text-sm font-bold text-danger' : 'flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm'}><ArrowUpCircle className="h-4 w-4" /> Saída</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Quantidade{sel ? ` (${sel.unitLabel})` : ''}</Label><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        {type === 'IN' && <div><Label>Valor unit. (opcional)</Label><Input inputMode="decimal" value={unitValue} onChange={(e) => setUnitValue(e.target.value)} placeholder="atualiza o custo" /></div>}
      </div>
      <div><Label>Observação</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex: nota 123 / quebra / uso" /></div>
      {sel && <p className="text-xs text-ink-500">Saldo atual: <strong>{sel.currentQty} {sel.unitLabel}</strong>{type === 'OUT' && Number((qty || '0').replace(',', '.')) > sel.currentQty ? ' — atenção: saída maior que o saldo' : ''}</p>}
      {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Save className="h-5 w-5" /> Registrar movimento</Button>
    </div>
  );
}

/* ───────── Contagem (ajuste + relatório imprimível) ───────── */
function Contagem({ items, canEdit, unitName }: { items: EquipItem[]; canEdit: boolean; unitName: string }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function saveOne(id: string) {
    const v = vals[id];
    if (v === undefined || v === '') return;
    const counted = parseFloat(v.replace(',', '.'));
    if (!Number.isFinite(counted) || counted < 0) return;
    setBusy(true);
    const r = await call({ entity: 'movement', action: 'create', itemId: id, type: 'ADJUST', qty: counted, note: 'Contagem' });
    setBusy(false);
    if (r.ok) { setVals((s) => ({ ...s, [id]: '' })); router.refresh(); } else alert(r.error ?? 'Falha');
  }

  if (items.length === 0) return <p className="text-sm text-ink-500">Nenhum item ativo para contar.</p>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-ink-500">Informe a quantidade contada para ajustar o saldo, ou imprima a folha de contagem.</p>
        <Button size="sm" onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" /> Relatório</Button>
      </div>
      <div className="hidden print:block"><h2 className="text-lg font-bold">Folha de contagem — {unitName}</h2></div>
      <div className="space-y-1">
        {items.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border bg-surface px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{i.name}</p>
              <p className="text-xs text-ink-500">{i.category ?? ''}{i.location ? ` · ${i.location}` : ''} · sistema: {i.currentQty} {i.unitLabel}</p>
            </div>
            {canEdit ? (
              <div className="flex items-center gap-1 print:hidden">
                <Input inputMode="decimal" value={vals[i.id] ?? ''} onChange={(e) => setVals((s) => ({ ...s, [i.id]: e.target.value }))} placeholder="contado" className="h-9 w-24 text-sm" />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => saveOne(i.id)} aria-label="Ajustar"><ClipboardCheck className="h-4 w-4" /></Button>
              </div>
            ) : null}
            <span className="hidden w-24 border-b border-dashed print:inline-block">&nbsp;</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Histórico ───────── */
function Historico({ moves }: { moves: EquipMove[] }) {
  if (moves.length === 0) return <p className="text-sm text-ink-500">Sem movimentações.</p>;
  return (
    <div className="space-y-1">
      {moves.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border bg-surface px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{m.item}</p>
            <p className="text-xs text-ink-500">{m.date} · {m.unit}{m.note ? ` · ${m.note}` : ''}{m.by ? ` · ${m.by}` : ''}</p>
          </div>
          <div className="text-right">
            <StatusBadge tone={MOVE[m.type].tone}>{MOVE[m.type].label} {m.qty > 0 ? '+' : ''}{m.qty}</StatusBadge>
            <p className="mt-0.5 text-xs text-ink-500">saldo {m.balanceAfter} {m.unitLabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
