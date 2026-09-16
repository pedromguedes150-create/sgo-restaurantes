'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { Sheet } from '@/components/ui/ds/sheet';
import { Select } from '@/components/ui/ds/select';
import { postAdmin, ROLE_OPTIONS } from '@/lib/admin-client';
import { ehPerfilPersonalizado, idDoPerfil, valorDePerfil } from '@/lib/perfil-valor';

export interface UserRow { id: string; name: string; email: string; role: string; active: boolean; unitIds: string[]; cdSectorId: string | null; cdSectorName: string | null; profileId: string | null; profileName: string | null }
interface Unit { id: string; name: string }
interface CdSector { id: string; name: string }
interface PerfilPersonalizado { id: string; name: string; baseRole: string }

/**
 * O Separador do CD fica FORA da escolha de unidades: o Centro de Distribuição
 * atende a rede inteira, e a fila dele é montada só pelo setor
 * (`listarParaSeparacao` nunca olha as unidades do usuário). Pedir unidades
 * aqui daria a entender que elas mudam o que ele enxerga — não mudam.
 */
function roleNeedsUnits(role: string) { return role !== 'ADMIN' && role !== 'CEO' && role !== 'FINANCE' && role !== 'SEPARATOR'; }
function roleNeedsCdSector(role: string) { return role === 'SEPARATOR'; }

/**
 * A ferramenta do seletor: o valor escolhido é um perfil de sistema OU um
 * personalizado (prefixado). Tudo que decide campos na tela — unidades, setor —
 * pergunta pelo papel EFETIVO, que no personalizado é o perfil base dele.
 */
function ferramentasDePerfil(perfis: PerfilPersonalizado[]) {
  const opcoes = [
    ...ROLE_OPTIONS,
    ...perfis.map((p) => ({ value: valorDePerfil(p.id), label: p.name, hint: 'Perfil criado em Perfis de acesso' })),
  ];
  const papelEfetivo = (valor: string) =>
    ehPerfilPersonalizado(valor) ? (perfis.find((p) => p.id === idDoPerfil(valor))?.baseRole ?? '') : valor;
  /** O que mandar para a API: perfil de sistema vai em `role`; personalizado, em `profileId`. */
  const comoEnviar = (valor: string) =>
    ehPerfilPersonalizado(valor) ? { profileId: idDoPerfil(valor) } : { role: valor, profileId: null };
  return { opcoes, papelEfetivo, comoEnviar };
}

/** O valor do seletor para um usuário já cadastrado. */
const valorDoUsuario = (u: UserRow) => (u.profileId ? valorDePerfil(u.profileId) : u.role);

export function UsersAdmin({ users, units, cdSectors, perfis, meId }: { users: UserRow[]; units: Unit[]; cdSectors: CdSector[]; perfis: PerfilPersonalizado[]; meId: string }) {
  const router = useRouter();
  const { opcoes, papelEfetivo, comoEnviar } = ferramentasDePerfil(perfis);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MANAGER');
  const [password, setPassword] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [cdSectorId, setCdSectorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const needsUnits = roleNeedsUnits(papelEfetivo(role));
  const needsSector = roleNeedsCdSector(papelEfetivo(role));

  async function create() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'user', action: 'create', name, email, ...comoEnviar(role), password, unitIds: needsUnits ? unitIds : [], cdSectorId: needsSector ? cdSectorId : null });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setName(''); setEmail(''); setPassword(''); setUnitIds([]); setCdSectorId(null); setNovo(false); router.refresh();
  }
  async function toggle(u: UserRow) {
    if (u.id === meId) return;
    await postAdmin({ entity: 'user', action: 'toggle', id: u.id, active: !u.active });
    router.refresh();
  }
  return (
    <div className="space-y-4">
      {/* Criar usuário é ocasional; conferir a lista é o que se faz sempre. */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setNovo(true)}><Plus className="h-4 w-4" /> Novo usuário</Button>
      </div>
      <Sheet open={novo} onClose={() => setNovo(false)} title="Novo usuário" description="Perfil e unidades definem o que a pessoa enxerga no sistema.">
        <div className="space-y-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <Select label="Perfil" value={role} onValueChange={setRole} options={opcoes} />
            <div><Label>Senha (mín. 6)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          </div>
          {needsUnits && (
            <div>
              <Label>Unidades</Label>
              <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
            </div>
          )}
          {needsSector && (
            <SetorDoCd sectors={cdSectors} value={cdSectorId} onChange={setCdSectorId} />
          )}
          {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
          <Button onClick={create} disabled={busy} className="w-full"><Plus className="h-4 w-4" /> Criar usuário</Button>
        </div>
      </Sheet>

      <div className="space-y-2">
        {users.map((u) => (
          <UserItem key={u.id} u={u} units={units} cdSectors={cdSectors} perfis={perfis} meId={meId} onChange={() => router.refresh()} onToggle={() => toggle(u)} />
        ))}
      </div>
    </div>
  );
}

