'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Group } from '@/components/ui/ds/group';

export interface SupplierRow { id: string; name: string; cnpj: string | null; pixKey: string | null; category: string | null; notes: string | null; active: boolean; isGas: boolean }

async function callSupplier(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Falha' };
}

export function SuppliersAdmin({ suppliers }: { suppliers: SupplierRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [category, setCategory] = useState('');
  const [isGas, setIsGas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) { setMsg('Informe o nome do fornecedor.'); return; }
    setBusy(true); setMsg(null);
    const r = await callSupplier({ action: 'create', name, cnpj, pixKey, category, isGas });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setName(''); setCnpj(''); setPixKey(''); setCategory(''); setIsGas(false); router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Lista compartilhada de fornecedores — usada em Gás, Notas Recebidas e Pagamentos. Alimentada por Admin, CEO e Supervisão.</p>
      <div className="rounded-lg border border-dashed p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Razão social / nome" /></div>
          <div><Label>Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="ex: Gás, Carnes, Bebidas" /></div>
          <div><Label>CNPJ</Label><Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="opcional" /></div>
          <div><Label>Chave PIX</Label><Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="opcional" /></div>
        </div>
        <label className="flex items-center gap-2 rounded-md bg-sunken/40 p-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={isGas} onChange={(e) => setIsGas(e.target.checked)} />
          <span><strong>Fornecedor de gás</strong> — ao lançar uma nota deste fornecedor, os campos viram os de gás (kg, preço/kg) automaticamente.</span>
        </label>
        <Button disabled={busy} className="w-full" onClick={add}><Plus className="h-4 w-4" /> Adicionar fornecedor</Button>
        {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
      </div>

      {suppliers.length === 0 ? (
        <p className="text-sm text-ink-500">Nenhum fornecedor cadastrado.</p>
      ) : (
        <Group>
          {suppliers.map((s) => <SupplierItem key={s.id} s={s} onChange={() => router.refresh()} />)}
        </Group>
      )}
    </div>
  );
}

function SupplierItem({ s, onChange }: { s: SupplierRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const [cnpj, setCnpj] = useState(s.cnpj ?? '');
  const [pixKey, setPixKey] = useState(s.pixKey ?? '');
  const [category, setCategory] = useState(s.category ?? '');
  const [isGas, setIsGas] = useState(s.isGas);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(payload: Record<string, unknown>, after?: () => void) {
    setBusy(true); setMsg(null);
    const r = await callSupplier(payload);
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    after?.(); onChange();
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink-900">{s.name}{s.category ? <span className="ml-1 text-xs font-normal text-ink-500">· {s.category}</span> : null}{s.isGas ? <span className="ml-1 rounded bg-brand/15 px-1.5 text-[11px] font-bold text-ink-900">GÁS</span> : null}</p>
          <p className="text-xs text-ink-500">{s.cnpj ? `CNPJ ${s.cnpj}` : 'sem CNPJ'}{s.pixKey ? ` · PIX ${s.pixKey}` : ''}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => call({ action: 'toggle', id: s.id, active: !s.active })}><StatusBadge tone={s.active ? 'success' : 'critical'}>{s.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => { if (confirm(`Excluir o fornecedor "${s.name}"? Só é possível se não houver gás/notas/pagamentos vinculados.`)) call({ action: 'delete', id: s.id }); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-sunken/40 p-2">
          <div><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">CNPJ</Label><Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">Chave PIX</Label><Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} className="h-10 text-sm" /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={isGas} onChange={(e) => setIsGas(e.target.checked)} />
            <span><strong>Fornecedor de gás</strong> (campos de gás no lançamento da nota)</span>
          </label>
          <Button size="sm" className="col-span-2" disabled={busy} onClick={() => call({ action: 'update', id: s.id, name, cnpj, pixKey, category, isGas }, () => setEditing(false))}><Save className="h-4 w-4" /> Salvar</Button>
        </div>
      )}
      {msg && <p className="mt-1 text-sm font-medium text-danger">{msg}</p>}
    </div>
  );
}
