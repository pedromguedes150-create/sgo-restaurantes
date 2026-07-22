'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, RefreshCw, Building2, AlertTriangle, Plus, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

/** Denominações (iguais à folha do gerente) + linha "outros". */
const DENOMS = ['200', '100', '50', '20', '10', '5', '2', '1', '0.50', '0.25', '0.10', '0.05'] as const;
const KEYS = [...DENOMS, 'outros'] as const;
type Bal = Record<string, number>;

export interface VaultUI {
  balances: Bal; total: number; bigNotesTotal: number; bigNotesPct: number;
  buckets: { id: string; name: string; targetValue: number; active: boolean }[];
  movements: { id: string; type: string; bucketName: string | null; totalIn: number; totalOut: number; note: string | null; createdByName: string; createdAt: string; deltas: Bal }[];
  monthWithdrawals: number;
  lastCountAt: string | null;
}
export interface VaultAlertUI { unitId: string; unitName: string; withdrawals: number; withdrawnTotal: number; vaultTotal: number }
interface UnitOpt { id: string; name: string }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const denomLabel = (k: string) => (k === 'outros' ? 'Outros (PIX/caixinha…)' : Number(k) >= 2 ? `Nota R$ ${k}` : `Moeda R$ ${Number(k).toFixed(2).replace('.', ',')}`);
const TYPE_LABEL: Record<string, { label: string; tone: 'success' | 'medium' | 'critical' | 'neutral' }> = {
  COUNT: { label: 'Conferência', tone: 'neutral' },
  REFILL: { label: 'Reposição de balde', tone: 'success' },
  OFFICE_SWAP: { label: 'Troca c/ escritório', tone: 'medium' },
  WITHDRAWAL: { label: '🚨 Retirada (proibida)', tone: 'critical' },
  ADJUST: { label: 'Ajuste', tone: 'neutral' },
};

/** Tabela de denominações (valor em R$ por linha, total automático). */
function DenomForm({ values, onChange, only }: { values: Record<string, string>; onChange: (k: string, v: string) => void; only?: 'big' | 'small' }) {
  const keys = only === 'big' ? ['200', '100', '50', '20'] : only === 'small' ? ['10', '5', '2', '1', '0.50', '0.25', '0.10', '0.05'] : [...KEYS];
  const total = keys.reduce((t, k) => t + (parseFloat((values[k] || '0').replace(/\./g, '').replace(',', '.')) || 0), 0);
  return (
    <div className="space-y-1">
      {keys.map((k) => {
        const denom = Number(k);
        const v = parseFloat((values[k] || '0').replace(/\./g, '').replace(',', '.')) || 0;
        const badMultiple = k !== 'outros' && v > 0 && Math.abs(Math.round(v / denom) * denom - v) > 0.011;
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="w-40 shrink-0 text-sm">{denomLabel(k)}</span>
            <Input inputMode="decimal" value={values[k] ?? ''} onChange={(e) => onChange(k, e.target.value)} placeholder="0,00" className={cn('h-9 flex-1 text-right text-sm tabular-nums', badMultiple && 'border-medium')} />
          </div>
        );
      })}
      <p className="pt-1 text-right text-sm font-bold tabular-nums">Total: {brl(total)}</p>
    </div>
  );
}
const emptyForm = () => Object.fromEntries(KEYS.map((k) => [k, ''])) as Record<string, string>;
const toNumbers = (v: Record<string, string>): Bal => Object.fromEntries(KEYS.map((k) => [k, parseFloat((v[k] || '0').replace(/\./g, '').replace(',', '.')) || 0]));

