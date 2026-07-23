'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, RefreshCw, Building2, AlertTriangle, Plus, Landmark, HandCoins, ArrowLeftRight, History, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterBar, FilterField, FilterSelect, FilterInput } from '@/components/ui/filter-bar';
import { cn } from '@/lib/utils';

/** Denominações (iguais à folha do gerente) + linha "outros". */
const DENOMS = ['200', '100', '50', '20', '10', '5', '2', '1', '0.50', '0.25', '0.10', '0.05'] as const;
const KEYS = [...DENOMS, 'outros'] as const;
type Bal = Record<string, number>;

interface ChangeRequest {
  id: string; unitId: string; unitName?: string; amount: number | null; note: string;
  status: 'OPEN' | 'RESOLVED' | 'CANCELED'; requestedByName: string; createdAt: string;
  resolvedByName: string | null; resolvedNote: string | null; resolvedAt: string | null;
}
export interface VaultUI {
  balances: Bal; total: number; bigNotesTotal: number; bigNotesPct: number;
  buckets: { id: string; name: string; targetValue: number; active: boolean }[];
  recentMovements: { id: string; type: string; bucketName: string | null; totalIn: number; totalOut: number; note: string | null; createdByName: string; createdAt: string; deltas: Bal }[];
  changeRequests: ChangeRequest[];
  openChangeCount: number;
  monthWithdrawals: number;
  lastCountAt: string | null;
}
export interface VaultAlertUI { unitId: string; unitName: string; withdrawals: number; withdrawnTotal: number; vaultTotal: number }
interface UnitOpt { id: string; name: string }

interface MovementRow { id: string; type: string; bucketName: string | null; totalIn: number; totalOut: number; value: number; note: string | null; createdByName: string; createdById: string; createdAt: string; deltas: Bal }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const denomLabel = (k: string) => (k === 'outros' ? 'Outros (PIX/caixinha…)' : Number(k) >= 2 ? `Nota R$ ${k}` : `Moeda R$ ${Number(k).toFixed(2).replace('.', ',')}`);
const TYPE_LABEL: Record<string, { label: string; tone: 'success' | 'medium' | 'critical' | 'neutral' }> = {
  COUNT: { label: 'Conferência', tone: 'neutral' },
  REFILL: { label: 'Reposição de balde', tone: 'success' },
  OFFICE_SWAP: { label: 'Troca c/ escritório', tone: 'medium' },
  REGISTER_CHANGE: { label: 'Troca no caixa', tone: 'success' },
  WITHDRAWAL: { label: '🚨 Retirada (proibida)', tone: 'critical' },
  ADJUST: { label: 'Ajuste', tone: 'neutral' },
};
const dt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

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
const parseNum = (s: string) => parseFloat((s || '0').replace(/\./g, '').replace(',', '.')) || 0;

