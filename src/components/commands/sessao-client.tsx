'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, CircleSlash, Flag, ScanLine, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/ds/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { parseCommandBarcode } from '@/lib/commands/barcode';

export interface SessaoNaTela {
  id: string;
  unitName: string;
  tipo: string;
  metodo: string;
  /** MANUAL / LEITOR / MISTO — decide o que a tela oferece. */
  metodoId: 'MANUAL' | 'LEITOR' | 'MISTO';
  iniciadaEm: string;
  responsavel: string | null;
  escopo: number[];
  conferidas: number[];
  emUso: number[];
  faltando: number[];
  /** v1.193.0: em apuração — ficam na grade; marcar presente = recuperada. */
  emApuracao?: number[];
  /** v1.193.0: baixadas — ficam na grade; marcar presente desfaz a baixa. */
  baixadas?: number[];
  pct: number;
}

type Estado = 'CONFERIDA' | 'EM_USO' | 'LIMPA';
type Filtro = 'TODAS' | 'CONFERIDAS' | 'NAO_CONFERIDAS' | 'EM_USO';

const CLASSE: Record<Estado, string> = {
  CONFERIDA: 'bg-success text-on-brand border-success',
  EM_USO: 'bg-info text-on-brand border-info',
  LIMPA: 'border-line-strong text-ink-500',
};

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'TODAS', label: 'Todas' },
  { id: 'CONFERIDAS', label: 'Conferidas' },
  { id: 'NAO_CONFERIDAS', label: 'Não conferidas' },
  { id: 'EM_USO', label: 'Em uso' },
];

/**
 * Janela em que a MESMA comanda relida não vira aviso.
 *
 * Leitor de mão em modo contínuo relê o código enquanto está apontado para a
 * etiqueta: a primeira leitura conferia e as seguintes enchiam a tela de "já
 * conferida", parecendo defeito. Dentro da janela a releitura é ignorada em
 * silêncio; fora dela é o operador bipando de novo de propósito, e aí o aviso
 * com o horário da primeira leitura é o que ele precisa ver.
 */
const JANELA_RELEITURA_MS = 2500;

type Retorno = { tipo: 'OK' | 'DUPLICADA' | 'FORA' | 'ERRO'; texto: string };

/**
 * A conferência EM ANDAMENTO.
 *
 * O que esta tela nunca faz: mostrar marca que não é desta sessão. Era o
 * defeito de origem — a grade reabria com o que outra contagem tinha marcado, e
 * a tela precisava avisar *"as marcas são da contagem de 03/09, não de hoje"*.
 * Aqui a sessão é a dona das marcas, e sessão nova nasce vazia.
 */
