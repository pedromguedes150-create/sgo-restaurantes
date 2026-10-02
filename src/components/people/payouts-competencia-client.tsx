'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, ChevronDown, ChevronRight, Clock, Download, Lock, LockOpen, Pencil, Plus, Trash2, Truck, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/ds/select';
import { StatCard } from '@/components/ui/ds/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { formatBRL } from '@/lib/utils';
import { formatarCpf } from '@/lib/people/payouts-export';
import { rotuloDaCompetencia } from '@/lib/people/pagamento-extra-calculo';
import { textoHoras } from '@/lib/overtime/calculo';

/**
 * PAGAMENTO EXTRA E MOBILIDADE — mesma tela, duas abas INDEPENDENTES.
 *
 * A independência não é só visual: cada aba tem a sua entrega, o seu
 * fechamento e o seu arquivo. Não existe botão de "exportar tudo" nesta tela —
 * misturar as duas num Excel foi o que o pedido proibiu, e a forma de garantir
 * é não oferecer o caminho.
 *
 * As duas abas têm origens diferentes. MOBILIDADE é lançada aqui, à mão. O
 * PAGAMENTO EXTRA não tem "Lançar": ele É a hora extra aprovada em Pagamentos,
 * lida na hora (competência = mês seguinte ao dia trabalhado). Corrigir uma HE
 * se faz onde ela nasce; aqui se confere, se registra a entrega, se finaliza —
 * e finalizar marca as HE como pagas.
 *
 * O agrupamento por UNIDADE é o desenho do SGO dos postos: a linha da unidade
 * responde "quanto e quantos", e só quem precisa do detalhe expande.
 */

export type Tipo = 'EXTRA' | 'MOBILITY';

export interface HoraExtraUI {
  id: string;
  dia: string;
  inicio: string | null;
  fim: string | null;
  horas: number | null;
  valorHora: number | null;
  vt: number;
  valor: number;
  status: 'APPROVED' | 'PAID';
  aprovadoPor: string | null;
}
export interface LinhaUI {
  id: string;
  collaboratorId: string;
  colaborador: string;
  cpf: string | null;
  valor: number;
  observacao: string | null;
  lancadoPor: string;
  /** Só no Pagamento Extra. */
  horas?: number;
  status?: 'PAID' | 'APPROVED' | 'MISTO';
  horasExtras?: HoraExtraUI[];
}
export interface GrupoUI {
  unitId: string;
  unidade: string;
  lancamentos: LinhaUI[];
  total: number;
  entregaEm: string | null;
}
export interface QuadroUI {
  competencia: string;
  grupos: GrupoUI[];
  totalGeral: number;
  totalLancamentos: number;
  fechada: boolean;
  fechadaPor: string | null;
  unidadesSemLancamento: { id: string; name: string }[];
  extra?: {
    mesTrabalhado: string;
    rotuloMesTrabalhado: string;
    colaboradores: number;
    pendentes: { qtd: number; valor: number };
    aposFechamento: { qtd: number; valor: number; linhas: (HoraExtraUI & { colaborador: string })[] };
  };
}
export interface ColaboradorUI {
  id: string; nome: string; cpf: string | null; unitId: string; unidade: string;
}

const ROTULO: Record<Tipo, string> = { EXTRA: 'Hora extra', MOBILITY: 'Mobilidade' };
/** O que se conta em cada aba: HE não é "lançamento". */
const UNIDADE_DE_CONTAGEM: Record<Tipo, string> = { EXTRA: 'hora(s) extra(s)', MOBILITY: 'lançamento(s)' };

async function acao(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
  const r = await fetch('/api/people/payouts', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: false, error: 'Falha de comunicação.' }));
}

/**
 * Desde a v1.142.0 cada modalidade tem a SUA tela (decisão do Pedro: "uma aba
 * para cada finalidade"): a Hora extra em /modulos/hora-extra (aba Fechamento)
 * e a Mobilidade em /modulos/mobilidade. Este componente é o quadro de UMA
 * competência de UM tipo; `basePath` diz para onde a troca de mês navega.
 */
