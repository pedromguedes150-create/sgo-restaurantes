'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Search, RotateCcw, XCircle, Plus, Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';

interface Divergence {
  id: string;
  number: number;
  status: 'OPEN' | 'INVESTIGATING' | 'CLOSED';
  observation: string | null;
  reporter: string | null;
}

export function CommandsClient({
  unitId,
  canResolve,
  isAdmin,
  hasConfig,
  todayDone,
  activeNumbers = [],
  openDivergences,
}: {
  unitId: string;
  canResolve: boolean;
  isAdmin: boolean;
  hasConfig: boolean;
  todayDone: boolean;
  activeNumbers?: number[];
  openDivergences: Divergence[];
}) {
  const router = useRouter();
  const [absent, setAbsent] = useState('');
  const [observation, setObservation] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ t: 'err', m: data.error ?? 'Falha' });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMsg({ t: 'err', m: 'Falha de conexão' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function allPresent() {
    if (await post('/api/commands/count', { unitId, allPresent: true })) setMsg({ t: 'ok', m: 'Registrado: todas presentes ✓' });
  }

  async function submitAbsent() {
    const nums = absent
      .split(/[\s,]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => !Number.isNaN(n));
    if (nums.length === 0) {
      setMsg({ t: 'err', m: 'Informe os números ausentes ou use "Todas presentes".' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/commands/count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, allPresent: false, absentNumbers: nums, observation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ t: 'err', m: data.error ?? 'Falha' });
        return;
      }
      setAbsent('');
      setObservation('');
      const rejected: number[] = data.rejected ?? [];
      if (rejected.length > 0) {
        setMsg({
          t: 'err',
          m: `Registrado, mas o(s) número(s) ${rejected.join(', ')} NÃO pertence(m) à sequência ativa (já baixado ou fora do intervalo) — confira.`,
        });
      } else {
        setMsg({ t: 'ok', m: 'Divergências registradas e Supervisor alertado.' });
      }
      router.refresh();
    } catch {
      setMsg({ t: 'err', m: 'Falha de conexão' });
    } finally {
      setBusy(false);
    }
  }

  if (!hasConfig) {
    return (
      <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
        Sequência de comandas ainda não configurada para esta unidade (Admin → Configurações).
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Contagem do dia */}
      <div className="space-y-3">
        {todayDone && (
          <p className="rounded-lg bg-sgo-success/10 px-3 py-2 text-sm font-medium text-sgo-success">
            Contagem de hoje já registrada (pode reenviar para corrigir).
          </p>
        )}

        {/* Conferência em grade: seleciona as presentes; as não marcadas = faltando */}
        <GridConference unitId={unitId} activeNumbers={activeNumbers} underReview={openDivergences.map((d) => d.number)} busy={busy} setBusy={setBusy} onResult={(m) => setMsg(m)} />

        <Button onClick={allPresent} disabled={busy} size="lg" className="w-full" variant="default">
          <Check className="h-5 w-5" /> Todas presentes (atalho)
        </Button>

        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-500">Informar ausentes manualmente (por número)</summary>
          <div className="mt-2">
            <Label htmlFor="absent">Comandas ausentes (números separados por vírgula)</Label>
            <Input id="absent" inputMode="numeric" placeholder="ex: 12, 45, 78" value={absent} onChange={(e) => setAbsent(e.target.value)} className="mt-1.5" />
            <Label htmlFor="obs" className="mt-3 block">Observação (obrigatória se houver ausentes)</Label>
            <Input id="obs" value={observation} onChange={(e) => setObservation(e.target.value)} className="mt-1.5" />
            <Button onClick={submitAbsent} disabled={busy} className="mt-3 w-full" variant="gold">Registrar ausentes</Button>
          </div>
        </details>

        {msg && (
          <p className={msg.t === 'ok' ? 'text-sm font-medium text-sgo-success' : 'text-sm font-medium text-danger'}>{msg.m}</p>
        )}
      </div>

      {/* Divergências em aberto */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
          Divergências em aberto ({openDivergences.length})
        </h2>
        {openDivergences.length === 0 && <p className="text-sm text-ink-500">Nenhuma divergência aberta. 🟢</p>}
        {openDivergences.map((d) => (
          <div key={d.id} className="rounded-lg border bg-sgo-surface p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sgo-brand">Comanda nº {d.number}</p>
              <StatusBadge tone={d.status === 'OPEN' ? 'critical' : 'medium'}>
                {d.status === 'OPEN' ? '🔴 Aberta' : '🟡 Em apuração'}
              </StatusBadge>
            </div>
            {d.observation && <p className="mt-1 text-sm text-ink-500">{d.observation}</p>}
            {canResolve && (
              <div className="mt-2 flex flex-wrap gap-2">
                {d.status === 'OPEN' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => post(`/api/commands/divergences/${d.id}`, { action: 'investigate' })}>
                    <Search className="h-4 w-4" /> Em apuração
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => post(`/api/commands/divergences/${d.id}`, { action: 'close', outcome: 'RECOVERED' })}>
                  <RotateCcw className="h-4 w-4" /> Recuperada
                </Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => post(`/api/commands/divergences/${d.id}`, { action: 'close', outcome: 'LOST' })}>
                  <XCircle className="h-4 w-4" /> Perdida (baixa)
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reposição (Admin) */}
      {isAdmin && <ReplacementForm unitId={unitId} onDone={() => router.refresh()} />}
    </div>
  );
}

function GridConference({ unitId, activeNumbers, underReview = [], busy, setBusy, onResult }: {
  unitId: string; activeNumbers: number[]; underReview?: number[]; busy: boolean; setBusy: (b: boolean) => void; onResult: (m: { t: 'ok' | 'err'; m: string }) => void;
}) {
  const router = useRouter();
  // Comandas já em divergência/apuração SAEM da grade (16/07) — são tratadas no bloco abaixo.
  const reviewSet = useMemo(() => new Set(underReview), [underReview]);
  const gridNumbers = useMemo(() => activeNumbers.filter((n) => !reviewSet.has(n)), [activeNumbers, reviewSet]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [inUse, setInUse] = useState<Set<number>>(new Set()); // "em uso" (com cliente) — conta como presente
  const [filter, setFilter] = useState('');
  const [obs, setObs] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const total = gridNumbers.length;
  const conferidas = selected.size;
  const emUso = inUse.size;
  const faltando = total - conferidas - emUso;
  const shown = useMemo(() => (filter.trim() ? gridNumbers.filter((n) => String(n).includes(filter.trim())) : gridNumbers), [filter, gridNumbers]);

  // Ciclo do toque: neutro → conferida (verde) → em uso (azul) → neutro
  function toggle(n: number) {
    if (selected.has(n)) {
      setSelected((s) => { const x = new Set(s); x.delete(n); return x; });
      setInUse((s) => { const x = new Set(s); x.add(n); return x; });
    } else if (inUse.has(n)) {
      setInUse((s) => { const x = new Set(s); x.delete(n); return x; });
    } else {
      setSelected((s) => { const x = new Set(s); x.add(n); return x; });
    }
  }

  // Marca/desmarca uma faixa de números em lote (comandas guardadas que não se confere todo dia).
  function applyRange(mark: boolean) {
    const a = parseInt(rangeFrom, 10);
    const b = parseInt(rangeTo, 10);
    if (Number.isNaN(a) || Number.isNaN(b)) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    setSelected((s) => {
      const x = new Set(s);
      for (const n of gridNumbers) if (n >= lo && n <= hi) { if (mark) x.add(n); else x.delete(n); }
      return x;
    });
    if (!mark) setInUse((s) => { const x = new Set(s); const a2 = lo, b2 = hi; for (const n of [...x]) if (n >= a2 && n <= b2) x.delete(n); return x; });
  }

  async function confirmConf() {
    const absent = activeNumbers.filter((n) => !selected.has(n));
    if (absent.length > 0 && !obs.trim()) { onResult({ t: 'err', m: 'Há comandas faltando — informe uma observação.' }); return; }
    const ok = window.confirm(absent.length === 0 ? 'Confirmar: TODAS as comandas presentes?' : `Confirmar conferência?\n${absent.length} comanda(s) faltando: ${absent.slice(0, 40).join(', ')}${absent.length > 40 ? '…' : ''}`);
    if (!ok) return;
    setBusy(true);
    try {
      const body = absent.length === 0 ? { unitId, allPresent: true } : { unitId, allPresent: false, absentNumbers: absent, observation: obs };
      const res = await fetch('/api/commands/count', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { onResult({ t: 'err', m: data.error ?? 'Falha' }); return; }
      onResult({ t: 'ok', m: absent.length === 0 ? 'Conferência registrada: todas presentes ✓' : `Conferência registrada. ${absent.length} faltando — supervisor alertado.` });
      setSelected(new Set()); setInUse(new Set()); setObs(''); router.refresh();
    } finally { setBusy(false); }
  }

  if (total === 0) return null;
  return (
    <div className="rounded-lg border-2 border-sgo-brand/30 bg-sgo-brand/5 p-3">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-sgo-brand"><Grid3x3 className="h-4 w-4" /> Conferência em grade</h2>
      <p className="mb-2 text-xs text-ink-500">Toque 1× = <b className="text-sgo-success">conferida</b> · 2× = <b className="text-info">em uso</b> (com cliente — conta como presente) · 3× = limpa. As <b>não marcadas</b> viram apuração.</p>
      {underReview.length > 0 && (
        <p className="mb-2 rounded-md bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">{underReview.length} comanda(s) já em apuração — fora da grade (trate no bloco Divergências abaixo).</p>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button onClick={() => { setSelected(new Set(gridNumbers)); setInUse(new Set()); }} className="rounded-full border px-3 py-1 text-xs font-semibold">Marcar todas</button>
        <button onClick={() => { setSelected(new Set()); setInUse(new Set()); }} className="rounded-full border px-3 py-1 text-xs font-semibold">Limpar</button>
        <Input inputMode="numeric" value={filter} onChange={(e) => setFilter(e.target.value.replace(/\D/g, ''))} aria-label="Filtrar comandas pelo número" placeholder="filtrar nº" className="h-8 w-24 text-sm" />
        <span className="ml-auto text-xs font-semibold"><span className="text-sgo-success">{conferidas} ok</span>{emUso > 0 && <> · <span className="text-info">{emUso} em uso</span></>} · <span className={faltando > 0 ? 'text-danger' : 'text-ink-500'}>{faltando} faltando</span> / {total}</span>
      </div>
      {/* Seleção em lote por faixa (ex.: comandas guardadas) */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed p-2">
        <span className="text-xs font-semibold text-ink-500">Faixa:</span>
        <Input inputMode="numeric" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ''))} aria-label="Início da faixa de comandas" placeholder="de" className="h-8 w-16 text-sm" />
        <span className="text-xs text-ink-500">até</span>
        <Input inputMode="numeric" value={rangeTo} onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ''))} aria-label="Fim da faixa de comandas" placeholder="até" className="h-8 w-16 text-sm" />
        <button onClick={() => applyRange(true)} className="rounded-full border border-sgo-success/50 px-2.5 py-1 text-xs font-semibold text-sgo-success">Marcar faixa</button>
        <button onClick={() => applyRange(false)} className="rounded-full border border-danger/50 px-2.5 py-1 text-xs font-semibold text-danger">Desmarcar faixa</button>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border bg-sgo-surface p-2">
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-10">
          {shown.map((n) => (
            <button key={n} onClick={() => toggle(n)} className={`rounded px-1 py-1 text-xs font-semibold ${selected.has(n) ? 'bg-sgo-success text-on-brand' : inUse.has(n) ? 'bg-info text-on-brand' : 'border text-ink-500'}`}>{n}</button>
          ))}
        </div>
        {shown.length === 0 && <p className="p-2 text-xs text-ink-500">Nenhum número com esse filtro.</p>}
      </div>
      {faltando > 0 && <Input value={obs} onChange={(e) => setObs(e.target.value)} aria-label="Observação sobre as comandas que faltam" placeholder="Observação (o que houve com as que faltam)" className="mt-2" />}
      <Button onClick={confirmConf} disabled={busy} className="mt-2 w-full" variant="gold"><Check className="h-4 w-4" /> Confirmar conferência</Button>
    </div>
  );
}

function ReplacementForm({ unitId, onDone }: { unitId: string; onDone: () => void }) {
  const [number, setNumber] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = parseInt(number, 10);
    if (Number.isNaN(n)) return;
    setBusy(true);
    try {
      await fetch('/api/commands/replacements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, number: n, note }),
      });
      setNumber('');
      setNote('');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Reposição (Admin)</h2>
      <div className="flex gap-2">
        <Input inputMode="numeric" aria-label="Número da comanda" placeholder="nº" value={number} onChange={(e) => setNumber(e.target.value)} className="w-24" />
        <Input aria-label="Observação da comanda" placeholder="observação" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={submit} disabled={busy} size="icon" aria-label="Repor">
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
