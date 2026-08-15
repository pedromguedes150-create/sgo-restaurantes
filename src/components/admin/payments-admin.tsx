'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pencil, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { postAdmin, ROLE_OPTIONS } from '@/lib/admin-client';
import { formatBRL } from '@/lib/utils';

interface Unit { id: string; name: string }
interface UserOpt { id: string; name: string; role: string }
export interface FreelancerRow { id: string; name: string; defaultValue: number; pixKey: string | null; active: boolean; units: string[]; unitIds: string[]; sectorRates: { sectorName: string; dayValue: number }[] }
export interface MiscTypeRow { id: string; name: string; approverRole: string; active: boolean }
export interface DelegationRow { id: string; from: string; to: string; period: string }

export function PaymentsAdmin({ units, users, freelancers, miscTypes, delegations }: {
  units: Unit[]; users: UserOpt[]; freelancers: FreelancerRow[]; miscTypes: MiscTypeRow[]; delegations: DelegationRow[];
}) {
  const router = useRouter();

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
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Freelancers</h2>
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Nome</Label><Input value={fName} onChange={(e) => setFName(e.target.value)} /></div>
            <div><Label>Valor padrão (R$)</Label><Input inputMode="decimal" value={fValue} onChange={(e) => setFValue(e.target.value)} /></div>
          </div>
          <div><Label>Chave PIX (obrigatória)</Label><Input value={fPix} onChange={(e) => setFPix(e.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" /></div>
          <div>
            <Label>Unidades</Label>
            <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={fUnits} onChange={setFUnits} placeholder="Escolha as unidades…" searchable={units.length > 6} />
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
          {fErr && <p className="text-sm font-medium text-danger">{fErr}</p>}
        </div>
        {freelancers.map((f) => (
          <FreelancerItem key={f.id} f={f} units={units} onChange={() => router.refresh()} />
        ))}
      </section>

      {/* Tipos de avulso */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Tipos de pagamento avulso</h2>
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Nome</Label><Input value={mName} onChange={(e) => setMName(e.target.value)} /></div>
            <Select label="Aprovador" value={mRole} onValueChange={setMRole} options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))} />
          </div>
          <Button disabled={busy} className="w-full" onClick={async () => { if (await run({ entity: 'miscType', action: 'create', name: mName, approverRole: mRole })) setMName(''); }}><Plus className="h-4 w-4" /> Adicionar tipo</Button>
        </div>
        {miscTypes.map((m) => (
          <MiscTypeItem key={m.id} m={m} onChange={() => router.refresh()} />
        ))}
      </section>

      {/* Delegações */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Delegação de aprovação (por período)</h2>
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Select label="De (aprovador)" placeholder="Selecione…" value={dFrom} onValueChange={setDFrom} options={users.map((u) => ({ value: u.id, label: u.name }))} />
            <Select label="Para (substituto)" placeholder="Selecione…" value={dTo} onValueChange={setDTo} options={users.map((u) => ({ value: u.id, label: u.name }))} />
            <DatePicker label="Início" value={dStart || null} onValueChange={(v) => setDStart(v ?? '')} />
            <DatePicker label="Fim" min={dStart || undefined} value={dEnd || null} onValueChange={(v) => setDEnd(v ?? '')} />
          </div>
          <Button disabled={busy} className="w-full" onClick={async () => { if (await run({ entity: 'delegation', action: 'create', fromUserId: dFrom, toUserId: dTo, startsAt: dStart, endsAt: dEnd })) { setDFrom(''); setDTo(''); setDStart(''); setDEnd(''); } }}><Plus className="h-4 w-4" /> Criar delegação</Button>
        </div>
        {delegations.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border bg-surface p-3">
            <div><p className="font-semibold text-brand">{d.from} → {d.to}</p><p className="text-xs text-ink-500">{d.period}</p></div>
            <button onClick={() => run({ entity: 'delegation', action: 'delete', id: d.id })} aria-label="Excluir"><Trash2 className="h-5 w-5 text-danger" /></button>
          </div>
        ))}
        {delegations.length === 0 && <p className="text-sm text-ink-500">Nenhuma delegação ativa.</p>}
      </section>
    </div>
  );
}


