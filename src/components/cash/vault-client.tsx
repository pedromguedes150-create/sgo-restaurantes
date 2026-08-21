'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, RefreshCw, Building2, AlertTriangle, Plus, Landmark, HandCoins, ArrowLeftRight, History, Wallet, Wand2, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterBar, FilterSelect, FilterInput, FilterDate } from '@/components/ui/filter-bar';
import { Button as DsButton } from '@/components/ui/ds/button';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { Banner } from '@/components/ui/ds/banner';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
import { cn } from '@/lib/utils';

type Bal = Record<string, number>;
/** Denominação vinda da configuração da unidade (dirige rótulos e blocos). */
interface DenomView { key: string; label: string; value: number | null; kind: 'NOTE' | 'COIN' | 'OTHER'; isSmall: boolean; isBig: boolean; countsAsBigIndicator: boolean }

interface ChangeRequest {
  id: string; unitId: string; unitName?: string; amount: number | null; note: string;
  status: 'OPEN' | 'SENT' | 'RECEIVED' | 'RESOLVED' | 'CANCELED'; requestedByName: string; createdAt: string;
  resolvedByName: string | null; resolvedNote: string | null; resolvedAt: string | null;
  /** Detalhe por denominação. Vazio nos pedidos antigos, que eram texto livre. */
  need?: Bal; give?: Bal; needTotal?: number; giveTotal?: number;
  /** Envio pelo escritório e recebimento confirmado pelo gerente. */
  sent?: Bal; sentTotal?: number; sentByName?: string | null; sentAt?: string | null; sentNote?: string | null;
  received?: Bal; receivedTotal?: number; receivedByName?: string | null; receivedAt?: string | null; receivedNote?: string | null;
  divergent?: boolean;
  /** Os dois lados fecham 1:1 — atender aplica a troca no cofre sozinho. */
  autoApply?: boolean;
}
export interface VaultUI {
  balances: Bal; total: number; denominations: DenomView[]; bigNotesTotal: number; bigNotesPct: number;
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
/** Rótulo curto de uma chave legado (fora da config atual da unidade). */
const legacyLabel = (k: string) => (k === 'outros' ? 'Outros' : `R$ ${k.replace('.', ',')} (legado)`);
const TYPE_LABEL: Record<string, { label: string; tone: 'success' | 'medium' | 'critical' | 'neutral' }> = {
  COUNT: { label: 'Conferência', tone: 'neutral' },
  REFILL: { label: 'Reposição de balde', tone: 'success' },
  OFFICE_SWAP: { label: 'Troca c/ escritório', tone: 'medium' },
  REGISTER_CHANGE: { label: 'Troca no caixa', tone: 'success' },
  WITHDRAWAL: { label: '🚨 Retirada (proibida)', tone: 'critical' },
  ADJUST: { label: 'Ajuste', tone: 'neutral' },
};
const dt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

const parseNum = (s: string) => parseFloat((s || '0').replace(/\./g, '').replace(',', '.')) || 0;

/** Tabela de denominações (valor em R$ por linha, total automático) — orientada à config. */
function DenomForm({ list, values, onChange }: { list: DenomView[]; values: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const total = list.reduce((t, d) => t + parseNum(values[d.key] || '0'), 0);
  return (
    <div className="space-y-1">
      {list.map((d) => {
        const v = parseNum(values[d.key] || '0');
        const badMultiple = d.value != null && v > 0 && Math.abs(Math.round(v / d.value) * d.value - v) > 0.011;
        return (
          /* Rótulo estreito no celular e `min-w-0` no campo: o <input> tem largura
             intrínseca própria e, sem isso, não encolhe abaixo dela — em 375px a
             grade estourava 50px e a página rolava de lado (valia para a
             conferência diária também, não só para o pedido de troco). */
          <div key={d.key} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm sm:w-40">{d.label}</span>
            <Input inputMode="decimal" value={values[d.key] ?? ''} onChange={(e) => onChange(d.key, e.target.value)} placeholder="0,00" className={cn('h-9 min-w-0 flex-1 text-right text-sm tabular-nums', badMultiple && 'border-warning')} />
          </div>
        );
      })}
      <p className="pt-1 text-right text-sm font-bold tabular-nums">Total: {brl(total)}</p>
    </div>
  );
}
/** "precisa R$ 50,00 em 0,50 · entrega R$ 50,00 em 50" — para a linha da lista. */
function describeSides(r: ChangeRequest, list: DenomView[]): string {
  const lado = (b: Record<string, number> | undefined) => list
    .filter((d) => (Number(b?.[d.key]) || 0) > 0)
    .map((d) => `${brl(Number(b?.[d.key]) || 0)} em ${d.label}`)
    .join(' · ');
  const precisa = lado(r.need);
  const entrega = lado(r.give);
  if (!precisa) return r.note || 'sem detalhe';
  return entrega ? `precisa ${precisa} · entrega ${entrega}` : `precisa ${precisa}`;
}

const emptyForm = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, ''])) as Record<string, string>;
const toNumbers = (keys: string[], v: Record<string, string>): Bal => Object.fromEntries(keys.map((k) => [k, parseNum(v[k] || '0')]));