export function VaultClient({ units, selectedUnitId, vault, alerts, openRequestsNetwork, canOperate, canManageBuckets, canResolve }: {
  units: UnitOpt[]; selectedUnitId: string; vault: VaultUI; alerts: VaultAlertUI[] | null; openRequestsNetwork: ChangeRequest[];
  canOperate: boolean; canManageBuckets: boolean; canResolve: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'cofre' | 'historico'>('cofre');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'none' | 'count' | 'refill' | 'swap' | 'withdrawal' | 'register' | 'request'>('none');
  const [formA, setFormA] = useState<Record<string, string>>(emptyForm());
  const [formB, setFormB] = useState<Record<string, string>>(emptyForm());
  const [note, setNote] = useState('');
  const [bucketId, setBucketId] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [reqAmount, setReqAmount] = useState('');
  const [bName, setBName] = useState('');
  const [bTarget, setBTarget] = useState('');
  const [editBucketId, setEditBucketId] = useState<string | null>(null);
  const [ebName, setEbName] = useState('');
  const [ebTarget, setEbTarget] = useState('');

  const activeBuckets = vault.buckets.filter((b) => b.active);
  const bucketsTotal = useMemo(() => activeBuckets.reduce((t, b) => t + b.targetValue, 0), [activeBuckets]);
  const openRequests = vault.changeRequests.filter((c) => c.status === 'OPEN');
  const networkOpen = openRequestsNetwork.filter((r) => r.unitId !== selectedUnitId);

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
  const reset = () => { setAction('none'); setFormA(emptyForm()); setFormB(emptyForm()); setNote(''); setBucketId(''); setRegisterName(''); setReqAmount(''); };

  return (
    <div className="space-y-4">
      {units.length > 1 && (
        <select className="h-9 rounded-md border bg-card px-2 text-sm font-semibold" value={selectedUnitId} onChange={(e) => router.push(`/modulos/troco?unit=${e.target.value}`)}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}

      {/* Destaque: solicitações de troco abertas em OUTRAS unidades (supervisão) */}
      {canResolve && networkOpen.length > 0 && (
        <div className="rounded-lg border-2 border-accent/50 bg-accent/5 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-brand"><HandCoins className="h-4 w-4 text-accent" /> {networkOpen.length} solicitação(ões) de troco em aberto na rede</p>
          <div className="space-y-1">
            {networkOpen.slice(0, 6).map((r) => (
              <button key={r.id} onClick={() => router.push(`/modulos/troco?unit=${r.unitId}`)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent/10">
                <span className="min-w-0 truncate"><strong>{r.unitName}</strong> — {r.note}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{r.amount ? brl(r.amount) : ''} · {r.requestedByName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-1 border-b">
        {([['cofre', 'Cofre', Wallet], ['historico', 'Histórico', History]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={cn('flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold', tab === key ? 'border-accent text-brand' : 'border-transparent text-muted-foreground hover:text-brand')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'cofre' && (
        <>
          {/* Solicitações de troco DESTA unidade */}
          {(openRequests.length > 0 || canOperate) && (
            <div className={cn('rounded-lg border p-3', openRequests.length > 0 ? 'border-accent/50 bg-accent/5' : 'bg-card')}>
              <div className="mb-1 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-bold text-brand"><HandCoins className="h-4 w-4 text-accent" /> Solicitações de troco{openRequests.length > 0 ? ` (${openRequests.length} aberta(s))` : ''}</p>
                {canOperate && action !== 'request' && <Button size="sm" variant="outline" onClick={() => setAction('request')}>Solicitar troco</Button>}
              </div>
              {action === 'request' && (
                <div className="mb-2 space-y-2 rounded-md border border-dashed p-2">
                  <p className="text-xs text-muted-foreground">A supervisão (supervisor, coordenador e administrador) será avisada na hora.</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-32"><Label className="text-xs">Valor (opcional)</Label><Input inputMode="decimal" value={reqAmount} onChange={(e) => setReqAmount(e.target.value)} placeholder="0,00" className="h-9 text-sm" /></div>
                    <div className="min-w-[12rem] flex-1"><Label className="text-xs">O que precisa</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: R$ 100 em moedas de 0,50 e 0,25" className="h-9 text-sm" /></div>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
                    <Button size="sm" disabled={busy || !note.trim()} onClick={async () => { if (await post({ action: 'requestChange', unitId: selectedUnitId, amount: reqAmount ? parseNum(reqAmount) : null, note })) reset(); }}>Enviar solicitação</Button>
                  </div>
                </div>
              )}
              {openRequests.length === 0 && action !== 'request' && <p className="text-sm text-muted-foreground">Nenhuma solicitação em aberto.</p>}
              <div className="space-y-1.5">
                {openRequests.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2 text-sm">
                    <span className="min-w-0"><strong>{r.amount ? brl(r.amount) : 'Troco'}</strong> — {r.note}<span className="block text-xs text-muted-foreground">{r.requestedByName} · {dt(r.createdAt)}</span></span>
                    <span className="flex gap-1.5">
                      {canResolve && <Button size="sm" variant="gold" disabled={busy} onClick={() => void post({ action: 'resolveChange', id: r.id })}>Atender</Button>}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm('Cancelar esta solicitação?')) void post({ action: 'resolveChange', id: r.id, cancel: true }); }}>Cancelar</Button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
            {activeBuckets.length === 0 && <p className="text-sm text-muted-foreground">Nenhum balde cadastrado{canManageBuckets ? ' — cadastre abaixo' : ' (unidade sem baldes: use "Troca no caixa")'}. </p>}
            <div className="flex flex-wrap gap-2">
              {activeBuckets.map((b) => (
                editBucketId === b.id ? (
                  <span key={b.id} className="flex flex-wrap items-end gap-1.5 rounded-lg border-2 border-accent/40 bg-background p-2">
                    <div><span className="block text-[11px] text-muted-foreground">Nome</span><Input value={ebName} onChange={(e) => setEbName(e.target.value)} className="h-8 w-28 text-sm" /></div>
                    <div><span className="block text-[11px] text-muted-foreground">Alvo (R$)</span><Input inputMode="decimal" value={ebTarget} onChange={(e) => setEbTarget(e.target.value)} className="h-8 w-24 text-sm" /></div>
                    <Button size="sm" disabled={busy || !ebName.trim() || !ebTarget} onClick={async () => { if (await post({ action: 'bucketSet', id: b.id, unitId: selectedUnitId, name: ebName.trim(), targetValue: parseNum(ebTarget) })) setEditBucketId(null); }}>Salvar</Button>
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
                <Button size="sm" disabled={busy || !bName.trim() || !bTarget} onClick={async () => { if (await post({ action: 'bucketSet', unitId: selectedUnitId, name: bName.trim(), targetValue: parseNum(bTarget) })) { setBName(''); setBTarget(''); } }}><Plus className="h-4 w-4" /></Button>
              </div>
            )}
          </div>

          {/* Ações */}
          {canOperate && action === 'none' && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setAction('count')}><ClipboardCheck className="h-4 w-4" /> Conferir cofre</Button>
              <Button variant="outline" disabled={activeBuckets.length === 0} onClick={() => setAction('refill')}><RefreshCw className="h-4 w-4" /> Repor balde</Button>
              <Button variant="outline" onClick={() => setAction('register')}><ArrowLeftRight className="h-4 w-4" /> Troca no caixa</Button>
              <Button variant="outline" onClick={() => setAction('swap')}><Building2 className="h-4 w-4" /> Troca c/ escritório</Button>
              <Button variant="outline" className="col-span-2 border-critical/50 text-critical" onClick={() => setAction('withdrawal')}><AlertTriangle className="h-4 w-4" /> Retirada (proibida)</Button>
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

          {action === 'register' && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-1 text-sm font-bold text-brand">Troca de dinheiro direto no caixa</p>
              <p className="mb-2 text-xs text-muted-foreground">Para unidades sem baldes (ex.: Nova União): o caixa troca notas por moedas/miúdos direto no cofre. Fica registrado no histórico.</p>
              <Input value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="Qual caixa (ex.: Caixa 1)" className="mb-2 h-9 text-sm" />
              <p className="mb-1 text-xs font-bold text-critical">SAIU do cofre (para o caixa):</p>
              <DenomForm values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} />
              <p className="mb-1 mt-3 text-xs font-bold text-success">ENTROU no cofre (do caixa):</p>
              <DenomForm values={formB} onChange={(k, v) => setFormB((s) => ({ ...s, [k]: v }))} />
              <p className="mt-1 text-xs text-muted-foreground">Os dois totais devem ser IGUAIS (é uma troca).</p>
              <div className="mt-2 flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
                <Button size="sm" variant="gold" disabled={busy || !registerName.trim()} onClick={async () => { if (await post({ action: 'registerChange', unitId: selectedUnitId, registerName, outFromVault: toNumbers(formA), inToVault: toNumbers(formB), note })) reset(); }}>Registrar troca</Button>
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

          {/* Movimentações recentes */}
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Movimentações recentes</p>
            {vault.recentMovements.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>}
            <div className="space-y-1.5">
              {vault.recentMovements.map((m) => {
                const t = TYPE_LABEL[m.type] ?? { label: m.type, tone: 'neutral' as const };
                return (
                  <div key={m.id} className={cn('rounded-lg border p-2.5', m.type === 'WITHDRAWAL' ? 'border-critical/50 bg-critical/5' : 'bg-card')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-brand">{t.label}{m.bucketName ? ` — ${m.bucketName}` : ''}</p>
                      <StatusBadge tone={t.tone}>{m.totalIn > 0 && m.totalOut > 0 ? `↔ ${brl(m.totalIn)}` : m.totalIn > 0 ? `+ ${brl(m.totalIn)}` : `− ${brl(m.totalOut)}`}</StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">{m.createdByName} · {dt(m.createdAt)}{m.note ? ` · ${m.note}` : ''}</p>
                  </div>
                );
              })}
            </div>
            {vault.recentMovements.length > 0 && <button onClick={() => setTab('historico')} className="mt-2 text-xs font-semibold text-accent hover:underline">Ver histórico completo →</button>}
          </div>
        </>
      )}

      {tab === 'historico' && <VaultHistory unitId={selectedUnitId} />}
    </div>
  );
}

/* ───────── Histórico filtrável ───────── */
const MOVEMENT_TYPES = [
  { value: 'COUNT', label: 'Conferência' },
  { value: 'REFILL', label: 'Reposição de balde' },
  { value: 'REGISTER_CHANGE', label: 'Troca no caixa' },
  { value: 'OFFICE_SWAP', label: 'Troca c/ escritório' },
  { value: 'WITHDRAWAL', label: 'Retirada (proibida)' },
  { value: 'ADJUST', label: 'Ajuste' },
];

function VaultHistory({ unitId }: { unitId: string }) {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [sort, setSort] = useState('date_desc');

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ unitId, sort });
    if (type) p.set('types', type);
    if (userId) p.set('userId', userId);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (minValue) p.set('minValue', String(parseNum(minValue)));
    if (maxValue) p.set('maxValue', String(parseNum(maxValue)));
    try {
      const res = await fetch(`/api/cash/vault/history?${p.toString()}`, { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setRows(d.rows ?? []); setUsers(d.users ?? []); }
    } finally { setLoading(false); }
  }, [unitId, type, userId, from, to, minValue, maxValue, sort]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = [type, userId, from, to, minValue, maxValue].filter(Boolean).length;
  const clear = () => { setType(''); setUserId(''); setFrom(''); setTo(''); setMinValue(''); setMaxValue(''); };
  const totalOut = rows.reduce((t, r) => t + r.totalOut, 0);
  const totalIn = rows.reduce((t, r) => t + r.totalIn, 0);

  return (
    <div className="space-y-3">
      <FilterBar active={activeCount} onClear={clear}>
        <FilterField label="Tipo"><FilterSelect value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos</option>{MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</FilterSelect></FilterField>
        <FilterField label="Usuário"><FilterSelect value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Todos</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</FilterSelect></FilterField>
        <FilterField label="De"><FilterInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FilterField>
        <FilterField label="Até"><FilterInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FilterField>
        <FilterField label="Valor mín."><FilterInput inputMode="decimal" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="0,00" /></FilterField>
        <FilterField label="Valor máx."><FilterInput inputMode="decimal" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="0,00" /></FilterField>
        <FilterField label="Ordenar">
          <FilterSelect value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="date_desc">Mais recentes</option>
            <option value="date_asc">Mais antigos</option>
            <option value="value_desc">Maior valor</option>
            <option value="value_asc">Menor valor</option>
          </FilterSelect>
        </FilterField>
      </FilterBar>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span><strong className="text-brand">{rows.length}</strong> lançamento(s)</span>
        <span>entradas <strong className="text-success">{brl(totalIn)}</strong></span>
        <span>saídas <strong className="text-critical">{brl(totalOut)}</strong></span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma movimentação com esses filtros.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => {
            const t = TYPE_LABEL[m.type] ?? { label: m.type, tone: 'neutral' as const };
            return (
              <div key={m.id} className={cn('rounded-lg border p-2.5', m.type === 'WITHDRAWAL' ? 'border-critical/50 bg-critical/5' : 'bg-card')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-brand">{t.label}{m.bucketName ? ` — ${m.bucketName}` : ''}</p>
                  <StatusBadge tone={t.tone}>{m.totalIn > 0 && m.totalOut > 0 ? `↔ ${brl(Math.max(m.totalIn, m.totalOut))}` : m.totalIn > 0 ? `+ ${brl(m.totalIn)}` : `− ${brl(m.totalOut)}`}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">{m.createdByName} · {dt(m.createdAt)}{m.note ? ` · ${m.note}` : ''}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