function FreelancerItem({ f, units, onChange }: { f: FreelancerRow; units: Unit[]; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.name);
  const [value, setValue] = useState(String(f.defaultValue).replace('.', ','));
  const [pix, setPix] = useState(f.pixKey ?? '');
  const [unitIds, setUnitIds] = useState<string[]>(f.unitIds);
  const [secName, setSecName] = useState('');
  const [secValue, setSecValue] = useState('');
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
    <div className="rounded-lg border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div><p className="font-semibold text-brand">{f.name}</p><p className="text-xs text-ink-500">{formatBRL(f.defaultValue)} · PIX: {f.pixKey || <span className="text-danger">não cadastrada</span>} · {f.units.join(', ')}{f.sectorRates.length > 0 ? ` · ${f.sectorRates.length} setor(es) c/ valor-dia` : ''}</p></div>
        <div className="flex items-center gap-1">
          <button onClick={() => call({ entity: 'freelancer', action: 'toggle', id: f.id, active: !f.active })}><StatusBadge tone={f.active ? 'success' : 'critical'}>{f.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm(`Excluir o freelancer "${f.name}"? Só é possível se não houver pagamentos vinculados. Caso contrário, inative-o.`)) call({ entity: 'freelancer', action: 'delete', id: f.id }); }} aria-label="Excluir" className="text-danger"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 space-y-2 rounded-lg bg-sunken/40 p-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
            <div><Label className="text-xs">Valor padrão (R$)</Label><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="h-10 text-sm" /></div>
          </div>
          <div><Label className="text-xs">Chave PIX</Label><Input value={pix} onChange={(e) => setPix(e.target.value)} className="h-10 text-sm" placeholder="chave PIX" /></div>
          <div>
            <Label className="text-xs">Unidades</Label>
            <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
          </div>
          <Button size="sm" className="w-full" disabled={busy} onClick={() => { if (!pix.trim()) { setMsg('Informe a chave PIX.'); return; } call({ entity: 'freelancer', action: 'update', id: f.id, name, defaultValue: parseFloat((value || '0').replace(',', '.')), pixKey: pix, unitIds }, () => setEditing(false)); }}><Save className="h-4 w-4" /> Salvar alterações</Button>

          {/* Cobertura temporária de setor (16/07): valor por DIA por setor */}
          <div className="rounded-md border border-dashed p-2">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Cobertura de setor — valor por dia</p>
            {f.sectorRates.length === 0 && <p className="text-xs text-ink-500">Nenhum setor cadastrado. Com setor + valor/dia, o gerente pode lançar &quot;cobertura temporária de setor&quot; (valor fechado do dia + VT).</p>}
            {f.sectorRates.map((r) => (
              <div key={r.sectorName} className="flex items-center justify-between gap-2 py-0.5 text-sm">
                <span>{r.sectorName} — <b>{formatBRL(r.dayValue)}</b>/dia</span>
                <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => call({ entity: 'freelancerSector', action: 'delete', freelancerId: f.id, sectorName: r.sectorName })} aria-label="Remover setor"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            <div className="mt-1 flex items-end gap-1.5">
              <div className="flex-1"><Label className="text-xs">Setor</Label><Input value={secName} onChange={(e) => setSecName(e.target.value)} placeholder="ex.: Churrasqueira" className="h-9 text-sm" /></div>
              <div className="w-28"><Label className="text-xs">R$/dia</Label><Input inputMode="decimal" value={secValue} onChange={(e) => setSecValue(e.target.value)} placeholder="0,00" className="h-9 text-sm" /></div>
              <Button size="sm" disabled={busy || !secName.trim() || !secValue} onClick={() => call({ entity: 'freelancerSector', action: 'set', freelancerId: f.id, sectorName: secName.trim(), dayValue: parseFloat(secValue.replace(',', '.')) }, () => { setSecName(''); setSecValue(''); })}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
      {msg && <p className="mt-1 text-sm font-medium text-danger">{msg}</p>}
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
    <div className="rounded-lg border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div><p className="font-semibold text-brand">{m.name}</p><p className="text-xs text-ink-500">aprova: {ROLE_OPTIONS.find((r) => r.value === m.approverRole)?.label}</p></div>
        <div className="flex items-center gap-1">
          <button onClick={() => call({ entity: 'miscType', action: 'toggle', id: m.id, active: !m.active })}><StatusBadge tone={m.active ? 'success' : 'critical'}>{m.active ? 'Ativo' : 'Inativo'}</StatusBadge></button>
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Editar">{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm(`Excluir o tipo "${m.name}"? Só é possível se não houver pagamentos vinculados. Caso contrário, inative-o.`)) call({ entity: 'miscType', action: 'delete', id: m.id }); }} aria-label="Excluir" className="text-danger"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-sunken/40 p-2">
          <div><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" /></div>
          <Select label="Aprovador" size="sm" value={role} onValueChange={setRole} options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))} />
          <Button size="sm" className="col-span-2" disabled={busy} onClick={() => call({ entity: 'miscType', action: 'update', id: m.id, name, approverRole: role }, () => setEditing(false))}><Save className="h-4 w-4" /> Salvar alterações</Button>
        </div>
      )}
      {msg && <p className="col-span-2 mt-1 text-sm font-medium text-danger">{msg}</p>}
    </div>
  );
}
