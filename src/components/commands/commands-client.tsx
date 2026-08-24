'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Search, RotateCcw, XCircle, Plus, Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ausentesDaGrade, escopoDaConferencia } from '@/lib/commands/grid';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';

interface Divergence {
  id: string;
  number: number;
  status: 'OPEN' | 'INVESTIGATING' | 'CLOSED';
  observation: string | null;
  reporter: string | null;
}

/** Estado em que a grade foi deixada na última contagem registrada. */
export interface UltimaContagem {
  data: string;
  /** A contagem é do dia operacional de hoje (correção) ou de um dia anterior. */
  deHoje: boolean;
  conferidas: number[];
  emUso: number[];
}

export function CommandsClient({
  unitId,
  canResolve,
  isAdmin,
  hasConfig,
  todayDone,
  ultimaCompleta,
  temFaixaMadrugada = false,
  activeNumbers = [],
  nightlyNumbers = [],
  lostNumbers = [],
  ultimaContagem = null,
  abertasPorDia = [],
  openDivergences,
}: {
  unitId: string;
  canResolve: boolean;
  isAdmin: boolean;
  hasConfig: boolean;
  todayDone: boolean;
  /** Última contagem COMPLETA da unidade (a parcial da madrugada não conta). */
  ultimaCompleta?: { date: string | null; days: number | null; overdue: boolean; never: boolean };
  /** A unidade usa faixa de madrugada — só aí o indicador faz sentido. */
  temFaixaMadrugada?: boolean;
  activeNumbers?: number[];
  /**
   * Faixa conferida TODO DIA (a "madrugada", marcada em Configurações).
   * Vazia = a unidade confere tudo todo dia.
   */
  nightlyNumbers?: number[];
  /** Baixadas (perdidas). Saíram da sequência ativa, mas continuam existindo. */
  lostNumbers?: number[];
  ultimaContagem?: UltimaContagem | null;
  /** Dias em que as divergências ABERTAS foram criadas, do mais recente. */
  abertasPorDia?: { date: string; count: number }[];
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
          <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
            Contagem de hoje já registrada (pode reenviar para corrigir).
          </p>
        )}

        {/* Só aparece onde existe contagem parcial: numa unidade que confere
            tudo todo dia, "última completa" seria sempre "hoje" e viraria ruído. */}
        {temFaixaMadrugada && ultimaCompleta && (
          <p className={`rounded-lg px-3 py-2 text-sm font-medium ${ultimaCompleta.never || ultimaCompleta.overdue ? 'bg-danger/10 text-danger' : 'bg-sunken text-ink-900'}`}>
            {ultimaCompleta.never ? (
              <>Nunca houve <strong>contagem completa</strong> nesta unidade. A conferência da madrugada cobre só a faixa do salão — as comandas de reserva seguem sem conferência.</>
            ) : (
              <>
                Última <strong>contagem completa</strong>: {ultimaCompleta.date!.split('-').reverse().join('/')}
                {ultimaCompleta.days === 0 ? ' (hoje)' : ultimaCompleta.days === 1 ? ' (ontem)' : ` (há ${ultimaCompleta.days} dias)`}
                {ultimaCompleta.overdue && <> — passou do ritmo semanal. As comandas fora da faixa da madrugada estão sem conferência desde então.</>}
              </>
            )}
          </p>
        )}

        {/* Conferência em grade: seleciona as presentes; as não marcadas = faltando */}
        <GridConference unitId={unitId} activeNumbers={activeNumbers} nightlyNumbers={nightlyNumbers} lostNumbers={lostNumbers} underReview={openDivergences.map((d) => d.number)} ultimaContagem={ultimaContagem} busy={busy} setBusy={setBusy} onResult={(m) => setMsg(m)} />

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
          <p className={msg.t === 'ok' ? 'text-sm font-medium text-success' : 'text-sm font-medium text-danger'}>{msg.m}</p>
        )}
      </div>

      {/* Divergências em aberto */}
      <div className="space-y-2">
        <h2 className="sgo-type-11 font-semibold text-ink-900">
          Divergências em aberto ({openDivergences.length})
        </h2>
        {openDivergences.length === 0 && <p className="text-sm text-ink-500">Nenhuma divergência aberta. 🟢</p>}

        {isAdmin && openDivergences.length > 20 && (
          /* Só aparece com muita divergência aberta de uma vez, que é o sinal de
             engano do SISTEMA (contagem parcial registrada como completa) e não
             de sumiço real. Apaga só as ABERTAS de um dia, com registro em
             auditoria — fechar como "recuperada" mentiria: elas nunca sumiram. */
          <div className="rounded-lg border border-dashed border-danger/50 p-3">
            <p className="text-sm font-semibold text-ink-900">São {openDivergences.length} divergências abertas de uma vez</p>
            <p className="mt-1 text-xs text-ink-500">
              Volume assim costuma vir de uma conferência PARCIAL registrada como completa — comandas que ninguém se propôs a
              contar naquela noite. Se foi o caso, apague as abertas daquele dia e marque a faixa da madrugada em
              Configurações → Comandas para não repetir.
            </p>
            <p className="mt-2 sgo-type-11 font-semibold text-ink-500">Apagar as abertas criadas em</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {abertasPorDia.length === 0 && <p className="text-xs text-ink-500">Nenhuma divergência aberta para limpar.</p>}
              {abertasPorDia.map((d) => (
                /* Um botão por DIA que realmente tem divergência aberta. Antes
                   era um campo de data vazio: o Admin tinha de adivinhar o dia e
                   o botão ficava apagado até ele acertar. */
                <Button
                  key={d.date}
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={async () => {
                    const br = d.date.split('-').reverse().join('/');
                    if (!confirm(`Apagar ${d.count} divergência(s) ABERTA(S) criada(s) em ${br} nesta unidade?

As já investigadas ou encerradas não são tocadas. A ação fica registrada na auditoria.`)) return;
                    const res = await fetch('/api/admin/ops', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ entity: 'commandDivergencesOfDay', action: 'delete', unitId, date: d.date }),
                    });
                    const r = await res.json().catch(() => ({}));
                    if (!res.ok) { setMsg({ t: 'err', m: r.error ?? 'Falha' }); return; }
                    setMsg({ t: 'ok', m: `${r.deleted ?? 0} divergência(s) apagada(s).` });
                    router.refresh();
                  }}
                >
                  {d.date.split('-').reverse().join('/')} · {d.count}
                </Button>
              ))}
            </div>
          </div>
        )}
        {openDivergences.map((d) => (
          <div key={d.id} className="rounded-lg border bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink-900">Comanda nº {d.number}</p>
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

function GridConference({ unitId, activeNumbers, nightlyNumbers = [], lostNumbers = [], underReview = [], ultimaContagem = null, busy, setBusy, onResult }: {
  unitId: string; activeNumbers: number[]; nightlyNumbers?: number[]; lostNumbers?: number[]; underReview?: number[];
  ultimaContagem?: UltimaContagem | null;
  busy: boolean; setBusy: (b: boolean) => void; onResult: (m: { t: 'ok' | 'err'; m: string }) => void;
}) {
  const router = useRouter();
  const reviewSet = useMemo(() => new Set(underReview), [underReview]);
  const lostSet = useMemo(() => new Set(lostNumbers), [lostNumbers]);

  /* A GRADE MOSTRA TODOS OS NÚMEROS DA SEQUÊNCIA, cada um com o seu status.
     Antes as em apuração e as baixadas simplesmente sumiam: a grade pulava de 6
     para 8, de 13 para 15, e o gerente não tinha como saber se aquele número
     nunca existiu, foi baixado ou está em apuração. Sumir não é informação. */
  /* A FAIXA DO DIA. No meio da semana a unidade usa só uma parte das comandas
     (ex.: 1 a 300); o resto fica guardado e é conferido na contagem completa,
     uma vez por semana. Mostrar as 648 na conferência diária fazia as 348
     guardadas caírem como faltantes todo dia — centenas de divergências falsas
     e o supervisor alertado à toa.

     A faixa é a mesma que o caixa já usava no leitor de código de barras
     ("Madrugada", em Configurações → Comandas). Aqui ela passa a valer também
     para a grade do gerente. */
  const [modo, setModo] = useState<'dia' | 'completa'>('dia');
  const { universo, temFaixaDoDia, naFaixaDoDia } = useMemo(
    () => escopoDaConferencia(activeNumbers, nightlyNumbers, modo),
    [activeNumbers, nightlyNumbers, modo],
  );
  const faixaLabel = universo.length > 0 ? `${universo[0]} a ${universo[universo.length - 1]}` : '—';

  const gridNumbers = useMemo(() => {
    /* Baixadas continuam na grade para o número não sumir do meio da sequência
       — mas só as que caem dentro do universo desta conferência. */
    const min = universo[0] ?? 0;
    const max = universo[universo.length - 1] ?? 0;
    const baixadasNoUniverso = lostNumbers.filter((n) => n >= min && n <= max);
    return [...new Set([...universo, ...baixadasNoUniverso])].sort((a, b) => a - b);
  }, [universo, lostNumbers]);

  /** Só estas podem ser marcadas: apuração e baixa se resolvem em outro lugar. */
  const conferiveis = useMemo(
    () => universo.filter((n) => !reviewSet.has(n) && !lostSet.has(n)),
    [universo, reviewSet, lostSet],
  );
  /* A grade abre NO ESTADO DA ÚLTIMA CONTAGEM. Antes começava sempre vazia:
     mesmo com a contagem do dia registrada, aparecia "0 ok · 648 faltando" e
     corrigir exigia remarcar tudo. */
  const [selected, setSelected] = useState<Set<number>>(() => new Set((ultimaContagem?.conferidas ?? []).filter((n) => !reviewSet.has(n))));
  const [inUse, setInUse] = useState<Set<number>>(() => new Set((ultimaContagem?.emUso ?? []).filter((n) => !reviewSet.has(n)))); // "em uso" (com cliente) — conta como presente
  const [filter, setFilter] = useState('');
  const [obs, setObs] = useState('');
  /* Marca o campo quando a confirmação foi recusada por falta de observação —
     antes a recusa só aparecia num aviso longe do botão, e quem clicava
     concluía que o botão estava quebrado. */
  const [obsFaltando, setObsFaltando] = useState(false);
  const obsRef = useRef<HTMLInputElement>(null);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const total = conferiveis.length;
  /* Contados DENTRO do universo: em "faixa do dia" a marcação da última
     contagem completa continua guardada em `selected`, e contar tudo diria
     "648 ok / 300". */
  const conferidas = conferiveis.filter((n) => selected.has(n)).length;
  const emUso = conferiveis.filter((n) => inUse.has(n)).length;
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
      for (const n of conferiveis) if (n >= lo && n <= hi) { if (mark) x.add(n); else x.delete(n); }
      return x;
    });
    if (!mark) setInUse((s) => { const x = new Set(s); const a2 = lo, b2 = hi; for (const n of [...x]) if (n >= a2 && n <= b2) x.delete(n); return x; });
  }

  async function confirmConf() {
    /* Só para o aviso na tela — quem decide o que é ausente é o servidor, que
       recebe os dois conjuntos e desconta também as marcadas EM USO.

       Sobre `conferiveis` e não `activeNumbers`: em apuração e baixadas estão
       FORA da grade (não dá para marcá-las) e se resolvem no bloco de
       Divergências. Contá-las como ausentes travava o gerente num beco: com
       tudo o que dá para marcar marcado, o contador some, o campo de
       observação some junto — e o botão continuava recusando por falta de uma
       observação que já não tinha onde ser escrita. */
    const absent = ausentesDaGrade(conferiveis, selected, inUse);
    if (absent.length > 0 && !obs.trim()) {
      setObsFaltando(true);
      obsRef.current?.focus();
      obsRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      onResult({ t: 'err', m: 'Há comandas faltando — informe uma observação.' });
      return;
    }
    setObsFaltando(false);
    const ok = window.confirm(absent.length === 0 ? 'Confirmar: TODAS as comandas presentes?' : `Confirmar conferência?\n${absent.length} comanda(s) faltando: ${absent.slice(0, 40).join(', ')}${absent.length > 40 ? '…' : ''}`);
    if (!ok) return;
    setBusy(true);
    try {
      /* scopeNumbers = o que ESTA grade se propôs a conferir. Sem ele, o
         servidor julgaria a sequência inteira e as comandas em apuração
         voltariam a abrir divergência a cada contagem. */
      const base = { unitId, scopeNumbers: conferiveis, presentNumbers: [...selected], inUseNumbers: [...inUse] };
      const body = absent.length === 0
        ? { ...base, allPresent: true }
        : { ...base, allPresent: false, observation: obs };
      const res = await fetch('/api/commands/count', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { onResult({ t: 'err', m: data.error ?? 'Falha' }); return; }
      onResult({ t: 'ok', m: absent.length === 0 ? 'Conferência registrada: todas presentes ✓' : `Conferência registrada. ${absent.length} faltando — supervisor alertado.` });
      /* NÃO limpa a grade: o estado que acabou de ser registrado é o estado
         correto para continuar vendo (e corrigir, se for o caso). */
      setObs(''); router.refresh();
    } finally { setBusy(false); }
  }

  if (total === 0) return null;
  return (
    <div className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink-900"><Grid3x3 className="h-4 w-4" /> Conferência em grade</h2>
      <p className="mb-2 text-xs text-ink-500">Toque 1× = <b className="text-success">conferida</b> · 2× = <b className="text-info">em uso</b> (com cliente — conta como presente) · 3× = limpa. As <b>não marcadas</b> viram apuração.</p>
      {/* Legenda das cores que NÃO se marca: elas estão na grade para o número
          não sumir do meio da sequência, mas se resolvem em outro lugar. */}
      {(underReview.length > 0 || lostNumbers.length > 0) && (
        <p className="mb-2 text-xs text-ink-500">
          {underReview.length > 0 && (
            <>
              <span className="rounded bg-warning-bg px-1.5 py-0.5 font-semibold text-warning">em apuração</span>
              {' '}({underReview.length}) — resolva no bloco Divergências, abaixo.{' '}
            </>
          )}
          {lostNumbers.length > 0 && (
            <>
              <span className="rounded bg-sunken px-1.5 py-0.5 font-semibold text-ink-500 line-through">baixada</span>
              {' '}({lostNumbers.length}) — perdida, fora da sequência.
            </>
          )}
        </p>
      )}
      {ultimaContagem && (selected.size > 0 || inUse.size > 0) && (
        /* De onde vieram as marcas. Sem isto, uma grade que abre verde vira
           carimbo: o gerente confirma sem conferir. Quando a marcação é de um
           dia anterior o aviso é vermelho, porque aí ela é só um ponto de
           partida — não um retrato do que está na bandeja agora. */
        <p className={`mb-2 rounded-md px-2 py-1 text-xs font-semibold ${ultimaContagem.deHoje ? 'bg-info/10 text-info' : 'bg-danger/10 text-danger'}`}>
          {ultimaContagem.deHoje
            ? `Grade aberta como ficou na contagem de hoje — ajuste o que mudou e reenvie para corrigir.`
            : `ATENÇÃO: as marcas são da contagem de ${ultimaContagem.data.split('-').reverse().join('/')}, não de hoje. Confira a bandeja antes de confirmar.`}
        </p>
      )}
      {temFaixaDoDia && (
        <div className="mb-2 rounded-lg bg-sunken p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="sgo-type-11 font-semibold text-ink-700">Esta conferência:</span>
            <button
              type="button"
              onClick={() => setModo('dia')}
              aria-pressed={modo === 'dia'}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${modo === 'dia' ? 'bg-brand text-on-brand' : 'border text-ink-700'}`}
            >
              Faixa do dia ({nightlyNumbers.length})
            </button>
            <button
              type="button"
              onClick={() => setModo('completa')}
              aria-pressed={modo === 'completa'}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${modo === 'completa' ? 'bg-brand text-on-brand' : 'border text-ink-700'}`}
            >
              Completa ({activeNumbers.length})
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {naFaixaDoDia ? (
              <>
                Conferindo <b>{faixaLabel}</b> — as comandas guardadas <b>não são julgadas</b> nesta contagem e não viram
                extraviadas. A contagem <b>completa</b> é a da semana.
              </>
            ) : (
              <>Conferindo <b>a sequência inteira</b> — o que ficar sem marcar vira apuração.</>
            )}
          </p>
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button onClick={() => { setSelected(new Set(conferiveis)); setInUse(new Set()); }} className="rounded-full border px-3 py-1 text-xs font-semibold">Marcar todas</button>
        <button onClick={() => { setSelected((s) => new Set([...s].filter((n) => !conferiveis.includes(n)))); setInUse((s) => new Set([...s].filter((n) => !conferiveis.includes(n)))); }} className="rounded-full border px-3 py-1 text-xs font-semibold">Limpar</button>
        <Input inputMode="numeric" value={filter} onChange={(e) => setFilter(e.target.value.replace(/\D/g, ''))} aria-label="Filtrar comandas pelo número" placeholder="filtrar nº" className="h-8 w-24 text-sm" />
        <span className="ml-auto text-xs font-semibold"><span className="text-success">{conferidas} ok</span>{emUso > 0 && <> · <span className="text-info">{emUso} em uso</span></>} · <span className={faltando > 0 ? 'text-danger' : 'text-ink-500'}>{faltando} faltando</span> / {total}</span>
      </div>
      {/* Seleção em lote por faixa (ex.: comandas guardadas) */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed p-2">
        <span className="text-xs font-semibold text-ink-500">Faixa:</span>
        <Input inputMode="numeric" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ''))} aria-label="Início da faixa de comandas" placeholder="de" className="h-8 w-16 text-sm" />
        <span className="text-xs text-ink-500">até</span>
        <Input inputMode="numeric" value={rangeTo} onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ''))} aria-label="Fim da faixa de comandas" placeholder="até" className="h-8 w-16 text-sm" />
        <button onClick={() => applyRange(true)} className="rounded-full border border-success/50 px-2.5 py-1 text-xs font-semibold text-success">Marcar faixa</button>
        <button onClick={() => applyRange(false)} className="rounded-full border border-danger/50 px-2.5 py-1 text-xs font-semibold text-danger">Desmarcar faixa</button>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border bg-surface p-2">
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-10">
          {shown.map((n) => (
            <button
              key={n}
              onClick={() => toggle(n)}
              disabled={reviewSet.has(n) || lostSet.has(n)}
              title={reviewSet.has(n) ? 'Em apuração — resolva no bloco Divergências' : lostSet.has(n) ? 'Baixada (perdida) — fora da sequência' : undefined}
              className={`rounded px-1 py-1 text-xs font-semibold ${
                lostSet.has(n) ? 'bg-sunken text-ink-500 line-through'
                : reviewSet.has(n) ? 'bg-warning-bg text-warning'
                : selected.has(n) ? 'bg-success text-on-brand'
                : inUse.has(n) ? 'bg-info text-on-brand'
                : 'border text-ink-500'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {shown.length === 0 && <p className="p-2 text-xs text-ink-500">Nenhum número com esse filtro.</p>}
      </div>
      {faltando > 0 && (
        <div className="mt-2">
          <Input
            ref={obsRef}
            value={obs}
            onChange={(e) => { setObs(e.target.value); if (e.target.value.trim()) setObsFaltando(false); }}
            aria-label="Observação sobre as comandas que faltam"
            aria-invalid={obsFaltando}
            placeholder={`Obrigatório: o que houve com as ${faltando} que faltam`}
            className={obsFaltando ? 'border-danger ring-1 ring-danger' : undefined}
          />
          {obsFaltando && (
            <p className="mt-1 text-xs font-medium text-danger">
              Escreva aqui o que houve com as comandas que faltam — sem isso a conferência não é registrada.
            </p>
          )}
        </div>
      )}
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
      <h2 className="mb-2 sgo-type-11 font-semibold text-ink-900">Reposição (Admin)</h2>
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
