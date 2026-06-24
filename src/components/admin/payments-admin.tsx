'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin, ROLE_OPTIONS } from '@/lib/admin-client';
import { formatBRL } from '@/lib/utils';

interface Unit { id: string; name: string }
interface UserOpt { id: string; name: string; role: string }
export interface FreelancerRow { id: string; name: string; defaultValue: number; pixKey: string | null; active: boolean; units: string[]; unitIds: string[] }
export interface MiscTypeRow { id: string; name: string; approverRole: string; active: boolean }
export interface DelegationRow { id: string; from: string; to: string; period: string }

export function PaymentsAdmin({ units, users, freelancers, miscTypes, delegations }: {
  units: Unit[]; users: UserOpt[]; freelancers: FreelancerRow[]; miscTypes: MiscTypeRow[]; delegations: DelegationRow[];
}) {
  const router = useRouter();
  const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

  // Freelancer
  const [fName, setFName] = useState('');
  const [fValue, setFValue] = useState('');
  const [fPix, setFPix] = useState('');
  const [fUnits, setFUnits] = useState<string[]>([]);
  const [fErr, setFErr] = useState<string | null>(null);
  // Misc type
  const [mName, setMName] = useState('');
  const [mRole, setMRole] = useState('SUPERVISOR');
  // Delegation
  const [dFrom, setDFrom] = useState('');
  const [dTo, setDTo] = useState('');
  const [dStart, setDStart] = useState('');
  const [dEnd, setDEnd] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(payload: Record<string, unknown>) {
    setBusy(true);
    const r = await postAdmin(payload);
    setBusy(false);
    if (r.ok) router.refresh();
    else alert(r.error ?? 'Falha');
    return r.ok;
  }

  return (
    <div className="space-y-6">
      {/* Freelancers */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Freelancers</h2>
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Nome</Label><Input value={fName} onChange={(e) => setFName(e.target.value)} /></div>
            <div><Label>Valor padrão (R$)</Label><Input inputMode="decimal" value={fValue} onChange={(e) => setFValue(e.target.value)} /></div>
          </div>
          <div><Label>Chave PIX (obrigatória)</Label><Input value={fPix} onChange={(e) => setFPix(e.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" /></div>
          <div>
            <Label>Unidades</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {units.map((u) => <button key={u.id} type="button" onClick={() => setFUnits((s) => s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id])} className={fUnits.includes(u.id) ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</button>)}
            </div>
          </div>
          <Button disabled={busy} className="w-full" onClick={async () => {
            setFErr(null);
            const valor = parseFloat((fValue || '').replace(/\./g, '').replace(',', '.'));
            if (!fName.trim()) { setFErr('Informe o nome do freelancer.'); return; }
            if (!(valor > 0)) { setFErr('Informe o valor padrão (maior que zero).'); return; }
            if (!fPix.trim()) { setFErr('Informe a chave PIX do freelancer.'); return; }
            if (fUnits.length === 0) { setFErr('Selecione ao menos uma unidade (toque no nome da unidade acima).'); return; }
            if (await run({ entity: 'freelancer', action: 'create', name: fName, defaultValue: valor, pixKey: fPix, unitIds: fUnits })) { setFName(''); setFValue(''); setFPix(''); setFUnits([]); }
          }}><Plus className="h-4 w-4" /> Adicionar freelancer</Button>
          {fErr && <p className="text-sm font-medium text-critical">{fErr}</p>}
        </div>
        {freelancers.map((f) => (
          <FreelancerItem key={f.id} f={f} units={units} onChange={() => router.refresh()} />
        ))}
      </section>

      {/* Tipos de avulso */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Tipos de pagamento avulso</h2>
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Nome</Label><Input value={mName} onChange={(e) => setMName(e.target.value)} /></div>
            <div><Label>Aprovador</Label><select className={sel} value={mRole} onChange={(e) => setMRole(e.target.value)}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
          </div>
          <Button disabled={busy} className="w-full" onClick={async () => { if (await run({ entity: 'miscType', action: 'create', name: mName, approverRole: mRole })) setMName(''); }}><Plus className="h-4 w-4" /> Adicionar tipo</Button>
        </div>
        {miscTypes.map((m) => (
          <MiscTypeItem key={m.id} m={m} onChange={() => router.refresh()} />
        ))}
      </section>

      {/* Delegações */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Delegação de aprovação (por período)</h2>
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>De (aprovador)</Label><select className={sel} value={dFrom} onChange={(e) => setDFrom(e.target.value)}><option value="">Selecione…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><Label>Para (substituto)</Label><select className={sel} value={dTo} onChange={(e) => setDTo(e.target.value)}><option value="">Selecione…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><Label>Início</Label><Input type="date" value={dStart} onChange={(e) => setDStart(e.target.value)} /></div>
            <div><Label>Fim</Label><Input type="date" value={dEnd} onChange={(e) => setDEnd(e.target.value)} /></div>
          </div>
          <Button disabled={busy} className="w-full" onClick={async () => { if (await run({ entity: 'delegation', action: 'create', fromUserId: dFrom, toUserId: dTo, startsAt: dStart, endsAt: dEnd })) { setDFrom(''); setDTo(''); setDStart(''); setDEnd(''); } }}><Plus className="h-4 w-4" /> Criar delegação</Button>
        </div>
        {delegations.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
            <div><p className="font-semibold text-brand">{d.from} → {d.to}</p><p className="text-xs text-muted-foreground">{d.period}</p></div>
            <button onClick={() => run({ entity: 'delegation', action: 'delete', id: d.id })} aria-label="Excluir"><Trash2 className="h-5 w-5 text-critical" /></button>
          </div>
        ))}
        {delegations.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma delegação ativa.</p>}
      </section>
    </div>
  );
}

const SEL = 'h-10 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

function FreelancerItem({ f, units, onChange }: { f: FreelancerRow; units: Unit[]; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.name);
  const [value, setValue] = useState(String(f.defaultValue).replace('.', ','));
  const [pix, setPix] = useState(f.pixKey ?? '');
  const [unitIds, setUnitIds] = useState<string[]>(f.unitIds);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(payload: Record<string, unknown>, after?: () => void) {
    setBusy(true); setMsg(null);
    const r = await postAdmin(payload);
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    after?.(); onChange();
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div><p className="font-semibold text-brand">{f.name}</p><p className="text-xs text-muted-foreground">{formatBRL(f.defaultValue)} · PIX: {f.pixKey || <span className="text-critical">não cadastrada</span>} · {f.units.join(', ')}</p></div>
        <div className="flex items-center gap-1">
          <button onClick={() => call({ entity: 'freelancer', action: 'toggle', id: f.id, active: !f.active })}><StatusBadge tone={f.active ? 'success' : 'critical'}>{f.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm(`Excluir o freelancer "${f.name}"? Só é possível se não houver pagamentos vinculados. Caso contrário, inative-o.`)) call({ entity: 'freelancer', action: 'delete', id: f.id }); }} aria-label="Excluir" className="text-critical"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
            <div><Label className="text-xs">Valor padrão (R$)</Label><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="h-10 text-sm" /></div>
          </div>
          <div><Label className="text-xs">Chave PIX</Label><Input value={pix} onChange={(e) => setPix(e.target.value)} className="h-10 text-sm" placeholder="chave PIX" /></div>
          <div>
            <Label className="text-xs">Unidades</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {units.map((u) => <button key={u.id} type="button" onClick={() => setUnitIds((s) => s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id])} className={unitIds.includes(u.id) ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</button>)}
            </div>
          </div>
          <Button size="sm" className="w-full" disabled={busy} onClick={() => { if (!pix.trim()) { setMsg('Informe a chave PIX.'); return; } call({ entity: 'freelancer', action: 'update', id: f.id, name, defaultValue: parseFloat((value || '0').replace(',', '.')), pixKey: pix, unitIds }, () => setEditing(false)); }}><Save className="h-4 w-4" /> Salvar alterações</Button>
        </div>
      )}
      {msg && <p className="mt-1 text-sm font-medium text-critical">{msg}</p>}
    </div>
  );
}