/** O setor é obrigatório para o Separador — sem ele a fila dele abre vazia. */
function SetorDoCd({ sectors, value, onChange, size }: { sectors: CdSector[]; value: string | null; onChange: (v: string) => void; size?: 'sm' }) {
  if (sectors.length === 0) {
    return (
      <p className="rounded-md bg-warning-bg p-2 text-xs text-warning">
        Nenhum setor do CD cadastrado. Crie os setores em Configurações → Setores do CD antes de cadastrar um Separador.
      </p>
    );
  }
  return (
    <Select
      label="Setor do CD"
      size={size}
      value={value}
      onValueChange={onChange}
      placeholder="Escolha o setor…"
      hint="O Separador vê e separa apenas os itens deste setor."
      options={sectors.map((s) => ({ value: s.id, label: s.name }))}
    />
  );
}

function UserItem({ u, units, cdSectors, perfis, meId, onChange, onToggle }: { u: UserRow; units: Unit[]; cdSectors: CdSector[]; perfis: PerfilPersonalizado[]; meId: string; onChange: () => void; onToggle: () => void }) {
  const { opcoes, papelEfetivo, comoEnviar } = ferramentasDePerfil(perfis);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(u.name);
  const [role, setRole] = useState(valorDoUsuario(u));
  const [password, setPassword] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>(u.unitIds);
  const [cdSectorId, setCdSectorId] = useState<string | null>(u.cdSectorId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const needsUnits = roleNeedsUnits(papelEfetivo(role));
  const needsSector = roleNeedsCdSector(papelEfetivo(role));
  const isSelf = u.id === meId;

  async function save() {
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'user', action: 'update', id: u.id, name, ...(isSelf ? {} : comoEnviar(role)), password: password || undefined, cdSectorId: needsSector ? cdSectorId : null });
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
    <div className="rounded-lg border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink-900">{u.name}{isSelf && <span className="ml-1 text-xs text-ink-500">(você)</span>}</p>
          <p className="text-xs text-ink-500">
            {u.email} · {u.profileName ?? ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}
            {u.role === 'SEPARATOR' && (
              u.cdSectorName
                ? <span> · setor {u.cdSectorName}</span>
                : <span className="font-medium text-danger"> · sem setor do CD — não vê pedido nenhum</span>
            )}
          </p>
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
            <Select label="Perfil" size="sm" value={role} disabled={isSelf} onValueChange={setRole} options={opcoes} />
            <div><Label className="text-xs">Nova senha (opcional)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="deixe em branco p/ manter" className="h-10 text-sm" /></div>
          </div>
          {needsUnits && (
            <div>
              <Label className="text-xs">Unidades</Label>
              <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
            </div>
          )}
          {needsSector && <SetorDoCd sectors={cdSectors} value={cdSectorId} onChange={setCdSectorId} size="sm" />}
          {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
          <Button size="sm" className="w-full" disabled={busy} onClick={save}><Save className="h-4 w-4" /> Salvar alterações</Button>
        </div>
      )}
      {!editing && msg && <p className="mt-1 text-sm font-medium text-danger">{msg}</p>}
    </div>
  );
}
