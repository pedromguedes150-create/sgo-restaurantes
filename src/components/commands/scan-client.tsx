'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, ScanLine, Undo2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { escopoDoLeitor } from '@/lib/commands/scan-scope';
import { parseCommandBarcode, type ScanReason } from '@/lib/commands/barcode';

interface CrossHit {
  number: number;
  value: number;
  openedAt: string | null;
  daysOpen: number;
}

interface Props {
  unitId: string;
  unitName: string;
  operationalDate: string;
  /** TODAS as ativas — o universo que o leitor aceita bipar. */
  activeNumbers: number[];
  /** A faixa do dia. Bipar fora dela transforma a conferência em completa. */
  nightlyNumbers?: number[];
  /** A unidade tem faixa de madrugada: esta conferência começa parcial. */
  partial: boolean;
  totalAtivas: number;
  alreadyCounted: boolean;
  userName: string;
}

type LogEntry = { id: number; raw: string; number: number | null; reason: ScanReason | 'DUPLICATE' };

const REASON_TEXT: Record<LogEntry['reason'], string> = {
  OK: 'conferida',
  DUPLICATE: 'já bipada',
  NOT_ACTIVE: 'não pertence à sequência',
  NO_DIGITS: 'código sem número',
  EMPTY: 'leitura vazia',
  NOT_A_COMMAND: 'QR do cartão (não é comanda)',
};

/**
 * Janela em que a MESMA comanda relida não vira aviso.
 *
 * Leitor de mão em modo contínuo relê o código enquanto está apontado para a
 * etiqueta: a primeira leitura conferia e as seguintes enchiam a lista de "já
 * bipada", parecendo defeito. Dentro da janela, a releitura é ignorada em
 * silêncio; fora dela é o operador bipando de novo de propósito, e aí o aviso
 * discreto ajuda.
 */
const JANELA_RELEITURA_MS = 2500;