export function VaultClient({ units, selectedUnitId, vault, alerts, openRequestsNetwork, canOperate, canManageBuckets, canResolve }: {
  units: UnitOpt[]; selectedUnitId: string; vault: VaultUI; alerts: VaultAlertUI[] | null; openRequestsNetwork: ChangeRequest[];
  canOperate: boolean; canManageBuckets: boolean; canResolve: boolean;
}) {
  const router = useRouter();
  // Config de denominações da unidade (dirige rótulos e blocos das telas do cofre).
  const denoms = vault.denominations;
  const smallDenoms = denoms.filter((d) => d.isSmall);
  const bigDenoms = denoms.filter((d) => d.isBig);
  const allKeys = denoms.map((d) => d.key);
  const denomByKey = useMemo(() => new Map(denoms.map((d) => [d.key, d])), [denoms]);
  // Grade de saldo: denominações da config + chaves legado com valor ≠ 0 (nunca esconde dinheiro).
  const balanceKeys = useMemo(() => {
    const cfg = allKeys;
    const extra = Object.keys(vault.balances).filter((k) => !denomByKey.has(k) && (vault.balances[k] || 0) !== 0);
    return [...cfg, ...extra];
  }, [allKeys, vault.balances, denomByKey]);
  const indicatorLabel = bigDenoms.filter((d) => d.countsAsBigIndicator).map((d) => (d.value != null ? d.value.toLocaleString('pt-BR') : d.key)).join(' / ');

  const [tab, setTab] = useState<'cofre' | 'historico'>('cofre');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'none' | 'count' | 'refill' | 'swap' | 'withdrawal' | 'register' | 'request'>('none');
  const [formA, setFormA] = useState<Record<string, string>>(() => emptyForm(allKeys));
  const [formB, setFormB] = useState<Record<string, string>>(() => emptyForm(allKeys));
  /* Totais dos dois lados do pedido de troco: a soma é o valor (ninguém digita
     um total que pode divergir do detalhe) e a igualdade libera o envio. */
  const reqNeed = smallDenoms.reduce((t, d) => t + parseNum(formA[d.key] || '0'), 0);
  const reqGive = bigDenoms.reduce((t, d) => t + parseNum(formB[d.key] || '0'), 0);
  const reqBalanced = Math.abs(reqNeed - reqGive) <= 0.011;
  const chegouTotal = denoms.reduce((t, d) => t + parseNum(chegou[d.key] || '0'), 0);
  const [sugestao, setSugestao] = useState<string | null>(null);
  /* Confirmação de recebimento: qual pedido está sendo conferido e o que chegou. */
  const [conferindo, setConferindo] = useState<string | null>(null);
  const [chegou, setChegou] = useState<Record<string, string>>({});
  const [obsChegada, setObsChegada] = useState('');
  const [sugerindo, setSugerindo] = useState(false);

  /* Preenche o pedido a partir do que o cofre tem hoje. É sugestão: o gerente
     ajusta antes de enviar — quem conhece a operação do dia é ele. */
  async function sugerir() {
    setSugerindo(true);
    try {
      const res = await fetch('/api/cash/vault', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggestChange', unitId: selectedUnitId }),
      });
      const d = await res.json().catch(() => null);
      if (!d) { setSugestao('Não consegui calcular a sugestão agora.'); return; }
      setSugestao(d.motivo ?? null);
      if (d.vazia) return;
      const paraTexto = (b: Record<string, number>) =>
        Object.fromEntries(allKeys.map((k) => [k, b?.[k] ? String(b[k]).replace('.', ',') : '']));
      setFormA(paraTexto(d.need));
      setFormB(paraTexto(d.give));
    } finally { setSugerindo(false); }
  }
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
  const reset = () => { setAction('none'); setFormA(emptyForm(allKeys)); setFormB(emptyForm(allKeys)); setNote(''); setBucketId(''); setRegisterName(''); setReqAmount(''); };

  return (
    <div className="space-y-4">
      {units.length > 1 && (
        <div className="max-w-xs">
          <Select
            aria-label="Unidade"
            size="sm"
            value={selectedUnitId}
            onValueChange={(id) => router.push(`/modulos/troco?unit=${id}`)}
            options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
          />
        </div>
      )}

      {/* Destaque: solicitações de troco abertas em OUTRAS unidades (supervisão) */}
      {canResolve && networkOpen.length > 0 && (
        <div className="rounded-lg border-2 border-brand/50 bg-brand/5 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink-900"><HandCoins className="h-4 w-4 text-ink-900" /> {networkOpen.length} solicitação(ões) de troco em aberto na rede</p>
          <div className="space-y-1">
            {networkOpen.slice(0, 6).map((r) => (
              <button key={r.id} onClick={() => router.push(`/modulos/troco?unit=${r.unitId}`)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-brand/10">
                <span className="min-w-0 truncate"><strong>{r.unitName}</strong> — {r.note}</span>
                <span className="shrink-0 text-xs text-ink-500">{r.amount ? brl(r.amount) : ''} · {r.requestedByName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-1 border-b">
        {([['cofre', 'Cofre', Wallet], ['historico', 'Histórico', History]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={cn('flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold', tab === key ? 'border-brand text-brand' : 'border-transparent text-ink-500 hover:text-brand')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'cofre' && (
        <>
          {/* TROCO A CAMINHO — o gerente confirma o que chegou de verdade.
              Fica antes das solicitações de propósito: conferir o que chegou é
              mais urgente do que pedir mais. */}
          {vault.changeRequests.filter((r) => r.status === 'SENT').map((r) => (
            <div key={r.id} className="rounded-lg border-2 border-info/50 bg-info/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                <PackageCheck className="h-4 w-4 text-info" /> Chegou troco do escritório — confira e confirme
              </p>
              <p className="mt-1 text-xs text-ink-500">
                O escritório registrou o envio de <strong>{brl(r.sentTotal ?? 0)}</strong>
                {r.sentByName ? ' (' + r.sentByName + ')' : ''}
                {r.sentAt ? ' · ' + dt(r.sentAt) : ''}
                {r.sentNote ? ' · ' + r.sentNote : ''}. <strong>O cofre só é atualizado quando você confirmar.</strong>
              </p>

              {conferindo !== r.id ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => {
                    setConferindo(r.id);
                    setObsChegada('');
                    /* Vem preenchido com o ENVIADO: o caso comum é chegar certo. */
                    const inicial: Record<string, string> = {};
                    for (const [k, v] of Object.entries(r.sent ?? {})) if ((v || 0) > 0) inicial[k] = String(v).replace('.', ',');
                    setChegou(inicial);
                  }}>
                    Conferir e confirmar
                  </Button>
                </div>
              ) : (
                <div className="mt-2 space-y-2 rounded-md border border-dashed p-2">
                  <p className="sgo-type-11 font-semibold text-success">O QUE CHEGOU DE VERDADE</p>
                  <DenomForm list={denoms} values={chegou} onChange={(k, v) => setChegou((s) => ({ ...s, [k]: v }))} />
                  {Math.abs(chegouTotal - (r.sentTotal ?? 0)) > 0.011 && (
                    <p className="text-xs font-semibold text-danger">
                      Diferente do enviado ({brl(r.sentTotal ?? 0)}): diferença de {brl(Math.abs(chegouTotal - (r.sentTotal ?? 0)))}.
                      Confirmando assim, a supervisão é avisada na hora.
                    </p>
                  )}
                  <Input value={obsChegada} onChange={(e) => setObsChegada(e.target.value)} placeholder="Observação (opcional) — ex.: pacote de 0,50 veio aberto" className="h-9 text-sm" />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setConferindo(null)}>Cancelar</Button>
                    <Button
                      size="sm"
                      variant="gold"
                      disabled={busy || chegouTotal <= 0}
                      onClick={async () => {
                        if (await post({ action: 'confirmReceipt', id: r.id, received: toNumbers(allKeys, chegou), note: obsChegada })) {
                          setConferindo(null);
                        }
                      }}
                    >
                      Confirmar recebimento
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Solicitações de troco DESTA unidade */}

          {(openRequests.length > 0 || canOperate) && (
            <div className={cn('rounded-lg border p-3', openRequests.length > 0 ? 'border-brand/50 bg-brand/5' : 'bg-surface')}>
              <div className="mb-1 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900"><HandCoins className="h-4 w-4 text-ink-900" /> Solicitações de troco{openRequests.length > 0 ? ` (${openRequests.length} aberta(s))` : ''}</p>
                {canOperate && action !== 'request' && <Button size="sm" variant="outline" onClick={() => setAction('request')}>Solicitar troco</Button>}
              </div>
              {action === 'request' && (
                <div className="mb-2 space-y-2 rounded-md border border-dashed p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-ink-500">A supervisão será avisada na hora. Lance o VALOR EM R$ de cada nota ou moeda, como na conferência.</p>
                    <Button size="sm" variant="outline" disabled={busy || sugerindo} onClick={sugerir}>
                      <Wand2 className="h-4 w-4" /> {sugerindo ? 'Calculando…' : 'Sugerir pelo cofre'}
                    </Button>
                  </div>
                  {sugestao && <p className="rounded-md bg-info-bg px-2 py-1 text-xs text-info">{sugestao}</p>}
                  <p className="sgo-type-11 font-semibold text-success">PRECISO RECEBER (moedas/miúdos):</p>
                  <DenomForm list={smallDenoms} values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} />
                  <p className="sgo-type-11 font-semibold text-danger">ENTREGO EM TROCA (notas grandes):</p>
                  <DenomForm list={bigDenoms} values={formB} onChange={(k, v) => setFormB((s) => ({ ...s, [k]: v }))} />
                  {reqGive > 0 && !reqBalanced && (
                    <p className="text-xs font-semibold text-danger">
                      Os totais precisam ser iguais: você pede {brl(reqNeed)} e entrega {brl(reqGive)} — diferença de {brl(Math.abs(reqNeed - reqGive))}.
                    </p>
                  )}
                  {reqGive > 0 && reqBalanced && (
                    <p className="text-xs font-semibold text-success">Troca fechada em {brl(reqNeed)} — ao atender, o cofre é atualizado sozinho.</p>
                  )}
                  {reqGive === 0 && reqNeed > 0 && (
                    <p className="text-xs text-ink-500">Sem o lado da entrega, a supervisão registrará a troca à mão. Preencha os dois lados para o cofre se atualizar sozinho.</p>
                  )}
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="h-9 text-sm" />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
                    <Button
                      size="sm"
                      disabled={busy || reqNeed <= 0 || (reqGive > 0 && !reqBalanced)}
                      onClick={async () => { if (await post({ action: 'requestChange', unitId: selectedUnitId, need: toNumbers(allKeys, formA), give: toNumbers(allKeys, formB), note })) reset(); }}
                    >
                      Enviar solicitação
                    </Button>
                  </div>
                </div>
              )}
              {openRequests.length === 0 && action !== 'request' && <p className="text-sm text-ink-500">Nenhuma solicitação em aberto.</p>}
              {openRequests.length > 0 && (
                <List>
                  {openRequests.map((r) => (
                    <ListRow
                      key={r.id}
                      title={`${r.amount ? brl(r.amount) : 'Troco'}${r.autoApply ? ' · troca fechada' : ''}`}
                      subtitle={`${describeSides(r, denoms)}${r.note ? ` — ${r.note}` : ''} · ${r.requestedByName} · ${dt(r.createdAt)}`}
                      trailing={
                        <>
                          {canResolve && (
                            <DsButton size="sm" disabled={busy} onClick={() => void post({ action: 'resolveChange', id: r.id })}>Atender</DsButton>
                          )}
                          <DsButton size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm('Cancelar esta solicitação?')) void post({ action: 'resolveChange', id: r.id, cancel: true }); }}>Cancelar</DsButton>
                        </>
                      }
                    />
                  ))}
                </List>
              )}
            </div>
          )}

          {/* Saldo do cofre (como a folha) */}
          <div className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900"><Landmark className="h-4 w-4 text-ink-900" /> Cofre da unidade</p>
              <p className="sgo-type-24 font-semibold tabular-nums text-ink-900">{brl(vault.total)}</p>
            </div>
            <p className="text-xs text-ink-500">
              {vault.lastCountAt ? `Última conferência: ${new Date(vault.lastCountAt).toLocaleDateString('pt-BR')}` : 'Nenhuma conferência ainda — lance a posição inicial em "Conferir cofre".'}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
              {balanceKeys.map((k) => {
                const d = denomByKey.get(k);
                const label = d ? (k === 'outros' ? 'Outros' : `R$ ${(d.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`) : legacyLabel(k);
                return (
                  <p key={k} className="flex justify-between text-xs tabular-nums">
                    <span className={cn('text-ink-500', !d && 'italic')}>{label}</span>
                    <span className={cn('font-semibold', (vault.balances[k] || 0) === 0 && 'text-ink-500')}>{brl(vault.balances[k] || 0)}</span>
                  </p>
                );
              })}
            </div>
            <div className="mt-2 space-y-2">
              {vault.bigNotesPct >= 50 ? (
                <Banner
                  tone="warning"
                  title={`Notas grandes${indicatorLabel ? ` (${indicatorLabel})` : ''}: ${brl(vault.bigNotesTotal)} — ${vault.bigNotesPct}% do cofre`}
                  description="Hora de pedir troca ao escritório."
                />
              ) : (
                <p className="text-xs tabular-nums text-ink-500">
                  Notas grandes{indicatorLabel ? ` (${indicatorLabel})` : ''}: {brl(vault.bigNotesTotal)} ({vault.bigNotesPct}% do cofre)
                </p>
              )}
              {vault.monthWithdrawals > 0 && (
                <Banner
                  tone="danger"
                  title={`${vault.monthWithdrawals} retirada(s) para pagamento neste mês`}
                  description="Prática proibida — a supervisão foi avisada."
                />
              )}
            </div>
          </div>

          {/* Baldes */}
          <div className="rounded-lg border bg-surface p-3">
            <p className="mb-1 sgo-type-11 font-semibold text-ink-500">Baldes dos caixas (valor-alvo fixado pela supervisão) — soma {brl(bucketsTotal)}</p>
            {activeBuckets.length === 0 && <p className="text-sm text-ink-500">Nenhum balde cadastrado{canManageBuckets ? ' — cadastre abaixo' : ' (unidade sem baldes: use "Troca no caixa")'}. </p>}
            <div className="flex flex-wrap gap-2">
              {activeBuckets.map((b) => (
                editBucketId === b.id ? (
                  <span key={b.id} className="flex flex-wrap items-end gap-1.5 rounded-lg border-2 border-brand/40 bg-surface p-2">
                    <div><span className="block text-[11px] text-ink-500">Nome</span><Input value={ebName} onChange={(e) => setEbName(e.target.value)} className="h-8 w-28 text-sm" /></div>
                    <div><span className="block text-[11px] text-ink-500">Alvo (R$)</span><Input inputMode="decimal" value={ebTarget} onChange={(e) => setEbTarget(e.target.value)} className="h-8 w-24 text-sm" /></div>
                    <Button size="sm" disabled={busy || !ebName.trim() || !ebTarget} onClick={async () => { if (await post({ action: 'bucketSet', id: b.id, unitId: selectedUnitId, name: ebName.trim(), targetValue: parseNum(ebTarget) })) setEditBucketId(null); }}>Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditBucketId(null)}>Cancelar</Button>
                  </span>
                ) : (
                  <span key={b.id} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold">{b.name} · {brl(b.targetValue)}
                    {canManageBuckets && (
                      <>
                        <button className="text-xs text-brand underline" disabled={busy} onClick={() => { setEditBucketId(b.id); setEbName(b.name); setEbTarget(String(b.targetValue).replace('.', ',')); }}>editar</button>
                        <button className="text-xs text-danger underline" disabled={busy} onClick={() => { if (confirm(`Excluir o balde "${b.name}"? Esta ação não pode ser desfeita (o histórico de movimentos mantém o nome).`)) void post({ action: 'bucketDelete', id: b.id }); }}>excluir</button>
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
              <Button variant="outline" className="col-span-2 border-danger/50 text-danger" onClick={() => setAction('withdrawal')}><AlertTriangle className="h-4 w-4" /> Retirada (proibida)</Button>
            </div>
          )}

          {action === 'count' && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-1 text-sm font-bold text-ink-900">Conferência do cofre (rotina diária)</p>
              <p className="mb-2 text-xs text-ink-500">Lance o VALOR EM R$ contado de cada denominação (como na folha). Isso substitui o saldo do cofre.</p>
              <DenomForm list={denoms} values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} />
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="mt-2 h-9 text-sm" />
              <div className="mt-2 flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
                <Button size="sm" variant="gold" disabled={busy} onClick={async () => { if (await post({ action: 'count', unitId: selectedUnitId, balances: toNumbers(allKeys, formA), note })) reset(); }}>Salvar conferência</Button>
              </div>
            </div>
          )}

          {action === 'refill' && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-1 text-sm font-bold text-ink-900">Repor balde (troca 1:1)</p>
              <div className="mb-2">
                <Select
                  aria-label="Balde do caixa"
                  placeholder="Qual balde…"
                  value={bucketId}
                  onValueChange={setBucketId}
                  options={activeBuckets.map((b) => ({ value: b.id, label: b.name, hint: `alvo ${brl(b.targetValue)}` }))}
                />
              </div>
              <p className="mb-1 text-xs font-bold text-danger">SAIU do cofre (miúdos p/ o balde):</p>
              <DenomForm list={smallDenoms} values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} />
              <p className="mb-1 mt-3 text-xs font-bold text-success">ENTROU no cofre (notas grandes do balde):</p>
              <DenomForm list={bigDenoms} values={formB} onChange={(k, v) => setFormB((s) => ({ ...s, [k]: v }))} />
              <p className="mt-1 text-xs text-ink-500">Os dois totais devem ser IGUAIS (é uma troca).</p>
              <div className="mt-2 flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
                <Button size="sm" variant="gold" disabled={busy || !bucketId} onClick={async () => { if (await post({ action: 'refill', unitId: selectedUnitId, bucketId, outSmall: toNumbers(allKeys, formA), inBig: toNumbers(allKeys, formB), note })) reset(); }}>Registrar reposição</Button>
              </div>
            </div>
          )}

          {action === 'register' && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-1 text-sm font-bold text-ink-900">Troca de dinheiro direto no caixa</p>
              <p className="mb-2 text-xs text-ink-500">Para unidades sem baldes (ex.: Nova União): o caixa troca notas por moedas/miúdos direto no cofre. Fica registrado no histórico.</p>
              <Input value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="Qual caixa (ex.: Caixa 1)" className="mb-2 h-9 text-sm" />
              <p className="mb-1 text-xs font-bold text-danger">SAIU do cofre (para o caixa):</p>
              <DenomForm list={denoms} values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} />
              <p className="mb-1 mt-3 text-xs font-bold text-success">ENTROU no cofre (do caixa):</p>
              <DenomForm list={denoms} values={formB} onChange={(k, v) => setFormB((s) => ({ ...s, [k]: v }))} />
              <p className="mt-1 text-xs text-ink-500">Os dois totais devem ser IGUAIS (é uma troca).</p>
              <div className="mt-2 flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
                <Button size="sm" variant="gold" disabled={busy || !registerName.trim()} onClick={async () => { if (await post({ action: 'registerChange', unitId: selectedUnitId, registerName, outFromVault: toNumbers(allKeys, formA), inToVault: toNumbers(allKeys, formB), note })) reset(); }}>Registrar troca</Button>
              </div>
            </div>
          )}

          {action === 'swap' && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-1 text-sm font-bold text-ink-900">Troca com o escritório</p>
              <p className="mb-1 text-xs font-bold text-danger">ENVIADO ao escritório (notas grandes):</p>
              <DenomForm list={bigDenoms} values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} />
              <p className="mb-1 mt-3 text-xs font-bold text-success">RECEBIDO do escritório (moedas/miúdos):</p>
              <DenomForm list={smallDenoms} values={formB} onChange={(k, v) => setFormB((s) => ({ ...s, [k]: v }))} />
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="mt-2 h-9 text-sm" />
              <div className="mt-2 flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
                <Button size="sm" variant="gold" disabled={busy} onClick={async () => { if (await post({ action: 'officeSwap', unitId: selectedUnitId, outBig: toNumbers(allKeys, formA), inSmall: toNumbers(allKeys, formB), note })) reset(); }}>Registrar troca</Button>
              </div>
            </div>
          )}

          {action === 'withdrawal' && (
            <div className="rounded-lg border-2 border-danger/60 bg-danger/5 p-3">
              <p className="mb-1 text-sm font-bold text-danger">🚨 Retirada do troco para pagamento — PRÁTICA PROIBIDA</p>
              <p className="mb-2 text-xs text-danger">A supervisão e os administradores serão avisados NA HORA. Use apenas em emergência real e reponha o valor.</p>
              <DenomForm list={denoms} values={formA} onChange={(k, v) => setFormA((s) => ({ ...s, [k]: v }))} />
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo da retirada (obrigatório)" className="mt-2 h-9 text-sm" />
              <div className="mt-2 flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={reset}>Cancelar</Button>
                <Button size="sm" variant="destructive" disabled={busy || !note.trim()} onClick={async () => {
                  if (!confirm('Confirma a retirada PROIBIDA do troco? A supervisão será avisada imediatamente.')) return;
                  if (await post({ action: 'withdrawal', unitId: selectedUnitId, amounts: toNumbers(allKeys, formA), reason: note })) reset();
                }}>Confirmar retirada</Button>
              </div>
            </div>
          )}

          {/* Alertas por unidade (supervisão) */}
          {alerts && alerts.length > 0 && (
            <div className="rounded-lg border bg-surface p-3">
              <p className="mb-2 flex items-center gap-1.5 sgo-type-11 font-semibold text-ink-500"><AlertTriangle className="h-3.5 w-3.5" /> Cofres da rede — retiradas no mês</p>
              <div className="space-y-1">
                {alerts.map((a) => (
                  <div key={a.unitId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{a.unitName}</span>
                    <span className="shrink-0 text-xs tabular-nums">
                      cofre {brl(a.vaultTotal)} · <span className={a.withdrawals > 0 ? 'font-bold text-danger' : 'font-semibold text-success'}>{a.withdrawals} retirada(s){a.withdrawals > 0 ? ` (${brl(a.withdrawnTotal)})` : ''}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Movimentações recentes */}
          <div>
            <p className="mb-1 sgo-type-11 font-semibold text-ink-500">Movimentações recentes</p>
            {vault.recentMovements.length === 0 && <p className="text-sm text-ink-500">Nenhuma movimentação ainda.</p>}
            <div className="space-y-1.5">
              {vault.recentMovements.map((m) => {
                const t = TYPE_LABEL[m.type] ?? { label: m.type, tone: 'neutral' as const };
                return (
                  <div key={m.id} className={cn('rounded-lg border p-2.5', m.type === 'WITHDRAWAL' ? 'border-danger/50 bg-danger/5' : 'bg-surface')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-900">{t.label}{m.bucketName ? ` — ${m.bucketName}` : ''}</p>
                      <StatusBadge tone={t.tone}>{m.totalIn > 0 && m.totalOut > 0 ? `↔ ${brl(m.totalIn)}` : m.totalIn > 0 ? `+ ${brl(m.totalIn)}` : `− ${brl(m.totalOut)}`}</StatusBadge>
                    </div>
                    <p className="text-xs text-ink-500">{m.createdByName} · {dt(m.createdAt)}{m.note ? ` · ${m.note}` : ''}</p>
                  </div>
                );
              })}
            </div>
            {vault.recentMovements.length > 0 && <button onClick={() => setTab('historico')} className="mt-2 text-xs font-semibold text-brand hover:underline">Ver histórico completo →</button>}
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
        <FilterSelect
          label="Tipo"
          value={type}
          onValueChange={setType}
          options={[{ value: '', label: 'Todos' }, ...MOVEMENT_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
        />
        <FilterSelect
          label="Usuário"
          value={userId}
          onValueChange={setUserId}
          options={[{ value: '', label: 'Todos' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
        />
        <FilterDate label="De" value={from || null} onValueChange={(v) => setFrom(v ?? '')} />
        <FilterDate label="Até" value={to || null} onValueChange={(v) => setTo(v ?? '')} min={from || undefined} />
        <FilterInput label="Valor mín." inputMode="decimal" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="0,00" />
        <FilterInput label="Valor máx." inputMode="decimal" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="0,00" />
        <FilterSelect
          label="Ordenar"
          value={sort}
          onValueChange={setSort}
          options={[
            { value: 'date_desc', label: 'Mais recentes' },
            { value: 'date_asc', label: 'Mais antigos' },
            { value: 'value_desc', label: 'Maior valor' },
            { value: 'value_asc', label: 'Menor valor' },
          ]}
        />
      </FilterBar>

      <div className="flex flex-wrap gap-3 text-xs text-ink-500">
        <span><strong className="text-brand">{rows.length}</strong> lançamento(s)</span>
        <span>entradas <strong className="text-success">{brl(totalIn)}</strong></span>
        <span>saídas <strong className="text-danger">{brl(totalOut)}</strong></span>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500">Nenhuma movimentação com esses filtros.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => {
            const t = TYPE_LABEL[m.type] ?? { label: m.type, tone: 'neutral' as const };
            return (
              <div key={m.id} className={cn('rounded-lg border p-2.5', m.type === 'WITHDRAWAL' ? 'border-danger/50 bg-danger/5' : 'bg-surface')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">{t.label}{m.bucketName ? ` — ${m.bucketName}` : ''}</p>
                  <StatusBadge tone={t.tone}>{m.totalIn > 0 && m.totalOut > 0 ? `↔ ${brl(Math.max(m.totalIn, m.totalOut))}` : m.totalIn > 0 ? `+ ${brl(m.totalIn)}` : `− ${brl(m.totalOut)}`}</StatusBadge>
                </div>
                <p className="text-xs text-ink-500">{m.createdByName} · {dt(m.createdAt)}{m.note ? ` · ${m.note}` : ''}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
