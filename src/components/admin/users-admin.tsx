'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin, ROLE_OPTIONS } from '@/lib/admin-client';

export interface UserRow { id: string; name: string; email: string; role: string; active: boolean }
interface Unit { id: string; name: string }

export function UsersAdmin({ users, units, meId }: { users: UserRow[]; units: Unit[]; meId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MANAGER');
  const [password, setPassword] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';
  const needsUnits = role !== 'ADMIN' && role !== 'CEO' && role !== 'FINANCE';

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
  function toggleUnit(id: string) { setUnitIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed p-3">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Novo usuário</h2>
        <div className="space-y-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Perfil</Label><select className={sel} value={role} onChange={(e) => setRole(e.target.value)}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div><Label>Senha (mín. 6)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          </div>
          {needsUnits && (
            <div>
              <Label>Unidades</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {units.map((u) => (
                  <button key={u.id} type="button" onClick={() => toggleUnit(u.id)} className={unitIds.includes(u.id) ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</button>
                ))}
              </div>
            </div>
          )}
          {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
          <Button onClick={create} disabled={busy} className="w-full"><Plus className="h-4 w-4" /> Criar usuário</Button>
        </div>
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
            <div>
              <p className="font-semibold text-brand">{u.name}{u.id === meId && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}</p>
              <p className="text-xs text-muted-foreground">{u.email} · {ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}</p>
            </div>
            <button onClick={() => toggle(u)} disabled={u.id === meId}>
              <StatusBadge tone={u.active ? 'success' : 'critical'}>{u.active ? 'Ativo' : 'Inativo'}</StatusBadge>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