export function SessaoClient({ sessao, podeEditar }: { sessao: SessaoNaTela; podeEditar: boolean }) {
  const router = useRouter();
  const [conferidas, setConferidas] = useState<Set<number>>(new Set(sessao.conferidas));
  const [emUso, setEmUso] = useState<Set<number>>(new Set(sessao.emUso));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fechando, setFechando] = useState(false);
  /* v1.193.0: o servidor exigiu observação embora a tela não visse faltante
     (o escopo pode ter mudado desde que a página abriu) — sem isto o campo não
     aparecia e o finalizar ficava num beco. */
  const [exigirObs, setExigirObs] = useState(false);
  /* v1.192.0: cancelar passa pela MESMA porta do finalizar — uma janela própria que desliga o leitor.
     Antes era um confirm() nativo: tocar em "Cancelar" tirava o foco do campo do leitor, o onBlur o
     recapturava 50 ms depois (a conferência ainda estava "em curso") e a tela pulava para "bipe a
     comanda"; a confirmação ficava para trás e a pessoa não conseguia cancelar. */
  const [cancelando, setCancelando] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [busca, setBusca] = useState('');

  /* Leitor */
  const [leitura, setLeitura] = useState('');
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ultimaLeitura = useRef<{ n: number; em: number } | null>(null);

  const escopoSet = useMemo(() => new Set(sessao.escopo), [sessao.escopo]);
  const apuracaoSet = useMemo(() => new Set(sessao.emApuracao ?? []), [sessao.emApuracao]);
  const baixadaSet = useMemo(() => new Set(sessao.baixadas ?? []), [sessao.baixadas]);
  const usaLeitor = sessao.metodoId === 'LEITOR' || sessao.metodoId === 'MISTO';
  const usaGrade = sessao.metodoId === 'MANUAL' || sessao.metodoId === 'MISTO';

  /**
   * O leitor é um teclado: o campo precisa estar focado durante a conferência,
   * ou a bipada se perde no vazio.
   *
   * ⚠️ MAS SÓ DURANTE A CONFERÊNCIA. Enquanto o diálogo de finalizar está
   * aberto, o campo do leitor NÃO pode recapturar o foco: era isso que
   * travava a justificativa — a pessoa clicava em "O que houve?", começava a
   * escrever, e o `onBlur` do leitor puxava o foco de volta 50ms depois. O
   * campo obrigatório ficava impossível de preencher, e com ele o botão de
   * finalizar ficava inalcançável.
   *
   * `leitorAtivo` é a condição única: ela vale no efeito E no `onBlur`, porque
   * duas condições escritas em lugares diferentes é como uma delas envelhece
   * sozinha.
   */
  const leitorAtivo = usaLeitor && podeEditar && !fechando && !cancelando;

  /* Uma REFERÊNCIA, e não a variável: o `onBlur` agenda um timeout, e o valor
     capturado no closure é o do instante em que ele foi AGENDADO. Ao tocar em
     "Finalizar conferência" o campo perde o foco no mesmo momento em que o
     diálogo abre — com a variável, aquele timeout ainda veria `true` e
     roubaria o foco de volta, que é justamente o defeito. A referência é lida
     quando o timeout DISPARA. */
  const leitorAtivoRef = useRef(leitorAtivo);
  leitorAtivoRef.current = leitorAtivo;

  /* v1.193.1 — O LEITOR NÃO ROUBA MAIS A TELA. Três regras:
     (1) todo foco no campo é SEM ROLAGEM (`preventScroll`): o campo mora no
         topo da página e cada toque num número da grade fazia a tela pular
         para "bipe a comanda" ("ao clicar no número vai para a aba de bipagem");
     (2) o `onBlur` só recaptura o foco quando ele foi para LUGAR NENHUM
         (`relatedTarget` nulo = clique em área morta) — se foi para um botão
         da grade, um filtro ou um campo, é a pessoa trabalhando na tela;
     (3) o leitor continua funcionando com o foco fora do campo: um teclado
         (o leitor é um) digitando dígitos sobre a página é redirecionado ao
         campo, com o primeiro caractere preservado. */
  const focarLeitor = () => inputRef.current?.focus({ preventScroll: true });
  useEffect(() => {
    if (leitorAtivo) focarLeitor();
  }, [leitorAtivo, retorno]);

  useEffect(() => {
    if (!leitorAtivo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (!leitorAtivoRef.current) return;
      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || alvo?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!/^[0-9A-Za-z]$/.test(e.key)) return;
      e.preventDefault();
      setLeitura((v) => v + e.key);
      focarLeitor();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [leitorAtivo]);

  const estadoDe = (n: number): Estado => (conferidas.has(n) ? 'CONFERIDA' : emUso.has(n) ? 'EM_USO' : 'LIMPA');
  const vistas = conferidas.size + emUso.size;
  const faltando = sessao.escopo.filter((n) => !conferidas.has(n) && !emUso.has(n));
  const pct = sessao.escopo.length === 0 ? 0 : Math.round((vistas / sessao.escopo.length) * 100);

  const visiveis = useMemo(() => {
    const porFiltro = sessao.escopo.filter((n) => {
      const e = estadoDe(n);
      if (filtro === 'CONFERIDAS') return e === 'CONFERIDA';
      if (filtro === 'NAO_CONFERIDAS') return e === 'LIMPA';
      if (filtro === 'EM_USO') return e === 'EM_USO';
      return true;
    });
    const q = busca.trim();
    return q ? porFiltro.filter((n) => String(n).includes(q)) : porFiltro;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao.escopo, filtro, busca, conferidas, emUso]);

  /* Um toque = conferida, dois = em uso, três = limpa. É o gesto que a grade
     antiga já tinha, mantido de propósito: quem confere 651 comandas por noite
     não pode reaprender o toque. */
  const proximo = (atual: Estado): Estado => (atual === 'LIMPA' ? 'CONFERIDA' : atual === 'CONFERIDA' ? 'EM_USO' : 'LIMPA');

  async function gravar(n: number, estado: Estado, method: 'MANUAL' | 'LEITOR') {
    const res = await fetch('/api/commands/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'marcar', sessionId: sessao.id, number: n, state: estado === 'LIMPA' ? null : estado, method }),
    });
    return { ok: res.ok, body: await res.json().catch(() => ({} as Record<string, unknown>)) };
  }

  function aplicar(n: number, estado: Estado) {
    const c = new Set(conferidas); const u = new Set(emUso);
    c.delete(n); u.delete(n);
    if (estado === 'CONFERIDA') c.add(n);
    if (estado === 'EM_USO') u.add(n);
    setConferidas(c); setEmUso(u);
    return { c, u };
  }

  async function tocar(n: number) {
    if (!podeEditar || busy) return;
    const alvo = proximo(estadoDe(n));
    setErro(null);
    const antesC = new Set(conferidas); const antesU = new Set(emUso);
    /* Otimista: a grade responde ao toque na hora. 651 toques esperando o
       servidor um a um seria inutilizável no celular do caixa. */
    aplicar(n, alvo);
    const { ok, body } = await gravar(n, alvo, 'MANUAL');
    if (!ok) {
      setConferidas(antesC); setEmUso(antesU); // desfaz: o servidor é a verdade
      setErro(String(body.error ?? 'Não foi possível marcar.'));
    }
  }

  /* ── O leitor ── */
  async function bipar(raw: string) {
    setLeitura('');
    const r = parseCommandBarcode(raw, escopoSet);

    if (r.number === null) {
      setRetorno({ tipo: 'ERRO', texto: `Leitura não reconhecida: "${r.raw.slice(0, 24)}"` });
      return;
    }
    if (!escopoSet.has(r.number)) {
      setRetorno({ tipo: 'FORA', texto: `A comanda nº ${r.number} não faz parte desta conferência.` });
      return;
    }

    const agora = Date.now();
    const ult = ultimaLeitura.current;
    if (ult && ult.n === r.number && agora - ult.em < JANELA_RELEITURA_MS) return; // releitura contínua: silêncio
    ultimaLeitura.current = { n: r.number, em: agora };

    const jaVista = conferidas.has(r.number) || emUso.has(r.number);
    aplicar(r.number, 'CONFERIDA');
    const { ok, body } = await gravar(r.number, 'CONFERIDA', 'LEITOR');

    if (!ok) {
      setRetorno({ tipo: 'ERRO', texto: String(body.error ?? 'Não foi possível registrar a leitura.') });
      return;
    }
    if (jaVista || body.jaEstava) {
      /* Não duplica a contagem — a chave é (sessão, número). O aviso existe
         para o operador saber que aquela ele já fez. */
      const em = body.em ? new Date(String(body.em)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
      setRetorno({ tipo: 'DUPLICADA', texto: `Comanda nº ${r.number} já foi conferida${em ? ` às ${em}` : ''}.` });
      return;
    }
    setRetorno({ tipo: 'OK', texto: `Comanda nº ${r.number} conferida.` });
  }

  async function emLote(estado: Estado) {
    if (!podeEditar) return;
    setBusy(true); setErro(null);
    /* Só o que está VISÍVEL no filtro: "marcar todas" com um filtro ligado
       significando "todas as 651" seria uma armadilha. */
    const alvo = visiveis.filter((n) => estadoDe(n) !== estado);
    if (alvo.length === 0) { setBusy(false); return; }
    const antesC = new Set(conferidas); const antesU = new Set(emUso);
    const c = new Set(conferidas); const u = new Set(emUso);
    for (const n of alvo) { c.delete(n); u.delete(n); if (estado === 'CONFERIDA') c.add(n); if (estado === 'EM_USO') u.add(n); }
    setConferidas(c); setEmUso(u);
    try {
      /* v1.193.0: UMA chamada para o lote. Eram 651 em fila, com o botão de
         finalizar desligado enquanto durava. */
      const res = await fetch('/api/commands/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'marcarVarios', sessionId: sessao.id, numbers: alvo, state: estado === 'LIMPA' ? null : estado, method: 'MANUAL' }),
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) { setConferidas(antesC); setEmUso(antesU); setErro(String(body.error ?? 'Não foi possível marcar em lote.')); return; }
      router.refresh();
    } catch {
      setConferidas(antesC); setEmUso(antesU); setErro('Falha de conexão. Tente de novo.');
    } finally { setBusy(false); }
  }

  async function finalizar() {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/commands/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalizar', sessionId: sessao.id, observation: observacao }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { router.push(`/modulos/comandas/conferencias/${sessao.id}`); router.refresh(); return; }
      if (d.reason === 'OBSERVATION_REQUIRED') setExigirObs(true);
      /* Já encerrada (por outra pessoa, ou um segundo toque): a tela de resultado é o destino. */
      if (d.reason === 'JA_CONCLUIDA') { router.push(`/modulos/comandas/conferencias/${sessao.id}`); router.refresh(); return; }
      setErro(d.error ?? 'Não foi possível finalizar.');
    } finally { setBusy(false); }
  }

  async function cancelar() {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/commands/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancelar', sessionId: sessao.id }),
      });
      const d = await res.json().catch(() => ({}));
      /* Já encerrada por outra pessoa = também não está mais em andamento: sair é o certo. */
      if (res.ok || d.reason === 'JA_CONCLUIDA') { router.push('/modulos/comandas'); router.refresh(); return; }
      setErro(d.error ?? 'Não foi possível cancelar.');
    } catch {
      setErro('Falha de conexão. Tente de novo.');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* ── O progresso, sempre à vista ── */}
      <div className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3">
        <p className="text-sm font-bold text-ink-900">Conferência em andamento</p>
        <p className="text-xs text-ink-700">
          {sessao.tipo} · {sessao.metodo} · iniciada em {sessao.iniciadaEm}
          {sessao.responsavel ? ` por ${sessao.responsavel}` : ''}
        </p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">
          {vistas} de {sessao.escopo.length} conferidas — {pct}%
        </p>
        <p className="text-sm font-semibold text-danger">Faltam: {faltando.length}</p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── O leitor ── */}
      {usaLeitor && podeEditar && (
        <div className="rounded-lg border-2 border-line-strong p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            <ScanLine className="h-4 w-4 text-brand" /> Leitor conectado — aguardando leitura
          </p>
          <p className="mb-2 text-xs text-ink-700">
            Mantenha este campo em foco. O leitor funciona como teclado: cada bipada entra e conta sozinha.
          </p>
          <Input
            ref={inputRef}
            value={leitura}
            onChange={(e) => setLeitura(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void bipar(leitura); } }}
            /* Recaptura o foco só enquanto a conferência está em curso — pela
               REFERÊNCIA, que vale o estado do instante em que o timeout
               dispara, e não o de quando foi agendado. */
            onBlur={(e) => {
              /* Foi para um botão/campo? É a pessoa usando a tela: deixa. Só
                 recaptura quando o foco se perdeu (clique em área morta). */
              if (e.relatedTarget) return;
              setTimeout(() => { if (leitorAtivoRef.current && document.activeElement === document.body) focarLeitor(); }, 50);
            }}
            placeholder="bipe a comanda…"
            className="h-11 text-base tabular-nums"
          />
          {retorno && (
            <p className={`mt-2 flex items-center gap-1.5 rounded-md p-2 text-sm font-medium ${
              retorno.tipo === 'OK' ? 'bg-success/10 text-success'
                : retorno.tipo === 'DUPLICADA' ? 'bg-warning-bg text-warning'
                  : 'bg-danger/10 text-danger'
            }`}>
              {retorno.tipo === 'OK' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              {retorno.texto}
            </p>
          )}
        </div>
      )}

      {/* ── Legenda ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-dashed p-2 text-xs text-ink-700">
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-success" /> Conferida</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-info" /> Em uso (conta como presente)</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded border border-line-strong" /> Não conferida</span>
        {apuracaoSet.size > 0 && <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded border border-warning bg-warning-bg" /> Em apuração ({apuracaoSet.size}) — toque se encontrou: volta à sequência</span>}
        {baixadaSet.size > 0 && <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded border border-line-strong bg-sunken" /> Baixada ({baixadaSet.size}) — toque se encontrou: desfaz a baixa</span>}
      </div>

      {usaGrade && (
        <>
          {/* ── Filtros e busca ── */}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtro === f.id ? 'border-brand bg-brand text-on-brand' : 'text-ink-700'}`}
              >
                {f.label}
              </button>
            ))}
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="buscar número…"
              inputMode="numeric"
              className="h-8 w-32 text-xs tabular-nums"
            />
          </div>

          {podeEditar && (
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void emLote('CONFERIDA')}>
                <Check className="h-4 w-4" /> Marcar {filtro === 'TODAS' && !busca ? 'todas' : `as ${visiveis.length} da lista`}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void emLote('LIMPA')}>
                <CircleSlash className="h-4 w-4" /> Limpar {filtro === 'TODAS' && !busca ? '' : 'a lista'}
              </Button>
            </div>
          )}

          {erro && <p className="text-sm font-medium text-danger">{erro}</p>}

          <p className="text-xs text-ink-500">
            {visiveis.length} de {sessao.escopo.length} comandas nesta visão.
          </p>

          {/* ── A grade ── */}
          <div className="flex flex-wrap gap-1">
            {visiveis.map((n) => {
              const e = estadoDe(n);
              /* v1.193.0: em apuração e baixada SEGUEM na grade, com a própria cor enquanto
                 não forem tocadas — tocar marca presente, e no finalizar o servidor as recupera. */
              const classe = e !== 'LIMPA' ? CLASSE[e] : apuracaoSet.has(n) ? 'border-warning bg-warning-bg text-warning' : baixadaSet.has(n) ? 'border-line-strong bg-sunken text-ink-500 line-through' : CLASSE.LIMPA;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!podeEditar}
                  onClick={() => void tocar(n)}
                  title={e === 'LIMPA' && apuracaoSet.has(n) ? 'Em apuração — toque se encontrou: volta à sequência' : e === 'LIMPA' && baixadaSet.has(n) ? 'Baixada — toque se encontrou: desfaz a baixa' : undefined}
                  data-situacao={e === 'LIMPA' && apuracaoSet.has(n) ? 'apuracao' : e === 'LIMPA' && baixadaSet.has(n) ? 'baixada' : undefined}
                  className={`h-9 w-11 rounded-md border text-xs font-semibold tabular-nums ${classe}`}
                >
                  {n}
                </button>
              );
            })}
            {visiveis.length === 0 && <p className="text-sm text-ink-500">Nenhuma comanda nesta visão.</p>}
          </div>
        </>
      )}

      {!usaGrade && erro && <p className="text-sm font-medium text-danger">{erro}</p>}

      {podeEditar && (
        <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 py-3 print:hidden">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => { setObservacao(''); setFechando(true); }}>
              <Flag className="h-4 w-4" /> Finalizar conferência
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setErro(null); setCancelando(true); }} data-testid="abrir-cancelar">
              <X className="h-4 w-4" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {cancelando && (
        <Sheet
          open onClose={() => setCancelando(false)}
          title="Cancelar esta conferência?"
          description={`${vistas} de ${sessao.escopo.length} comandas verificadas até aqui.`}
          footer={
            <div className="space-y-2">
              {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void cancelar()} data-testid="confirmar-cancelar">
                  {busy ? 'Cancelando…' : 'Sim, cancelar conferência'}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setCancelando(false)}>Continuar conferindo</Button>
              </div>
            </div>
          }
        >
          <p className="text-sm text-ink-700">O que foi marcado até aqui fica no histórico como conferência cancelada, mas nada será apurado: nenhuma comanda vira ausente e nenhuma divergência é aberta. Depois você pode iniciar uma nova.</p>
        </Sheet>
      )}

      {fechando && (
        <Sheet
          open onClose={() => setFechando(false)}
          title="Finalizar conferência"
          description={`${vistas} de ${sessao.escopo.length} comandas verificadas.`}
          footer={
            <div className="space-y-2">
              {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void finalizar()}>
                  {busy ? 'Finalizando…' : faltando.length > 0 ? 'Finalizar e enviar para apuração' : 'Finalizar conferência'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFechando(false)}>Continuar conferindo</Button>
              </div>
            </div>
          }
        >
          <div className="space-y-3">
            {faltando.length === 0 && !exigirObs ? (
              <p className="rounded-lg border border-success bg-success/10 p-2.5 text-sm text-success">
                Todas as {sessao.escopo.length} comandas foram verificadas. Deseja finalizar?
              </p>
            ) : (
              <>
                {/* As faltantes APARECEM antes de confirmar: o pedido era esse, e
                    o motivo é simples — quase sempre a comanda está ali e a
                    pessoa só não marcou. */}
                <p className="rounded-lg border border-warning bg-warning-bg p-2.5 text-sm text-warning">
                  <b>{vistas} de {sessao.escopo.length}</b> comandas foram verificadas. Existem{' '}
                  <b>{faltando.length}</b> não localizadas.
                </p>
                <div>
                  <Label className="text-xs">Não localizadas</Label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {faltando.map((n) => (
                      <span key={n} className="rounded-md border border-warning px-2 py-1 text-xs font-semibold tabular-nums text-warning">{n}</span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-ink-700">
                  Elas <b>não viram &quot;perdidas&quot;</b> agora: entram <b>em apuração</b>. Perdida ou recuperada é
                  decisão de quem apura, depois.
                </p>
                <div>
                  <Label className="text-xs">O que houve? (obrigatório)</Label>
                  <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} className="h-9 text-sm" placeholder="ex.: faltaram duas no caixa 2" />
                </div>
              </>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
