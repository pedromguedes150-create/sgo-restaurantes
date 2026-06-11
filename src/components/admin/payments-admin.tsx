'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin, ROLE_OPTIONS } from '@/lib/admin-client';
import { formatBRL } from '@/lib/utils';

interface Unit { id: string; name: string }
interface UserOpt { id: string; name: string; role: string }
export interface FreelancerRow { id: string; name: string; defaultValue: number; active: boolean; units: string[] }
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
  const [fUnits, setFUnits] = useState<string[]>([]);
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
          <div>
            <Label>Unidades</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {units.map((u) => <button key={u.id} type="button" onClick={() => setFUnits((s) => s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id])} className={fUnits.includes(u.id) ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</button>)}
            </div>
          </div>
          <Button disabled={busy} className="w-full" onClick={async () => { if (await run({ entity: 'freelancer', action: 'create', name: fName, defaultValue: parseFloat((fValue || '0').replace(',', '.')), unitIds: fUnits })) { setFName(''); setFValue(''); setFUnits([]); } }}><Plus className="h-4 w-4" /> Adicionar freelancer</Button>
        </div>
        {freelancers.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
            <div><p className="font-semibold text-brand">{f.name}</p><p className="text-xs text-muted-foreground">{formatBRL(f.defaultValue)} · {f.units.join(', ')}</p></div>
            <button onClick={() => run({ entity: 'freelancer', action: 'toggle', id: f.id, active: !f.active })}><StatusBadge tone={f.active ? 'success' : 'critical'}>{f.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          </div>
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
          <div key={m.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
            <div><p className="font-semibold text-brand">{m.name}</p><p className="text-xs text-muted-foreground">aprova: {ROLE_OPTIONS.find((r) => r.value === m.approverRole)?.label}</p></div>
            <button onClick={() => run({ entity: 'miscType', action: 'toggle', id: m.id, active: !m.active })}><StatusBadge tone={m.active ? 'success' : 'critical'}>{m.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          </div>
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