function MiscTypeItem({ m, onChange }: { m: MiscTypeRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  const [role, setRole] = useState(m.approverRole);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(payload: Record<string, unknown>, after?: () => void) {
    setBusy(true); setMsg(null);
    const r = await postAdmin(payload);
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    after?.(); onChange();
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div><p className="font-semibold text-brand">{m.name}</p><p className="text-xs text-muted-foreground">aprova: {ROLE_OPTIONS.find((r) => r.value === m.approverRole)?.label}</p></div>
        <div className="flex items-center gap-1">
          <button onClick={() => call({ entity: 'miscType', action: 'toggle', id: m.id, active: !m.active })}><StatusBadge tone={m.active ? 'success' : 'critical'}>{m.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm(`Excluir o tipo "${m.name}"? Só é possível se não houver pagamentos vinculados. Caso contrário, inative-o.`)) call({ entity: 'miscType', action: 'delete', id: m.id }); }} aria-label="Excluir" className="text-critical"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2">
          <div><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">Aprovador</Label><select className={SEL} value={role} onChange={(e) => setRole(e.target.value)}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
          <Button size="sm" className="col-span-2" disabled={busy} onClick={() => call({ entity: 'miscType', action: 'update', id: m.id, name, approverRole: role }, () => setEditing(false))}><Save className="h-4 w-4" /> Salvar alterações</Button>
        </div>
      )}
      {msg && <p className="col-span-2 mt-1 text-sm font-medium text-critical">{msg}</p>}
    </div>
  );
}
