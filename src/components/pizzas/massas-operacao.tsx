'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Lock, PackagePlus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input, Textarea } from '@/components/ui/ds/field';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { emBR } from '@/lib/pizzas/tipos';
import {
  MOTIVOS_DESPERDICIO, ROTULO_SITUACAO, rotuloDaFaixa, rotuloDoMotivo,
  type FaixaDeValidade, type MotivoDesperdicio, type SituacaoDoDia,
} from '@/lib/pizzas/massas-tipos';

/**
 * A OPERAÇÃO de massas — recebimento, desperdício e fechamento do estoque.
 *
 * UM componente para as DUAS portas: o link público (funcionário, só o dia
 * atual) e a gestão no painel (gerente/supervisão, qualquer dia). A tela que o
 * gerente usa para corrigir é a MESMA que o funcionário usou para lançar — só
 * ganha o campo "motivo da alteração" quando o dia é anterior. Duas telas para
 * a mesma coisa foi o defeito da v1.94.0.
 */

export type PortaDeMassas =
  | { tipo: 'link'; token: string }
  | { tipo: 'gestao'; unitId: string };

export interface EstadoParaTela {
  hoje: string;
  data: string;
  dia: {
    inicial: number; recebidas: number; vendidas: number; desperdicadas: number; esperado: number;
    fisico: number | null; divergencia: number | null; situacao: SituacaoDoDia; alteradoDepois: boolean;
  };
  lancamentos: {
    recebimentos: { id: string; quantidade: number; validade: string; lotCode: string | null }[];
    desperdicios: { id: string; quantidade: number; motivo: MotivoDesperdicio; observacao: string | null; temFoto: boolean; loteId: string | null }[];
    contagem: { fisico: number; justificativa: string | null; atualizadoEm: string } | null;
  };
  lotes: {
    lotes: { id: string; lotCode: string | null; recebidoEm: string; validade: string; disponivel: number; diasRestantes: number; faixa: FaixaDeValidade }[];
    semLote: number;
    total: number;
  };
  vendasFechadas: boolean;
}

export type Secao = 'recebimento' | 'desperdicio' | 'fechamento';

interface Props {
  porta: PortaDeMassas;
  estadoInicial: EstadoParaTela;
  /** Uma seção só (link) ou as três empilhadas (gestão). */
  secao?: Secao;
  /** Endereço do fechamento de vendas, para o aviso quando ele ainda não foi enviado. */
  hrefVendas?: string;
}

const TOM_FAIXA: Record<FaixaDeValidade, 'danger' | 'warning' | 'neutral'> = {
  VENCIDO: 'danger', VENCE_HOJE: 'danger', PROXIMO: 'warning', OK: 'neutral',
};

