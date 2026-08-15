'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/ds/select';
import { postAdmin, ROLE_OPTIONS } from '@/lib/admin-client';

export interface UserRow { id: string; name: string; email: string; role: string; active: boolean; unitIds: string[] }
interface Unit { id: string; name: string }

function roleNeedsUnits(role: string) { return role !== 'ADMIN' && role !== 'CEO' && role !== 'FINANCE'; }

export function UsersAdmin({ users, units, meId }: { users: UserRow[]; units: Unit[]; meId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MANAGER');
  const [password, setPassword] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const needsUnits = roleNeedsUnits(role);

  async function create() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'user', action: 'create', name, email, role, password, unitIds: needsUnits ? unitIds : [] });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setName(''); setEmail(''); setPassword(''); setUnitIds([]); router.refresh();
  }
  async function toggle(u: UserRow) {
    if (u.id === meId) return;
    await postAdmin({ entity: 'user', action: 'toggle', id: u.id, active: !u.active });
    router.refresh();
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed p-3">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Novo usuário</h2>
        <div className="space-y-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <Select label="Perfil" value={role} onValueChange={setRole} options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))} />
            <div><Label>Senha (mín. 6)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          </div>
          {needsUnits && (
            <div>
              <Label>Unidades</Label>
              <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
            </div>
          )}
          {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
          <Button onClick={create} disabled={busy} className="w-full"><Plus className="h-4 w-4" /> Criar usuário</Button>
        </div>
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <UserItem key={u.id} u={u} units={units} meId={meId} onChange={() => router.refresh()} onToggle={() => toggle(u)} />
        ))}
      </div>
    </div>
  );
}

function UserItem({ u, units, meId, onChange, onToggle }: { u: UserRow; units: Unit[]; meId: string; onChange: () => void; onToggle: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(u.name);
  const [role, setRole] = useState(u.role);
  const [password, setPassword] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>(u.unitIds);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const needsUnits = roleNeedsUnits(role);
  const isSelf = u.id === meId;

  async function save() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'user', action: 'update', id: u.id, name, role: isSelf ? undefined : role, password: password || undefined });
    if (r.ok) await postAdmin({ entity: 'user', action: 'setUnits', id: u.id, unitIds: needsUnits ? unitIds : [] });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setPassword(''); setEditing(false); onChange();
  }
  async function remove() {
    if (isSelf) return;
    if (!confirm(`Excluir o usuário "${u.name}"? O histórico de ações fica preservado (sem autor). Esta ação não pode ser desfeita.`)) return;
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'user', action: 'delete', id: u.id });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    onChange();
  }

  return (
    <div className="rounded-lg border bg-sgo-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-sgo-brand">{u.name}{isSelf && <span className="ml-1 text-xs text-ink-500">(você)</span>}</p>
          <p className="text-xs text-ink-500">{u.email} · {ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onToggle} disabled={isSelf}>
            <StatusBadge tone={u.active ? 'success' : 'critical'}>{u.active ? 'Ativo' : 'Inativo'}</StatusBadge>
          </button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" disabled={busy || isSelf} onClick={remove} aria-label="Excluir" className="text-danger"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {editing && (
        <div className="mt-2 space-y-2 rounded-lg bg-sunken/40 p-2">
          <div><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
          <div className="grid grid-cols-2 gap-2">
            <Select label="Perfil" size="sm" value={role} disabled={isSelf} onValueChange={setRole} options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))} />
            <div><Label className="text-xs">Nova senha (opcional)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="deixe em branco p/ manter" className="h-10 text-sm" /></div>
          </div>
          {needsUnits && (
            <div>
              <Label className="text-xs">Unidades</Label>
              <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
            </div>
          )}
          {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
          <Button size="sm" className="w-full" disabled={busy} onClick={save}><Save className="h-4 w-4" /> Salvar alterações</Button>
        </div>
      )}
      {!editing && msg && <p className="mt-1 text-sm font-medium text-danger">{msg}</p>}
    </div>
  );
}