export function ScanClient({ unitId, unitName, operationalDate, activeNumbers, nightlyNumbers = [], partial, totalAtivas, alreadyCounted, userName }: Props) {
  const active = useMemo(() => new Set(activeNumbers), [activeNumbers]);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);

  const [value, setValue] = useState('');
  const [scanned, setScanned] = useState<Set<number>>(new Set());
  const [log, setLog] = useState<LogEntry[]>([]);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ absent: number[]; scanned: number; crossed: CrossHit[]; cutDate: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Quantas vezes o QR do cartão apareceu. Não vai para a lista — mas some do
     nada também não serve: fica um contador discreto no rodapé. */
  const [ignorados, setIgnorados] = useState(0);
  const [releituras, setReleituras] = useState(0);
  const ultimaLeitura = useRef<Map<number, number>>(new Map());

  // o leitor "digita" no campo focado — manter o foco é o que faz a bipagem funcionar
  const keepFocus = () => inputRef.current?.focus();
  useEffect(() => {
    keepFocus();
  }, []);

  /* O ESCOPO SEGUE O QUE FOI BIPADO, com a mesma regra do servidor: só a
     faixa do dia = parcial; apareceu uma de fora = contagem completa. Derivar
     (em vez de guardar num estado) é o que impede a tela dizer "parcial"
     enquanto o servidor grava "completa". */
  const faixaDoDia = useMemo(() => new Set(nightlyNumbers), [nightlyNumbers]);
  const { escopo, completa, foraDaFaixa } = useMemo(
    () => escopoDoLeitor(active, faixaDoDia, partial && nightlyNumbers.length > 0, scanned),
    [active, faixaDoDia, partial, nightlyNumbers.length, scanned],
  );
  const noEscopo = useMemo(() => [...escopo].sort((a, b) => a - b), [escopo]);
  const missing = noEscopo.filter((n) => !scanned.has(n));

  function register(raw: string) {
    const r = parseCommandBarcode(raw, active);
    seqRef.current += 1;
    const id = seqRef.current;

    const add = (entry: LogEntry) => setLog((l) => [entry, ...l].slice(0, 60));

    /* O QR do Instagram vem no próprio cartão: leitor 2D lê os dois códigos.
       Não é erro e não polui a lista — só conta no rodapé. */
    if (r.reason === 'NOT_A_COMMAND') {
      setIgnorados((n) => n + 1);
      return;
    }

    if (r.number !== null && scanned.has(r.number)) {
      const agora = Date.now();
      const antes = ultimaLeitura.current.get(r.number) ?? 0;
      ultimaLeitura.current.set(r.number, agora);
      /* Releitura imediata do mesmo código = leitor de mão apontado para a
         etiqueta. Silencioso, senão a lista vira uma parede de "já bipada". */
      if (agora - antes < JANELA_RELEITURA_MS) { setReleituras((n) => n + 1); return; }
      add({ id, raw: r.raw, number: r.number, reason: 'DUPLICATE' });
      return;
    }
    if (r.number !== null) {
      const n = r.number;
      ultimaLeitura.current.set(n, Date.now());
      setScanned((s) => new Set(s).add(n));
      add({ id, raw: r.raw, number: n, reason: 'OK' });
      return;
    }
    add({ id, raw: r.raw, number: r.guess, reason: r.reason });
  }

  function undoLast() {
    const last = log.find((l) => l.reason === 'OK');
    if (!last?.number) return;
    setScanned((s) => {
      const n = new Set(s);
      n.delete(last.number!);
      return n;
    });
    setLog((l) => l.filter((x) => x.id !== last.id));
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/commands/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, scannedNumbers: [...scanned], note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? 'Falha ao registrar a conferência');
        return;
      }
      setDone({ absent: d.absent ?? [], scanned: d.scanned ?? 0, crossed: d.crossed ?? [], cutDate: d.cutDate ?? null });
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-2 py-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <p className="text-lg font-bold text-ink-900">Conferência registrada</p>
            <p className="text-sm text-ink-500">
              {unitName} — {operationalDate} · {done.scanned} conferida(s) · <strong>{done.absent.length} faltante(s)</strong>
            </p>
            {done.absent.length > 0 && (
              <p className="mx-auto max-w-lg break-words rounded-md bg-danger/10 p-2 text-sm text-danger">
                Faltantes: {done.absent.join(', ')}
              </p>
            )}
            <p className="text-xs text-ink-500">
              {done.absent.length > 0 ? 'O supervisor da unidade já foi avisado.' : 'Todas as comandas presentes ✓'}
            </p>
          </CardContent>
        </Card>

        {done.crossed.length > 0 && (
          <Card className="border-danger">
            <CardContent className="space-y-2 py-4">
              <p className="flex items-center gap-2 font-bold text-danger">
                <ShieldAlert className="h-5 w-5" /> Atenção: {done.crossed.length} comanda(s) faltante(s) estão ABERTAS com valor no sistema
              </p>
              <p className="text-xs text-ink-500">
                Cruzamento com a última análise de comandas em aberto{done.cutDate ? ` (corte ${done.cutDate})` : ''}. Sumir da bandeja E continuar aberta com
                consumo é o padrão da fraude das &quot;2 comandas&quot; — leve estes números e horários ao monitoramento.
              </p>
              <ul className="space-y-1 text-sm">
                {done.crossed.map((c) => (
                  <li key={c.number} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0">
                    <span className="font-semibold">Comanda {c.number}</span>
                    <span className="text-ink-500">
                      aberta {c.openedAt?.replace('T', ' ') ?? '—'} · {c.daysOpen} dia(s) · R$ {c.value.toFixed(2).replace('.', ',')}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" onClick={keepFocus}>
      {partial && !completa && (
        /* O caixa precisa saber que NÃO está conferindo tudo — senão pensa que
           faltou comanda quando o número "ativas" não bate com o total da casa.
           E o supervisor precisa saber que o resto não foi julgado nesta noite. */
        <p className="rounded-md bg-info-bg p-2 text-sm text-info">
          <strong>Conferência da madrugada (parcial).</strong> Você confere {noEscopo.length} comanda(s) desta faixa.
          As outras {Math.max(0, totalAtivas - noEscopo.length)} da unidade <strong>não entram nesta contagem</strong> e não
          serão tratadas como extraviadas — elas são conferidas na contagem completa da semana.
          {' '}Se você bipar uma comanda <strong>fora desta faixa</strong>, a conferência passa a ser a <strong>completa</strong>.
        </p>
      )}
      {partial && completa && (
        /* A mudança de modo tem de ser DITA. Sem isso o contador salta de 300
           para 648 e o caixa acha que o sistema enlouqueceu. */
        <p className="rounded-md bg-warning-bg p-2 text-sm text-warning">
          <strong>Conferência COMPLETA.</strong> Você bipou a comanda {foraDaFaixa[0]}, que está fora da faixa do dia — então
          esta conferência passou a valer para <strong>todas as {noEscopo.length}</strong> comandas da unidade.
          {foraDaFaixa.length > 1 ? ` (${foraDaFaixa.length} fora da faixa até agora.)` : ''}
        </p>
      )}
      {alreadyCounted && (
        <p className="rounded-md bg-warning/10 p-2 text-sm text-warning">
          Já existe uma contagem registrada hoje nesta unidade. Se você concluir, ela será <strong>substituída</strong> por esta conferência.
        </p>
      )}

      <Card>
        <CardContent className="grid grid-cols-3 gap-2 py-3 text-center">
          <div>
            <p className="sgo-type-24 font-semibold text-success">{scanned.size}</p>
            <p className="text-xs text-ink-500">conferidas</p>
          </div>
          <div>
            <p className="sgo-type-24 font-semibold text-ink-900">{noEscopo.length}</p>
            <p className="text-xs text-ink-500">{partial && !completa ? 'nesta faixa' : 'ativas'}</p>
          </div>
          <div>
            <p className={`sgo-type-24 font-semibold ${missing.length ? 'text-danger' : 'text-success'}`}>{missing.length}</p>
            <p className="text-xs text-ink-500">faltando</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-4">
          <label htmlFor="bipe" className="text-sm font-semibold text-brand">
            Bipe as comandas aqui
          </label>
          <Input
            id="bipe"
            ref={inputRef}
            autoFocus
            autoComplete="off"
            inputMode="numeric"
            className="h-14 text-center text-lg font-bold"
            placeholder="passe o leitor na comanda…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTimeout(keepFocus, 50)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              register(value);
              setValue('');
            }}
          />
          <p className="text-xs text-ink-500">
            O leitor funciona como teclado: ele digita o código e dá Enter sozinho. Mantenha esta tela aberta e vá passando as comandas. Dá para digitar o
            número à mão e apertar Enter.
          </p>
          {(ignorados > 0 || releituras > 0) && (
            /* Discreto de propósito: nada disso é problema, mas sumir em silêncio
               deixaria o operador sem saber por que o leitor bipou e a lista não
               mexeu. */
            <p className="text-xs text-ink-500">
              {ignorados > 0 && <>QR do cartão ignorado: {ignorados}. </>}
              {releituras > 0 && <>Releitura da mesma comanda ignorada: {releituras}.</>}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={undoLast} disabled={!log.some((l) => l.reason === 'OK')}>
              <Undo2 className="h-4 w-4" /> Desfazer última
            </Button>
            <Button size="sm" onClick={() => setConfirming(true)} disabled={busy || scanned.size === 0}>
              <ScanLine className="h-4 w-4" /> Concluir conferência
            </Button>
          </div>
        </CardContent>
      </Card>

      {confirming && (
        <Card className="border-brand">
          <CardContent className="space-y-3 py-4">
            <p className="font-bold text-ink-900">Concluir a conferência de {unitName}?</p>
            <p className="text-sm">
              {scanned.size} conferida(s) · <strong className={missing.length ? 'text-danger' : 'text-success'}>{missing.length} faltante(s)</strong>
              {missing.length > 0 && missing.length <= 40 && <span className="block break-words text-xs text-ink-500">Faltantes: {missing.join(', ')}</span>}
            </p>
            {missing.length > 0 && (
              <p className="flex items-start gap-2 text-xs text-ink-500">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                Cada faltante vira uma divergência e o supervisor da unidade é avisado na hora. Confira se não sobrou comanda fora da bandeja antes de concluir.
              </p>
            )}
            <Input placeholder="Observação (opcional) — ex.: 3 comandas em uso na mesa 12" value={note} onChange={(e) => setNote(e.target.value)} className="h-10 text-sm" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void finish()}>
                Confirmar e registrar
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
                Voltar e continuar bipando
              </Button>
            </div>
            <p className="text-xs text-ink-500">Registrando como {userName}.</p>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {log.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 sgo-type-11 font-semibold text-ink-500">Últimas leituras</p>
            <ul className="space-y-1 text-sm">
              {log.slice(0, 12).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
                  <span className="font-semibold">{l.number ?? l.raw}</span>
                  <span className={l.reason === 'OK' ? 'text-success' : l.reason === 'DUPLICATE' ? 'text-ink-500' : 'text-danger'}>
                    {REASON_TEXT[l.reason]}
                    {l.reason === 'NOT_ACTIVE' && <span className="block text-xs">código lido: {l.raw}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