export function MassasOperacao({ porta, estadoInicial, secao, hrefVendas }: Props) {
  const [estado, setEstado] = useState<EstadoParaTela>(estadoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /* Motivo da alteração: só existe na gestão e só quando o dia é anterior. */
  const [motivoAlteracao, setMotivoAlteracao] = useState('');
  /* O campo de motivo e o aviso de erro moram no TOPO, e o botão "Salvar" de
     cada seção fica lá embaixo numa tela longa: sem isto, clicar em salvar num
     dia anterior sem motivo mostrava o erro fora da tela — e parecia que "não
     salvava". Ao recusar, o campo recebe o foco (e rola até ele); qualquer
     erro rola até o aviso. */
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const erroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (erro) erroRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [erro]);

  const retroativo = porta.tipo === 'gestao' && estado.data < estado.hoje;
  const faltaMotivo = retroativo && !motivoAlteracao.trim();
  const bloqueado = porta.tipo === 'link' && estado.data < estado.hoje;

  const recarregar = useCallback(async () => {
    const url = porta.tipo === 'link'
      ? `/api/pizzas/massas?token=${encodeURIComponent(porta.token)}&data=${estado.data}`
      : `/api/pizzas/massas/gestao?unit=${encodeURIComponent(porta.unitId)}&data=${estado.data}`;
    const res = await fetch(url);
    if (res.ok) setEstado(await res.json());
  }, [porta, estado.data]);

  /** Envia uma ação; devolve true se gravou. */
  const enviar = useCallback(async (payload: Record<string, unknown>, foto?: File | null): Promise<boolean> => {
    setErro(null);
    if (retroativo && !motivoAlteracao.trim()) {
      setErro('Escreva o motivo da alteração: este dia já fechou.');
      motivoRef.current?.focus();
      motivoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return false;
    }
    setOcupado(true);
    try {
      const base = porta.tipo === 'link'
        ? { token: porta.token, data: estado.data }
        : { unitId: porta.unitId, data: estado.data, motivo: retroativo ? motivoAlteracao.trim() : null };
      const corpo = { ...base, ...payload };
      const url = porta.tipo === 'link' ? '/api/pizzas/massas' : '/api/pizzas/massas/gestao';
      let res: Response;
      if (foto && porta.tipo === 'link') {
        const fd = new FormData();
        fd.set('payload', JSON.stringify(corpo));
        fd.set('foto', foto);
        res = await fetch(url, { method: 'POST', body: fd });
      } else {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(body.error ?? 'Não foi possível gravar.'); return false; }
      await recarregar();
      return true;
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
      return false;
    } finally {
      setOcupado(false);
    }
  }, [porta, estado.data, retroativo, motivoAlteracao, recarregar]);

  const estoqueAgora = estado.dia.fisico ?? estado.dia.esperado;
  const mostrar = (s: Secao) => !secao || secao === s;

  return (
    <div className="space-y-4">
      {/* O número que a operação olha primeiro. */}
      <div className="rounded-card border border-line bg-surface p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-500">{estado.data === estado.hoje ? 'Estoque agora' : `Estoque em ${emBR(estado.data)}`}</span>
          <span className="sgo-type-24 font-semibold tabular-nums text-brand">{estoqueAgora} <span className="text-sm font-normal text-ink-500">massas</span></span>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          Inicial <b className="tabular-nums text-ink-700">{estado.dia.inicial}</b>
          {' · '}Recebidas <b className="tabular-nums text-ink-700">+{estado.dia.recebidas}</b>
          {' · '}Pizzas <b className="tabular-nums text-ink-700">−{estado.dia.vendidas}</b>
          {' · '}Desperdício <b className="tabular-nums text-ink-700">−{estado.dia.desperdicadas}</b>
        </p>
      </div>

      {bloqueado && (
        <Banner tone="warning" title="Este dia já fechou" description="Só o dia de hoje pode ser alterado por aqui. Correções de dias anteriores são feitas pelo gerente no SGO." />
      )}

      {retroativo && (
        <Textarea
          ref={motivoRef}
          label="Motivo da alteração (obrigatório — dia anterior)"
          required
          rows={2}
          value={motivoAlteracao}
          onChange={(e) => setMotivoAlteracao(e.target.value)}
          hint="Fica registrado com o valor anterior, o novo, quem alterou e a hora."
        />
      )}

      <div ref={erroRef}>{erro && <Banner tone="danger" title={erro} onDismiss={() => setErro(null)} />}</div>

      {mostrar('recebimento') && (
        <Recebimento estado={estado} enviar={enviar} ocupado={ocupado} somenteLeitura={bloqueado} faltaMotivo={faltaMotivo} />
      )}
      {mostrar('desperdicio') && (
        <Desperdicio estado={estado} enviar={enviar} ocupado={ocupado} somenteLeitura={bloqueado} comFoto={porta.tipo === 'link'} faltaMotivo={faltaMotivo} />
      )}
      {mostrar('fechamento') && (
        <Fechamento estado={estado} enviar={enviar} ocupado={ocupado} somenteLeitura={bloqueado} hrefVendas={hrefVendas} faltaMotivo={faltaMotivo} />
      )}
    </div>
  );
}

/* ───────────────────────────── Recebimento ───────────────────────────── */

type Acao = (payload: Record<string, unknown>, foto?: File | null) => Promise<boolean>;

/** Junto do botão de salvar: o motivo é obrigatório e o campo está no topo. */
function AvisoMotivo() {
  return (
    <p className="flex items-center gap-1.5 rounded-control bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      Este dia já fechou: preencha o <b>Motivo da alteração</b> (campo no topo da tela) para poder salvar.
    </p>
  );
}