export function VaultClient({ units, selectedUnitId, vault, alerts, canOperate, canManageBuckets }: {
  units: UnitOpt[]; selectedUnitId: string; vault: VaultUI; alerts: VaultAlertUI[] | null;
  canOperate: boolean; canManageBuckets: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'none' | 'count' | 'refill' | 'swap' | 'withdrawal'>('none');
  const [formA, setFormA] = useState<Record<string, string>>(emptyForm()); // conferência / saiu / retirada
  const [formB, setFormB] = useState<Record<string, string>>(emptyForm()); // entrou
  const [note, setNote] = useState('');
  const [bucketId, setBucketId] = useState('');
  const [bName, setBName] = useState('');
  const [bTarget, setBTarget] = useState('');
  // edição de balde (nome + valor) — 20/07
  const [editBucketId, setEditBucketId] = useState<string | null>(null);
  const [ebName, setEbName] = useState('');
  const [ebTarget, setEbTarget] = useState('');

  const activeBuckets = vault.buckets.filter((b) => b.active);
  const bucketsTotal = useMemo(() => activeBuckets.reduce((t, b) => t + b.targetValue, 0), [activeBuckets]);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/cash/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { router.refresh(); return true; }
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? 'Falha');
      return false;
    } finally { setBusy(false); }
  }
  const reset = () => { setAction('none'); setFormA(emptyForm()); setFormB(emptyForm()); setNote(''); setBucketId(''); };

  return (
    <div className="space-y-4">
      {units.length > 1 && (
        <select className="h-9 rounded-md border bg-card px-2 text-sm font-semibold" value={selectedUnitId} onChange={(e) => router.push(`/modulos/troco?unit=${e.target.value}`)}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}

      {/* Saldo do cofre (como a folha) */}
      <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-bold text-brand"><Landmark className="h-4 w-4 text-accent" /> Cofre da unidade</p>
          <p className="text-lg font-black tabular-nums text-brand">{brl(vault.total)}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {vault.lastCountAt ? `Última conferência: ${new Date(vault.lastCountAt).toLocaleDateString('pt-BR')}` : 'Nenhuma conferência ainda — lance a posição inicial em "Conferir cofre".'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
          {KEYS.map((k) => (
            <p key={k} className="flex justify-between text-xs tabular-nums">
              <span className="text-muted-foreground">{k === 'outros' ? 'Outros' : `R$ ${k.replace('.', ',')}`}</span>
              <span className={cn('font-semibold', (vault.balances[k] || 0) === 0 && 'text-muted-foreground/50')}>{brl(vault.balances[k] || 0)}</span>
            </p>
          ))}
        </div>
        <div className={cn('mt-2 rounded-md px-2 py-1 text-xs font-semibold', vault.bigNotesPct >= 50 ? 'bg-critical/10 text-critical' : 'bg-surface text-muted-foreground')}>
          Notas grandes (50/100/200): {brl(vault.bigNotesTotal)} ({vault.bigNotesPct}% do cofre){vault.bigNotesPct >= 50 ? ' — hora de pedir troca ao escritório!' : ''}
        </div>
        {vault.monthWithdrawals > 0 && (
          <p className="mt-1 rounded-md bg-critical/10 px-2 py-1 text-xs font-bold text-critical">🚨 {vault.monthWithdrawals} retirada(s) para pagamento neste mês — prática proibida, supervisão avisada.</p>
        )}
      </div>

      {/* Baldes */}
      <div className="rounded-lg border bg-card p-3">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Baldes dos caixas (valor-alvo fixado pela supervisão) — soma {brl(bucketsTotal)}</p>
        {activeBuckets.length === 0 && <p className="text-sm text-muted-foreground">Nenhum balde cadastrado{canManageBuckets ? ' — cadastre abaixo' : ' (peça à supervisão)'}. </p>}
        <div className="flex flex-wrap gap-2">
          {activeBuckets.map((b) => (
            editBucketId === b.id ? (
              <span key={b.id} className="flex flex-wrap items-end gap-1.5 rounded-lg border-2 border-accent/40 bg-background p-2">
                <div><span className="block text-[11px] text-muted-foreground">Nome</span><Input value={ebName} onChange={(e) => setEbName(e.target.value)} className="h-8 w-28 text-sm" /></div>
                <div><span className="block text-[11px] text-muted-foreground">Alvo (R$)</span><Input inputMode="decimal" value={ebTarget} onChange={(e) => setEbTarget(e.target.value)} className="h-8 w-24 text-sm" /></div>
                <Button size="sm" disabled={busy || !ebName.trim() || !ebTarget} onClick={async () => { if (await post({ action: 'bucketSet', id: b.id, unitId: selectedUnitId, name: ebName.trim(), targetValue: parseFloat(ebTarget.replace(/\./g, '').replace(',', '.')) })) setEditBucketId(null); }}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditBucketId(null)}>Cancelar</Button>
              </span>
            ) : (
              <span key={b.id} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold">{b.name} · {brl(b.targetValue)}
                {canManageBuckets && (
                  <>
                    <button className="text-xs text-accent underline" disabled={busy} onClick={() => { setEditBucketId(b.id); setEbName(b.name); setEbTarget(String(b.targetValue).replace('.', ',')); }}>editar</button>
                    <button className="text-xs text-critical underline" disabled={busy} onClick={() => { if (confirm(`Excluir o balde "${b.name}"? Esta ação não pode ser desfeita (o histórico de movimentos mantém o nome).`)) void post({ action: 'bucketDelete', id: b.id }); }}>excluir</button>
                  </>
                )}
              </span>
            )
          ))}
        </div>
        {canManageBuckets && (
          <div className="mt-2 flex items-end gap-1.5">
            <div className="flex-1"><Label className="text-xs">Novo balde</Label><Input value={bName} onChange={(e) => setBName(e.target.value)} placeholder="ex.: Caixa 1" className="h-9 text-sm" /></div>
            <div className="w-28"><Label className="text-xs">Alvo (R$)</Label><Input inputMode="decimal" value={bTarget} onChange={(e) => setBTarget(e.target.value)} placeholder="0,00" className="h-9 text-sm" /></div>
            <Button size="sm" disabled={busy || !bName.trim() || !bTarget} onClick={async () => { if (await post({ action: 'bucketSet', unitId: selectedUnitId, name: bName.trim(), targetValue: parseFloat(bTarget.replace(/\./g, '').replace(',', '.')) })) { setBName(''); setBTarget(''); } }}><Plus className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      {/* Ações */}
      {canOperate && action === 'none' && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setAction('count')}><ClipboardCheck className="h-4 w-4" /> Conferir cofre</Button>
          <Button variant="outline" disabled={activeBuckets.length === 0} onClick={() => setAction('refill')}><RefreshCw className="h-4 w-4" /> Repor balde</Button>
          <Button variant="outline" onClick={() => setAction('swap')}><Building2 className="h-4 w-4" /> Troca c/ escritório</Button>
          <Button variant="outline" className="border-critical/50 text-critical" onClick={() => setAction('withdrawal')}><AlertTriangle className="h-4 w-4" /> Retirada (proibida)</Button>
        </div>
      )}

      {action === 'count' && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-1 text-sm font-bold text-brand">Conferência do cofre (rotina diária)</p>
          <p className="mb-2 text-xs text-muted-foreground">Lance o VALOR EM R$ contado de cada denominação (como na folha). Isso substitui o saldo do cofre.</p>
          <DenomForm values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="mt-2 h-9 text-sm" />
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
            <Button size="sm" variant="gold" disabled={busy} onClick={async () => { if (await post({ action: 'count', unitId: selectedUnitId, balances: toNumbers(formA), note })) reset(); }}>Salvar conferência</Button>
          </div>
        </div>
      )}

      {action === 'refill' && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-1 text-sm font-bold text-brand">Repor balde (troca 1:1)</p>
          <select className="mb-2 h-10 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
            <option value="">Qual balde…</option>
            {activeBuckets.map((b) => <option key={b.id} value={b.id}>{b.name} (alvo {brl(b.targetValue)})</option>)}
          </select>
          <p className="mb-1 text-xs font-bold text-critical">SAIU do cofre (miúdos p/ o balde):</p>
          <DenomForm values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} only="small" />
          <p className="mb-1 mt-3 text-xs font-bold text-success">ENTROU no cofre (notas grandes do balde):</p>
          <DenomForm values={formB} onChange={(k, v) => setFormB((s) => ({ ...s, [k]: v }))} only="big" />
          <p className="mt-1 text-xs text-muted-foreground">Os dois totais devem ser IGUAIS (é uma troca).</p>
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
            <Button size="sm" variant="gold" disabled={busy || !bucketId} onClick={async () => { if (await post({ action: 'refill', unitId: selectedUnitId, bucketId, outSmall: toNumbers(formA), inBig: toNumbers(formB), note })) reset(); }}>Registrar reposição</Button>
          </div>
        </div>
      )}

      {action === 'swap' && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-1 text-sm font-bold text-brand">Troca com o escritório</p>
          <p className="mb-1 text-xs font-bold text-critical">ENVIADO ao escritório (notas grandes):</p>
          <DenomForm values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} only="big" />
          <p className="mb-1 mt-3 text-xs font-bold text-success">RECEBIDO do escritório (moedas/miúdos):</p>
          <DenomForm values={formB} onChange={(k, v) => setFormB((s) => ({ ...s, [k]: v }))} only="small" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="mt-2 h-9 text-sm" />
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
            <Button size="sm" variant="gold" disabled={busy} onClick={async () => { if (await post({ action: 'officeSwap', unitId: selectedUnitId, outBig: toNumbers(formA), inSmall: toNumbers(formB), note })) reset(); }}>Registrar troca</Button>
          </div>
        </div>
      )}

      {action === 'withdrawal' && (
        <div className="rounded-lg border-2 border-critical/60 bg-critical/5 p-3">
          <p className="mb-1 text-sm font-bold text-critical">🚨 Retirada do troco para pagamento — PRÁTICA PROIBIDA</p>
          <p className="mb-2 text-xs text-critical">A supervisão e os administradores serão avisados NA HORA. Use apenas em emergência real e reponha o valor.</p>
          <DenomForm values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo da retirada (obrigatório)" className="mt-2 h-9 text-sm" />
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
            <Button size="sm" variant="destructive" disabled={busy || !note.trim()} onClick={async () => {
              if (!confirm('Confirma a retirada PROIBIDA do troco? A supervisão será avisada imediatamente.')) return;
              if (await post({ action: 'withdrawal', unitId: selectedUnitId, amounts: toNumbers(formA), reason: note })) reset();
            }}>Confirmar retirada</Button>
          </div>
        </div>
      )}

      {/* Alertas por unidade (supervisão) */}
      {alerts && alerts.length > 0 && (
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Cofres da rede — retiradas no mês</p>
          <div className="space-y-1">
            {alerts.map((a) => (
              <div key={a.unitId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{a.unitName}</span>
                <span className="shrink-0 text-xs tabular-nums">
                  cofre {brl(a.vaultTotal)} · <span className={a.withdrawals > 0 ? 'font-bold text-critical' : 'font-semibold text-success'}>{a.withdrawals} retirada(s){a.withdrawals > 0 ? ` (${brl(a.withdrawnTotal)})` : ''}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movimentações */}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Movimentações ({vault.movements.length})</p>
        {vault.movements.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>}
        <div className="space-y-1.5">
          {vault.movements.map((m) => {
            const t = TYPE_LABEL[m.type] ?? { label: m.type, tone: 'neutral' as const };
            return (
              <div key={m.id} className={cn('rounded-lg border p-2.5', m.type === 'WITHDRAWAL' ? 'border-critical/50 bg-critical/5' : 'bg-card')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-brand">{t.label}{m.bucketName ? ` — ${m.bucketName}` : ''}</p>
                  <StatusBadge tone={t.tone}>{m.totalIn > 0 && m.totalOut > 0 ? `↔ ${brl(m.totalIn)}` : m.totalIn > 0 ? `+ ${brl(m.totalIn)}` : `− ${brl(m.totalOut)}`}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">{m.createdByName} · {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{m.note ? ` · ${m.note}` : ''}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