export function PayoutsCompetenciaClient({
  tipo, quadro, competencia, meses, colaboradores, podeLancar, podeFecharExtra, isAdmin, basePath,
}: {
  tipo: Tipo;
  quadro: QuadroUI;
  competencia: string;
  meses: string[];
  colaboradores: ColaboradorUI[];
  podeLancar: boolean;
  /** Finalizar a Hora extra marca HE como pagas: Admin/CEO/Financeiro. */
  podeFecharExtra: boolean;
  isAdmin: boolean;
  /** Endereço da tela (com os demais parâmetros já na query, se houver). */
  basePath: string;
}) {
  const router = useRouter();
  const trocarMes = (m: string) => router.push(`${basePath}${basePath.includes('?') ? '&' : '?'}mes=${m}`);

  return (
    <Aba
      tipo={tipo}
      quadro={quadro}
      competencia={competencia}
      meses={meses}
      colaboradores={colaboradores}
      podeLancar={podeLancar}
      podeFecharExtra={podeFecharExtra}
      isAdmin={isAdmin}
      onTrocarMes={trocarMes}
      onMudou={() => router.refresh()}
    />
  );
}

function Aba({ tipo, quadro, competencia, meses, colaboradores, podeLancar, podeFecharExtra, isAdmin, onTrocarMes, onMudou }: {
  tipo: Tipo; quadro: QuadroUI; competencia: string; meses: string[];
  colaboradores: ColaboradorUI[]; podeLancar: boolean; podeFecharExtra: boolean; isAdmin: boolean;
  onTrocarMes: (m: string) => void; onMudou: () => void;
}) {
  const [lancando, setLancando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  const ehExtra = tipo === 'EXTRA';
  /* Mobilidade: quem lança edita e exclui. Pagamento Extra: ninguém edita aqui
     (a HE se corrige em Pagamentos); só a entrega por unidade é gravada. */
  const editavel = podeLancar && !quadro.fechada && !ehExtra;
  const entregaEditavel = podeLancar && !quadro.fechada;
  const podeFinalizar = !quadro.fechada && (ehExtra ? podeFecharExtra : podeLancar);

  async function executar(body: Record<string, unknown>, sucesso?: string) {
    setBusy(true); setErro(''); setMsg('');
    const r = await acao({ tipo, competencia, ...body });
    setBusy(false);
    if (!r.ok) { setErro(String(r.error ?? 'Falha.')); return false; }
    if (sucesso) setMsg(sucesso);
    onMudou();
    return true;
  }

  function finalizar() {
    if (ehExtra) {
      const n = quadro.totalLancamentos;
      if (!confirm(`Finalizar a competência ${rotuloDaCompetencia(competencia)} do Pagamento Extra?\n\nAs ${n} hora(s) extra(s) aprovada(s) serão marcadas como PAGAS em Pagamentos (pago por você, agora). Só o Administrador reabre.`)) return;
      void executar({ action: 'fechar' }, `Competência finalizada: ${n} hora(s) extra(s) marcada(s) como paga(s).`);
      return;
    }
    void executar({ action: 'fechar' }, 'Competência finalizada.');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="w-48">
          <Select
            label="Competência" size="sm" value={competencia} onValueChange={onTrocarMes}
            options={meses.map((m) => ({ value: m, label: rotuloDaCompetencia(m) }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Um botão por aba, com o tipo no próprio rótulo: não existe
              "exportar tudo", e o nome do arquivo já diz qual é. */}
          <a
            href={`/api/people/payouts/export?tipo=${tipo}&mes=${competencia}`}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand"
          >
            <Download className="h-4 w-4" /> {ehExtra ? 'Arquivo da administradora (XLSX)' : `Exportar ${ROTULO[tipo]} XLSX`}
          </a>
          {podeFinalizar && (
            <Button size="sm" variant="outline" disabled={busy} onClick={finalizar}>
              <Lock className="h-4 w-4" /> {ehExtra ? 'Finalizar competência e marcar pagas' : 'Finalizar competência'}
            </Button>
          )}
          {quadro.fechada && isAdmin && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void executar({ action: 'reabrir' }, 'Competência reaberta.')}>
              <LockOpen className="h-4 w-4" /> Reabrir
            </Button>
          )}
        </div>
      </div>

      {ehExtra && quadro.extra && (
        /* A regra da competência escrita na tela — é a pergunta que todo mundo
           faz na frente do quadro: "isto é de que mês?". */
        <p className="rounded-lg bg-brand-tint px-3 py-2 sgo-type-13 text-ink-900">
          <Clock className="mr-1 inline h-4 w-4 text-brand" />
          Horas extras <b>aprovadas em Pagamentos</b> com dia trabalhado em <b>{quadro.extra.rotuloMesTrabalhado}</b> — a competência paga o mês anterior ao trabalho.
          {' '}Correções são feitas na própria hora extra, em Pagamentos; aqui se confere, registra a entrega e finaliza.
        </p>
      )}

      {ehExtra && !podeFecharExtra && !quadro.fechada && (
        <p className="sgo-type-11 text-ink-500">Finalizar esta competência é do Admin, CEO ou Financeiro — o fechamento marca as horas extras como pagas.</p>
      )}

      {quadro.fechada && (
        <div className="rounded-lg border border-line bg-sunken p-3">
          <p className="sgo-type-15 font-semibold text-ink-900">
            <Lock className="mr-1 inline h-4 w-4" /> Competência finalizada{quadro.fechadaPor ? ` por ${quadro.fechadaPor}` : ''}.
          </p>
          <p className="sgo-type-13 text-ink-700">
            {ehExtra
              ? `As horas extras desta competência foram marcadas como pagas em Pagamentos; a data de entrega não pode mais ser alterada. ${isAdmin ? 'Use "Reabrir" para incluir uma hora extra aprovada depois e finalizar de novo — o que já está pago continua pago.' : 'Peça ao Administrador para reabrir.'}`
              : `Lançamentos desta modalidade não podem ser editados nem excluídos. ${isAdmin ? 'Use "Reabrir" para alterar.' : 'Peça ao Administrador para reabrir.'}`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label={`Total de ${ROTULO[tipo].toLowerCase()}`} value={formatBRL(quadro.totalGeral)} className="col-span-2 sm:col-span-1" />
        <StatCard label={ehExtra ? 'Horas extras' : 'Lançamentos'} value={String(quadro.totalLancamentos)} />
        {ehExtra && quadro.extra
          ? <StatCard label="Colaboradores" value={String(quadro.extra.colaboradores)} />
          : <StatCard label="Unidades com lançamento" value={String(quadro.grupos.length)} />}
        <StatCard label={ehExtra ? 'Unidades sem hora extra' : 'Unidades sem lançamento'} value={String(quadro.unidadesSemLancamento.length)} />
      </div>

      {ehExtra && quadro.extra && quadro.extra.pendentes.qtd > 0 && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 sgo-type-13 text-ink-900">
          <AlertTriangle className="mr-1 inline h-4 w-4 text-warning" />
          <b>{quadro.extra.pendentes.qtd} hora(s) extra(s) ainda aguardando aprovação</b> ({formatBRL(quadro.extra.pendentes.valor)}) — só entram aqui depois de aprovadas.
          {' '}<Link href="/modulos/pagamentos" className="font-semibold text-brand underline">Abrir Pagamentos</Link>
        </p>
      )}

      {ehExtra && quadro.extra && quadro.extra.aposFechamento.qtd > 0 && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 sgo-type-13 text-ink-900">
          <p>
            <AlertTriangle className="mr-1 inline h-4 w-4 text-danger" />
            <b>{quadro.extra.aposFechamento.qtd} hora(s) extra(s) aprovada(s) DEPOIS do fechamento</b> ({formatBRL(quadro.extra.aposFechamento.valor)}) — fora do total e do arquivo.
            {' '}{isAdmin ? 'Reabra e finalize de novo para incluí-las (o que já está pago continua pago).' : 'Peça ao Administrador para reabrir e finalizar de novo.'}
          </p>
          <ul className="mt-1 list-inside list-disc">
            {quadro.extra.aposFechamento.linhas.map((h) => (
              <li key={h.id}>{h.colaborador} · {dataBr(h.dia)} · {formatBRL(h.valor)}</li>
            ))}
          </ul>
        </div>
      )}

      {quadro.unidadesSemLancamento.length > 0 && (
        /* Sem esta linha, uma unidade esquecida só aparece quando a
           administradora reclama. */
        <p className="rounded-lg bg-warning/10 px-3 py-2 sgo-type-13 text-ink-900">
          <b>Ainda sem {ehExtra ? 'hora extra' : ROTULO[tipo].toLowerCase()} nesta competência:</b>{' '}
          {quadro.unidadesSemLancamento.map((u) => u.name).join(' · ')}
        </p>
      )}

      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}
      {msg && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success">{msg}</p>}

      {editavel && (
        <Button size="sm" onClick={() => setLancando((v) => !v)}>
          {lancando ? <><X className="h-4 w-4" /> Fechar lançamento</> : <><Plus className="h-4 w-4" /> Lançar {ROTULO[tipo].toLowerCase()}</>}
        </Button>
      )}

      {lancando && editavel && (
        <LancarEmLote
          tipo={tipo} colaboradores={colaboradores} busy={busy}
          onGravar={async (itens) => {
            const ok = await executar({ action: 'lote', itens }, `${itens.length} lançamento(s) gravado(s).`);
            if (ok) setLancando(false);
          }}
        />
      )}

      {quadro.grupos.length === 0 && (
        <p className="text-sm text-ink-500">
          {ehExtra ? 'Nenhuma hora extra aprovada nesta competência.' : `Nenhum lançamento de ${ROTULO[tipo].toLowerCase()} nesta competência.`}
        </p>
      )}
      {quadro.grupos.map((g) => (
        <Unidade key={g.unitId} grupo={g} tipo={tipo} editavel={editavel} entregaEditavel={entregaEditavel} busy={busy} onExecutar={executar} />
      ))}
    </div>
  );
}

/* ───────────────────────── UNIDADE (expansível) ───────────────────────── */

function Unidade({ grupo, tipo, editavel, entregaEditavel, busy, onExecutar }: {
  grupo: GrupoUI; tipo: Tipo; editavel: boolean; entregaEditavel: boolean; busy: boolean;
  onExecutar: (body: Record<string, unknown>, sucesso?: string) => Promise<boolean>;
}) {
  const [aberta, setAberta] = useState(false);
  const [editandoEntrega, setEditandoEntrega] = useState(false);
  const [entrega, setEntrega] = useState(grupo.entregaEm ?? '');
  const ehExtra = tipo === 'EXTRA';
  const contagem = ehExtra ? grupo.lancamentos.reduce((s, l) => s + (l.horasExtras?.length ?? 0), 0) : grupo.lancamentos.length;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-sgo-card">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-brand-tint"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {aberta ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />}
          <span className="truncate sgo-type-15 font-semibold text-ink-900">{grupo.unidade}</span>
          <StatusBadge tone="neutral">{contagem} {UNIDADE_DE_CONTAGEM[tipo]}</StatusBadge>
          {ehExtra && <StatusBadge tone="neutral">{grupo.lancamentos.length} colaborador(es)</StatusBadge>}
          {grupo.entregaEm
            ? <StatusBadge tone="success">Entregue: {dataBr(grupo.entregaEm)}</StatusBadge>
            : <StatusBadge tone="medium">Sem data de entrega</StatusBadge>}
        </div>
        <div className="shrink-0 text-right">
          <p className="sgo-type-11 text-ink-500">Total</p>
          <p className="sgo-type-15 font-bold text-brand">{formatBRL(grupo.total)}</p>
        </div>
      </button>

      {aberta && (
        <div className="border-t border-line">
          {entregaEditavel && (
            <div className="flex flex-wrap items-end gap-2 border-b border-line bg-sunken p-3">
              {editandoEntrega ? (
                <>
                  <div className="w-44">
                    {/* UMA data por unidade: a entrega é do lote inteiro, e
                        pedi-la em cada linha multiplicaria por cinquenta uma
                        informação que é uma só. */}
                    <DatePicker label="Data de entrega" size="sm" value={entrega || null} onValueChange={(v) => setEntrega(v ?? '')} />
                  </div>
                  <Button size="sm" disabled={busy} onClick={async () => {
                    if (await onExecutar({ action: 'entrega', unitId: grupo.unitId, entregaEm: entrega || null }, 'Entrega registrada.')) setEditandoEntrega(false);
                  }}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEntrega(grupo.entregaEm ?? ''); setEditandoEntrega(false); }}>Cancelar</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditandoEntrega(true)}>
                  <Truck className="h-4 w-4" /> {grupo.entregaEm ? 'Alterar data de entrega' : 'Registrar data de entrega'}
                </Button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className="border-b border-line sgo-type-11 uppercase text-ink-500">
                  <th className="p-2 font-semibold">Colaborador</th>
                  <th className="p-2 font-semibold">CPF</th>
                  {ehExtra && <th className="p-2 text-right font-semibold">Horas</th>}
                  <th className="p-2 text-right font-semibold">Valor (R$)</th>
                  {ehExtra ? <th className="p-2 font-semibold">Situação</th> : <th className="p-2 font-semibold">Observação</th>}
                  {editavel && <th className="p-2 font-semibold">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {grupo.lancamentos.map((l) => (
                  ehExtra
                    ? <LinhaDeHoraExtra key={l.id} l={l} />
                    : <Lancamento key={l.id} l={l} tipo={tipo} editavel={editavel} busy={busy} onExecutar={onExecutar} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────── PAGAMENTO EXTRA: colaborador → cada HE ───────────────── */

const SITUACAO: Record<NonNullable<LinhaUI['status']>, { rotulo: string; tone: 'success' | 'medium' | 'neutral' }> = {
  PAID: { rotulo: 'Paga', tone: 'success' },
  APPROVED: { rotulo: 'Aprovada — a pagar', tone: 'medium' },
  MISTO: { rotulo: 'Parte paga', tone: 'neutral' },
};

/**
 * A linha soma o mês do colaborador; o detalhe abre cada hora extra (dia,
 * horário, horas × valor/hora, VT, quem aprovou). Nada é editável aqui — a
 * correção é feita na HE, em Pagamentos, e reflete sozinha.
 */
function LinhaDeHoraExtra({ l }: { l: LinhaUI }) {
  const [aberta, setAberta] = useState(false);
  const hes = l.horasExtras ?? [];
  const sit = SITUACAO[l.status ?? 'APPROVED'];
  return (
    <>
      <tr className="border-b border-line last:border-b-0">
        <td className="p-2 sgo-type-15 font-medium text-ink-900">
          <button type="button" className="inline-flex items-center gap-1 text-left hover:text-brand" onClick={() => setAberta((v) => !v)} aria-expanded={aberta}>
            {aberta ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />}
            {l.colaborador}
            <span className="sgo-type-11 font-normal text-ink-500">· {hes.length} HE</span>
          </button>
        </td>
        <td className="p-2 sgo-type-13 tabular-nums text-ink-700">{formatarCpf(l.cpf) || <span className="text-warning">sem CPF</span>}</td>
        <td className="p-2 text-right sgo-type-15 tabular-nums text-ink-900">{l.horas != null ? textoHoras(l.horas) : '—'}</td>
        <td className="p-2 text-right sgo-type-15 tabular-nums text-ink-900">{formatBRL(l.valor)}</td>
        <td className="p-2"><StatusBadge tone={sit.tone}>{sit.rotulo}</StatusBadge></td>
      </tr>
      {aberta && hes.map((h) => (
        <tr key={h.id} className="border-b border-line bg-sunken last:border-b-0">
          <td className="p-2 pl-8 sgo-type-13 text-ink-700" colSpan={2}>
            {dataBr(h.dia)}{h.inicio && h.fim ? ` · ${h.inicio}–${h.fim}` : ''}
            {h.aprovadoPor ? <span className="text-ink-500"> · aprovada por {h.aprovadoPor}</span> : null}
          </td>
          <td className="p-2 text-right sgo-type-13 tabular-nums text-ink-700">
            {h.horas != null ? textoHoras(h.horas) : '—'}{h.valorHora != null ? ` × ${formatBRL(h.valorHora)}/h` : ''}
          </td>
          <td className="p-2 text-right sgo-type-13 tabular-nums text-ink-700">
            {formatBRL(h.valor)}{h.vt > 0 ? <span className="text-ink-500"> (VT {formatBRL(h.vt)})</span> : null}
          </td>
          <td className="p-2"><StatusBadge tone={h.status === 'PAID' ? 'success' : 'medium'}>{h.status === 'PAID' ? 'Paga' : 'Aprovada'}</StatusBadge></td>
        </tr>
      ))}
    </>
  );
}

/* ───────────────────────── MOBILIDADE: linha editável ───────────────────────── */

function Lancamento({ l, editavel, busy, onExecutar }: {
  l: LinhaUI; tipo: Tipo; editavel: boolean; busy: boolean;
  onExecutar: (body: Record<string, unknown>, sucesso?: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(l.valor).replace('.', ','));
  const [obs, setObs] = useState(l.observacao ?? '');

  if (editando) {
    return (
      <tr className="border-b border-line last:border-b-0 bg-brand-tint">
        <td className="p-2 sgo-type-15 font-medium text-ink-900">{l.colaborador}</td>
        <td className="p-2 sgo-type-13 tabular-nums text-ink-700">{formatarCpf(l.cpf)}</td>
        <td className="p-2"><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="h-8 w-24 text-right text-sm" /></td>
        <td className="p-2"><Input value={obs} onChange={(e) => setObs(e.target.value)} className="h-8 text-sm" /></td>
        <td className="p-2">
          <div className="flex gap-1">
            <Button size="sm" disabled={busy} onClick={async () => {
              if (await onExecutar({ action: 'editar', id: l.id, amount: Number(valor.replace(',', '.')), note: obs }, 'Lançamento alterado.')) setEditando(false);
            }}>Salvar</Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="p-2 sgo-type-15 font-medium text-ink-900">{l.colaborador}</td>
      <td className="p-2 sgo-type-13 tabular-nums text-ink-700">{formatarCpf(l.cpf) || '—'}</td>
      <td className="p-2 text-right sgo-type-15 tabular-nums text-ink-900">{formatBRL(l.valor)}</td>
      <td className="p-2 sgo-type-13 text-ink-500">{l.observacao || '—'}</td>
      {editavel && (
        <td className="p-2">
          <div className="flex gap-1">
            <button type="button" aria-label={`Editar ${l.colaborador}`} className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-tint hover:text-brand" onClick={() => setEditando(true)}>
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button" aria-label={`Excluir ${l.colaborador}`} disabled={busy}
              className="rounded-lg p-1.5 text-danger hover:bg-danger/10"
              onClick={() => {
                if (!confirm(`Excluir o lançamento de ${l.colaborador}? A ação fica registrada na Auditoria.`)) return;
                void onExecutar({ action: 'excluir', id: l.id }, 'Lançamento excluído.');
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

/* ───────────────────────── LANÇAMENTO EM LOTE ───────────────────────── */

/**
 * O caso real é "a mesma unidade, o mesmo valor para quase todos".
 *
 * Por isso: filtra a unidade, marca vários, aplica um valor em todos — e ainda
 * dá para ajustar linha a linha antes de gravar, que é o que resolve os poucos
 * que fogem da regra sem obrigar a lançar um por um.
 */
function LancarEmLote({ tipo, colaboradores, busy, onGravar }: {
  tipo: Tipo;
  colaboradores: ColaboradorUI[];
  busy: boolean;
  onGravar: (itens: { collaboratorId: string; amount: number }[]) => void;
}) {
  const [q, setQ] = useState('');
  const [unidade, setUnidade] = useState('');
  const [valorPadrao, setValorPadrao] = useState('');
  const [valores, setValores] = useState<Record<string, string>>({});

  const unidades = useMemo(
    () => [...new Map(colaboradores.map((c) => [c.unitId, c.unidade])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')),
    [colaboradores],
  );

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digitos = t.replace(/\D/g, '');
    return colaboradores.filter((c) => {
      if (unidade && c.unitId !== unidade) return false;
      if (!t) return true;
      /* Busca por nome OU por CPF — quem confere lista de benefício costuma ter
         o CPF na mão, não o nome exato. */
      return c.nome.toLowerCase().includes(t) || (digitos.length >= 3 && (c.cpf ?? '').includes(digitos));
    });
  }, [colaboradores, q, unidade]);

  const marcados = visiveis.filter((c) => valores[c.id]?.trim());
  const total = marcados.reduce((s, c) => s + (Number(valores[c.id].replace(',', '.')) || 0), 0);

  function aplicarEmTodos() {
    const v = valorPadrao.trim();
    if (!v) return;
    setValores((atual) => {
      const novo = { ...atual };
      for (const c of visiveis) novo[c.id] = v;
      return novo;
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-brand/30 bg-brand-tint p-3">
      <p className="sgo-type-15 font-semibold text-ink-900">Lançar {ROTULO[tipo].toLowerCase()} — colaboradores do cadastro</p>
      <p className="sgo-type-11 text-ink-500">
        A lista vem do cadastro de colaboradores do SGO. Nome, CPF e unidade são os do cadastro; não se cria colaborador aqui.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar por nome ou CPF" />
        </div>
        <div className="w-52">
          <Select
            label="Unidade" size="sm" value={unidade} onValueChange={setUnidade}
            options={[{ value: '', label: 'Todas as unidades' }, ...unidades.map(([id, nome]) => ({ value: id, label: nome }))]}
          />
        </div>
        <div className="w-32">
          <Input inputMode="decimal" value={valorPadrao} onChange={(e) => setValorPadrao(e.target.value)} placeholder="Valor" />
        </div>
        <Button size="sm" variant="outline" disabled={!valorPadrao.trim() || visiveis.length === 0} onClick={aplicarEmTodos}>
          Aplicar aos {visiveis.length} da lista
        </Button>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-lg border border-line bg-surface">
        {visiveis.length === 0 && <p className="p-3 text-sm text-ink-500">Nenhum colaborador encontrado.</p>}
        {visiveis.map((c) => (
          <div key={c.id} className="flex items-center gap-2 border-b border-line p-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate sgo-type-15 font-medium text-ink-900">{c.nome}</p>
              <p className="sgo-type-11 tabular-nums text-ink-500">{formatarCpf(c.cpf) || 'sem CPF'} · {c.unidade}</p>
            </div>
            <Input
              inputMode="decimal" className="h-8 w-24 text-right text-sm"
              value={valores[c.id] ?? ''} placeholder="—"
              onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="sgo-type-13 text-ink-700">
          <b>{marcados.length}</b> com valor · total <b className="text-brand">{formatBRL(total)}</b>
          {/* Quem fica com o campo vazio simplesmente não é lançado — é assim
              que se pula alguém sem ter de desmarcar nada. */}
        </p>
        <Button
          size="sm" disabled={busy || marcados.length === 0}
          onClick={() => onGravar(marcados.map((c) => ({ collaboratorId: c.id, amount: Number(valores[c.id].replace(',', '.')) })))}
        >
          <Plus className="h-4 w-4" /> Gravar {marcados.length} lançamento(s)
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── auxiliares de formato ───────────────────────── */

function dataBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : iso;
}