function Recebimento({ estado, enviar, ocupado, somenteLeitura, faltaMotivo }: { estado: EstadoParaTela; enviar: Acao; ocupado: boolean; somenteLeitura: boolean; faltaMotivo: boolean }) {
  const [resposta, setResposta] = useState<'sim' | 'nao' | null>(estado.lancamentos.recebimentos.length ? 'sim' : null);
  const [editando, setEditando] = useState<string | null>(null);
  const [qtd, setQtd] = useState('');
  const [validade, setValidade] = useState<string | null>(null);
  const [lote, setLote] = useState('');

  const n = Number(qtd || 0);
  const disponivel = estado.dia.inicial + estado.dia.recebidas + (editando ? 0 : n) - estado.dia.vendidas - estado.dia.desperdicadas;

  function abrirNovo() { setEditando(null); setQtd(''); setValidade(null); setLote(''); setResposta('sim'); }
  function abrirEdicao(r: EstadoParaTela['lancamentos']['recebimentos'][number]) {
    setEditando(r.id); setQtd(String(r.quantidade)); setValidade(r.validade); setLote(r.lotCode ?? ''); setResposta('sim');
  }

  async function salvar() {
    const ok = await enviar(editando
      ? { acao: 'corrigirRecebimento', id: editando, quantidade: n, validade, lotCode: lote || null }
      : { acao: 'recebimento', quantidade: n, validade, lotCode: lote || null });
    if (ok) { setEditando(null); setQtd(''); setValidade(null); setLote(''); }
  }

  const mostrarForm = resposta === 'sim' && !somenteLeitura && (editando !== null || estado.lancamentos.recebimentos.length === 0 || qtd !== '' || validade !== null);

  return (
    <section className="rounded-card border border-line bg-surface p-3">
      <p className="mb-2 flex items-center gap-2 sgo-type-11 font-semibold text-ink-900">
        <PackagePlus className="h-4 w-4 text-brand" aria-hidden /> RECEBIMENTO DE MASSAS
      </p>

      {resposta === null && !somenteLeitura && (
        <div>
          <p className="mb-2 text-sm text-ink-700">Recebeu massas {estado.data === estado.hoje ? 'hoje' : `em ${emBR(estado.data)}`}?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={abrirNovo}>SIM</Button>
            <Button size="lg" variant="secondary" onClick={() => setResposta('nao')}>NÃO</Button>
          </div>
        </div>
      )}

      {resposta === 'nao' && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-ink-700">Sem recebimento. Disponível: <b className="tabular-nums text-ink-900">{estado.dia.inicial - estado.dia.vendidas - estado.dia.desperdicadas}</b> massas.</p>
          <Button size="sm" variant="ghost" onClick={abrirNovo}>Recebeu, afinal</Button>
        </div>
      )}

      {estado.lancamentos.recebimentos.length > 0 && (
        <ul className="mb-2 divide-y divide-line">
          {estado.lancamentos.recebimentos.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 text-sm text-ink-700">
                <b className="tabular-nums text-ink-900">+{r.quantidade}</b> massas · validade {emBR(r.validade)}{r.lotCode ? ` · lote ${r.lotCode}` : ''}
              </span>
              {!somenteLeitura && (
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" aria-label="Corrigir recebimento" onClick={() => abrirEdicao(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="danger" aria-label="Excluir recebimento" onClick={() => { if (confirm('Excluir este recebimento?')) void enviar({ acao: 'excluirRecebimento', id: r.id }); }}><Trash2 className="h-4 w-4" /></Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {mostrarForm && (
        <div className="space-y-2 rounded-lg border border-line bg-canvas p-3">
          <Input
            label="Quantidade recebida"
            required
            inputMode="numeric"
            value={qtd}
            onChange={(e) => setQtd(e.target.value.replace(/\D/g, '').slice(0, 5))}
            className="text-base tabular-nums"
          />
          <DatePicker label="Data de validade" required value={validade} onValueChange={setValidade} />
          <Input label="Lote (se houver)" value={lote} onChange={(e) => setLote(e.target.value.slice(0, 60))} />
          <div className="rounded-lg bg-surface p-2 text-sm">
            <span className="text-ink-500">Estoque inicial</span> <b className="tabular-nums text-ink-900">{estado.dia.inicial}</b>
            {' · '}<span className="text-ink-500">Recebimento</span> <b className="tabular-nums text-ink-900">+{editando ? n : estado.dia.recebidas + n}</b>
            {' · '}<span className="text-ink-500">Disponível</span> <b className="tabular-nums text-brand">{editando ? estado.dia.inicial + estado.dia.recebidas - estado.dia.vendidas - estado.dia.desperdicadas : disponivel} massas</b>
          </div>
          {faltaMotivo && <AvisoMotivo />}
          <div className="flex gap-2">
            <Button className="flex-1" loading={ocupado} disabled={n < 1 || !validade} onClick={salvar}>
              {editando ? 'Salvar correção' : 'Registrar recebimento'}
            </Button>
            <Button variant="secondary" onClick={() => { setEditando(null); setQtd(''); setValidade(null); setLote(''); if (!estado.lancamentos.recebimentos.length) setResposta(null); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {resposta === 'sim' && !mostrarForm && !somenteLeitura && (
        <Button size="sm" variant="secondary" onClick={() => setQtd('0')}>Outro recebimento</Button>
      )}

      <Lotes lotes={estado.lotes} />
    </section>
  );
}

function Lotes({ lotes }: { lotes: EstadoParaTela['lotes'] }) {
  if (lotes.lotes.length === 0 && lotes.semLote === 0) return null;
  return (
    <div className="mt-3 border-t border-line pt-2">
      <p className="mb-1 text-xs font-semibold text-ink-500">Lotes na câmara (mais antigo primeiro — use este antes)</p>
      <ul className="space-y-1">
        {lotes.lotes.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 text-ink-700">
              <b className="tabular-nums text-ink-900">{l.disponivel}</b> massas · vence {emBR(l.validade)}{l.lotCode ? ` · ${l.lotCode}` : ''}
            </span>
            <StatusBadge tone={TOM_FAIXA[l.faixa]} dot={l.faixa !== 'OK'}>{rotuloDaFaixa(l.faixa, l.diasRestantes)}</StatusBadge>
          </li>
        ))}
        {lotes.semLote > 0 && (
          <li className="text-xs text-ink-500"><b className="tabular-nums">{lotes.semLote}</b> sem lote identificado (contadas na câmara além do que os recebimentos explicam)</li>
        )}
      </ul>
    </div>
  );
}

/* ───────────────────────────── Desperdício ───────────────────────────── */

function Desperdicio({ estado, enviar, ocupado, somenteLeitura, comFoto, faltaMotivo }: { estado: EstadoParaTela; enviar: Acao; ocupado: boolean; somenteLeitura: boolean; comFoto: boolean; faltaMotivo: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [qtd, setQtd] = useState('');
  const [motivo, setMotivo] = useState<MotivoDesperdicio | null>(null);
  const [loteId, setLoteId] = useState('');
  const [obs, setObs] = useState('');
  const [foto, setFoto] = useState<File | null>(null);

  const opcoesDeLote = useMemo(() => estado.lotes.lotes.map((l) => ({
    value: l.id, label: `Vence ${emBR(l.validade)} — ${l.disponivel} massas${l.lotCode ? ` (${l.lotCode})` : ''}`,
  })), [estado.lotes.lotes]);

  function limpar() { setAberto(false); setEditando(null); setQtd(''); setMotivo(null); setLoteId(''); setObs(''); setFoto(null); }
  function abrirEdicao(w: EstadoParaTela['lancamentos']['desperdicios'][number]) {
    setEditando(w.id); setQtd(String(w.quantidade)); setMotivo(w.motivo); setLoteId(w.loteId ?? ''); setObs(w.observacao ?? ''); setAberto(true);
  }

  const n = Number(qtd || 0);
  async function salvar() {
    const payload = { quantidade: n, motivoDesperdicio: motivo, observacao: obs || null, loteId: motivo === 'EXPIRED' && loteId ? loteId : null };
    const ok = await enviar(editando ? { acao: 'corrigirDesperdicio', id: editando, ...payload } : { acao: 'desperdicio', ...payload }, editando ? null : foto);
    if (ok) limpar();
  }

  return (
    <section className="rounded-card border border-line bg-surface p-3">
      <p className="mb-2 flex items-center gap-2 sgo-type-11 font-semibold text-ink-900">
        <AlertTriangle className="h-4 w-4 text-brand" aria-hidden /> DESPERDÍCIOS
      </p>

      {estado.lancamentos.desperdicios.length > 0 && (
        <ul className="mb-2 divide-y divide-line">
          {estado.lancamentos.desperdicios.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 text-sm text-ink-700">
                <b className="tabular-nums text-ink-900">−{w.quantidade}</b> · {rotuloDoMotivo(w.motivo)}
                {w.observacao ? <span className="block text-xs text-ink-500">{w.observacao}</span> : null}
                {w.temFoto && <span className="ml-1 text-xs text-ink-500">(com foto)</span>}
              </span>
              {!somenteLeitura && (
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" aria-label="Corrigir desperdício" onClick={() => abrirEdicao(w)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="danger" aria-label="Excluir desperdício" onClick={() => { if (confirm('Excluir este desperdício?')) void enviar({ acao: 'excluirDesperdicio', id: w.id }); }}><Trash2 className="h-4 w-4" /></Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!aberto && !somenteLeitura && (
        <Button size="lg" className="w-full" onClick={() => setAberto(true)}>REGISTRAR DESPERDÍCIO</Button>
      )}

      {aberto && (
        <div className="space-y-2 rounded-lg border border-line bg-canvas p-3">
          <Input label="Quantidade de massas" required inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, '').slice(0, 5))} className="text-base tabular-nums" />
          <div>
            <p className="mb-1 text-sm font-medium text-ink-900">Motivo <span className="text-danger">*</span></p>
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS_DESPERDICIO.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  aria-pressed={motivo === m.valor}
                  onClick={() => setMotivo(m.valor)}
                  className={`sgo-control rounded-control border px-3 py-2 text-left text-sm font-semibold ${motivo === m.valor ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface text-ink-700'}`}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
          </div>
          {motivo === 'EXPIRED' && opcoesDeLote.length > 0 && (
            <Select label="Qual lote venceu?" options={opcoesDeLote} value={loteId} onValueChange={setLoteId} placeholder="Escolha o lote" hint="O descarte sai desse lote no controle de validade." />
          )}
          <Input label="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value.slice(0, 500))} />
          {comFoto && !editando && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
              <Camera className="h-4 w-4 text-brand" aria-hidden />
              <span>{foto ? foto.name : 'Foto (opcional)'}</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </label>
          )}
          {faltaMotivo && <AvisoMotivo />}
          <div className="flex gap-2">
            <Button className="flex-1" loading={ocupado} disabled={n < 1 || !motivo} onClick={salvar}>{editando ? 'Salvar correção' : 'Registrar'}</Button>
            <Button variant="secondary" onClick={limpar}>Cancelar</Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────── Fechamento ───────────────────────────── */

function Fechamento({ estado, enviar, ocupado, somenteLeitura, hrefVendas, faltaMotivo }: { estado: EstadoParaTela; enviar: Acao; ocupado: boolean; somenteLeitura: boolean; hrefVendas?: string; faltaMotivo: boolean }) {
  const contagem = estado.lancamentos.contagem;
  const [recontando, setRecontando] = useState(false);
  const [fisico, setFisico] = useState(contagem ? String(contagem.fisico) : '');
  const [justificativa, setJustificativa] = useState(contagem?.justificativa ?? '');
  const [feito, setFeito] = useState<{ divergencia: number } | null>(null);

  const n = fisico === '' ? null : Number(fisico);
  const divergencia = n === null ? null : n - estado.dia.esperado;
  const editando = !contagem || recontando;

  async function fechar() {
    if (n === null) return;
    const ok = await enviar({ acao: 'contagem', fisico: n, justificativa: justificativa || null });
    if (ok) { setFeito({ divergencia: divergencia ?? 0 }); setRecontando(false); }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-3">
      <p className="mb-2 flex items-center gap-2 sgo-type-11 font-semibold text-ink-900">
        <Lock className="h-4 w-4 text-brand" aria-hidden /> FECHAMENTO DO ESTOQUE
      </p>

      {!estado.vendasFechadas && (
        <Banner
          tone="warning"
          title="O fechamento de pizzas deste dia ainda não foi enviado"
          description="O esperado abaixo ainda não desconta as pizzas vendidas. Envie o fechamento de pizzas primeiro, depois conte as massas."
          action={hrefVendas ? <a href={hrefVendas} className="text-sm font-semibold text-brand underline-offset-4 hover:underline">Ir para o fechamento de pizzas</a> : undefined}
          className="mb-2"
        />
      )}

      <dl className="mb-3 space-y-1 text-sm">
        <Linha rotulo="Estoque inicial" valor={estado.dia.inicial} />
        <Linha rotulo="+ Recebimentos" valor={estado.dia.recebidas} sinal="+" />
        <Linha rotulo="− Massas nas pizzas" valor={estado.dia.vendidas} sinal="−" />
        <Linha rotulo="− Desperdícios" valor={estado.dia.desperdicadas} sinal="−" />
        <div className="flex items-baseline justify-between border-t border-line pt-1">
          <dt className="font-semibold text-ink-900">= Estoque esperado</dt>
          <dd className="sgo-type-17 font-semibold tabular-nums text-brand">{estado.dia.esperado}</dd>
        </div>
      </dl>

      {contagem && !recontando && (
        <div className="space-y-2">
          <Situacao situacao={estado.dia.situacao} fisico={contagem.fisico} esperado={estado.dia.esperado} divergencia={estado.dia.divergencia ?? 0} alteradoDepois={estado.dia.alteradoDepois} />
          {contagem.justificativa && <p className="text-xs text-ink-500">Justificativa: {contagem.justificativa}</p>}
          {feito && <p className="text-xs text-success">Fechamento gravado.</p>}
          {!somenteLeitura && <Button size="sm" variant="secondary" onClick={() => setRecontando(true)}>Recontar / corrigir</Button>}
        </div>
      )}

      {editando && !somenteLeitura && (
        <div className="space-y-2">
          <Input
            label="Quantas massas existem fisicamente na câmara fria agora?"
            required
            inputMode="numeric"
            value={fisico}
            onChange={(e) => setFisico(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="text-base tabular-nums"
          />
          {n !== null && divergencia === 0 && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" aria-hidden /> Estoque conferido</p>
          )}
          {n !== null && divergencia !== 0 && divergencia !== null && (
            <>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Divergência de estoque: {divergencia > 0 ? '+' : ''}{divergencia} massa(s)
              </p>
              <Textarea label="O que houve? (obrigatório)" required rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value.slice(0, 500))} />
            </>
          )}
          {faltaMotivo && <AvisoMotivo />}
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" loading={ocupado} disabled={n === null || (divergencia !== 0 && !justificativa.trim())} onClick={fechar}>
              {contagem ? 'Salvar correção' : 'Fechar estoque do dia'}
            </Button>
            {contagem && <Button variant="secondary" onClick={() => { setRecontando(false); setFisico(String(contagem.fisico)); setJustificativa(contagem.justificativa ?? ''); }}>Cancelar</Button>}
          </div>
          <p className="text-xs text-ink-500">A contagem confirmada vira o estoque inicial do próximo dia.</p>
        </div>
      )}

      {!contagem && somenteLeitura && <p className="text-sm text-ink-500">Este dia ficou sem fechamento de estoque.</p>}
    </section>
  );
}

function Linha({ rotulo, valor, sinal }: { rotulo: string; valor: number; sinal?: '+' | '−' }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-500">{rotulo}</dt>
      <dd className="tabular-nums text-ink-900">{sinal ?? ''}{valor}</dd>
    </div>
  );
}

export function Situacao({ situacao, fisico, esperado, divergencia, alteradoDepois }: { situacao: SituacaoDoDia; fisico: number; esperado: number; divergencia: number; alteradoDepois: boolean }) {
  const tone = situacao === 'CONFERIDO' ? 'success' : situacao === 'RETROATIVO' ? 'warning' : situacao === 'DIVERGENTE' ? 'danger' : 'neutral';
  return (
    <div>
      <StatusBadge tone={tone} dot>{situacao === 'CONFERIDO' ? '✓ ' : '⚠ '}{ROTULO_SITUACAO[situacao]}</StatusBadge>
      <p className="mt-1 text-sm text-ink-700">
        Contado <b className="tabular-nums text-ink-900">{fisico}</b> · esperado <b className="tabular-nums text-ink-900">{esperado}</b>
        {divergencia !== 0 && <> · diferença <b className="tabular-nums text-ink-900">{divergencia > 0 ? '+' : ''}{divergencia}</b></>}
      </p>
      {alteradoDepois && situacao !== 'RETROATIVO' && (
        <p className="text-xs text-ink-500">Houve alteração na série depois deste fechamento; o esperado foi recalculado.</p>
      )}
    </div>
  );
}
