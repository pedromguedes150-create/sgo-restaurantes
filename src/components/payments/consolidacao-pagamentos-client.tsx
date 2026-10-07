'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Download, FileText, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { StatusBadge, type Tone } from '@/components/ui/ds/status-badge';
import { Banner } from '@/components/ui/ds/banner';
import { Table } from '@/components/ui/ds/table';
import { formatBRL } from '@/lib/utils';
import {
  PERIODOS_RAPIDOS, STATUS_CONS, rotuloSegunda, STATUS_TEXTO, TIPO_TEXTO, TIPOS_CONS, emBR, entraNosTotais, ordenar, queryDoFiltro, textoHoras,
  type Aba, type Consolidacao, type FiltroConsolidacao, type Lancamento, type Ordem, type PeriodoRapido, type PeriodoResolvido,
  type Recorrencia, type Visao,
} from '@/lib/payments/consolidacao-calculo';

const BASE = '/modulos/pagamentos/consolidacao';
const TOM_STATUS: Record<Lancamento['status'], Tone> = { PENDING: 'warning', APPROVED: 'info', PAID: 'success', REJECTED: 'danger' };

/**
 * CONSOLIDAÇÃO DE PAGAMENTOS — a tela (v1.126.0; duas visões na v1.127.0).
 *
 * VISÃO FINANCEIRA: quem recebe, por qual unidade e tipo, e quanto — o
 * fechamento para o Financeiro. RECORRÊNCIA: o freelancer chamado de novo e
 * de novo — a gestão. Mesma base, mesmos filtros de período e unidade.
 *
 * Os filtros moram na URL: o servidor recalcula e tela, Excel e PDF saem da
 * MESMA conta. Ordenação e a troca Por lançamento / Por colaborador são só de
 * exibição. Nenhum botão desta tela grava nada.
 */
export function ConsolidacaoPagamentosClient({ filtro, unidades, periodo, financeiro, recorrencia }: {
  filtro: FiltroConsolidacao;
  unidades: { id: string; name: string }[];
  periodo: PeriodoResolvido;
  financeiro?: Consolidacao;
  recorrencia?: Recorrencia;
}) {
  const router = useRouter();
  const aba: Aba = filtro.aba ?? 'financeiro';
  const [de, setDe] = useState(filtro.de ?? periodo.de);
  const [ate, setAte] = useState(filtro.ate ?? periodo.ate);

  const ir = (mudar: Partial<FiltroConsolidacao>) => router.push(`${BASE}?${queryDoFiltro({ ...filtro, ...mudar })}`);
  const q = queryDoFiltro(filtro);

  return (
    <div className="space-y-4">
      {/* ── As duas visões ── */}
      <SegmentedControl<Aba>
        aria-label="Visão"
        value={aba}
        onValueChange={(v) => ir({ aba: v, pessoa: undefined })}
        options={[{ value: 'financeiro', label: 'Visão financeira' }, { value: 'recorrencia', label: 'Recorrência de freelancers' }]}
      />

      {/* ── Período ── */}
      <section className="space-y-2" aria-label="Período">
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS_RAPIDOS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={filtro.periodo === p.value}
              onClick={() => (p.value === 'personalizado' ? ir({ periodo: 'personalizado', de, ate }) : ir({ periodo: p.value as PeriodoRapido, de: undefined, ate: undefined }))}
              className={filtro.periodo === p.value
                ? 'rounded-control bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand'
                : 'rounded-control border border-line px-3 py-1.5 text-sm font-semibold text-ink-700 hover:border-brand'}
            >
              {p.label}
            </button>
          ))}
        </div>
        {filtro.periodo === 'personalizado' && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44"><DatePicker label="De" value={de || null} onValueChange={(v) => setDe(v ?? '')} /></div>
            <div className="w-44"><DatePicker label="Até" value={ate || null} onValueChange={(v) => setAte(v ?? '')} /></div>
            <button type="button" onClick={() => ir({ periodo: 'personalizado', de: de || undefined, ate: ate || undefined })} className="h-10 rounded-control bg-brand px-3 text-sm font-semibold text-on-brand">Aplicar</button>
          </div>
        )}
        <p className="text-sm text-ink-700">Período: <b>{periodo.rotulo}</b> · pela <b>data do serviço</b> (dia da hora extra ou do freelancer), não pela data em que a solicitação foi criada.</p>
      </section>

      {/* ── Filtros ── */}
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros">
        <Select
          label="Unidade"
          value={filtro.unitId ?? ''}
          onValueChange={(v) => ir({ unitId: v || undefined, pessoa: undefined })}
          options={[{ value: '', label: 'Todas as unidades' }, ...unidades.map((u) => ({ value: u.id, label: u.name }))]}
        />
        {aba === 'financeiro' && financeiro && (
          <>
            <Select label="Tipo" value={filtro.tipo} onValueChange={(v) => ir({ tipo: v as FiltroConsolidacao['tipo'], pessoa: undefined })} options={TIPOS_CONS} />
            <Select label="Status" value={filtro.status} onValueChange={(v) => ir({ status: v as FiltroConsolidacao['status'] })} options={STATUS_CONS} />
            <Select
              label="Colaborador"
              searchable
              searchPlaceholder="Pesquisar colaborador…"
              value={filtro.pessoa ?? ''}
              onValueChange={(v) => ir({ pessoa: v || undefined })}
              options={[{ value: '', label: 'Todos' }, ...financeiro.pessoas]}
            />
          </>
        )}
      </section>

      {/* ── Exportar: no alto, à vista ── */}
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/payments/consolidacao/export?${q}`} className="inline-flex h-10 items-center gap-1.5 rounded-control bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover">
          <Download className="h-4 w-4" /> Exportar Excel
        </a>
        <a href={`${BASE}/relatorio?${q}&imprimir=1`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-control border border-line-strong px-3 text-sm font-semibold text-ink-900 hover:border-brand">
          <FileText className="h-4 w-4" /> Gerar PDF
        </a>
        <p className="text-xs text-ink-500">
          {aba === 'financeiro' ? 'Relatório financeiro — para o Financeiro.' : 'Relatório de recorrência — para Gestão/Diretoria.'}
          {' '}Exportar <b>não</b> marca nada como pago.
        </p>
      </div>

      {aba === 'financeiro' && financeiro && <VisaoFinanceira dados={financeiro} filtro={filtro} />}
      {aba === 'recorrencia' && recorrencia && <VisaoRecorrencia dados={recorrencia} />}
    </div>
  );
}

/* ───────────────────────── Visão financeira ───────────────────────── */

function Faixa({ itens }: { itens: { rotulo: string; valor: string; destaque?: boolean; dica?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4 lg:grid-cols-7">
      {itens.map((i) => (
        <div key={i.rotulo} className={`bg-surface px-3 py-2 ${i.destaque ? 'col-span-2 sm:col-span-1' : ''}`}>
          <dt className="sgo-type-11 font-semibold text-ink-500">{i.rotulo}</dt>
          <dd className={`tabular-nums ${i.destaque ? 'sgo-type-17 font-bold text-brand' : 'sgo-type-15 font-semibold text-ink-900'}`}>{i.valor}</dd>
          {i.dica && <dd className="text-xs text-ink-500">{i.dica}</dd>}
        </div>
      ))}
    </dl>
  );
}

function VisaoFinanceira({ dados, filtro }: { dados: Consolidacao; filtro: FiltroConsolidacao }) {
  const [visao, setVisao] = useState<Visao>('lancamento');
  const [ordem, setOrdem] = useState<Ordem>('data');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [aberto, setAberto] = useState<string | null>(null);
  const r = dados.resumo;

  const linhas = useMemo(() => ordenar(dados.lancamentos, ordem, dir), [dados.lancamentos, ordem, dir]);
  const ordenarPor = (o: Ordem) => {
    if (o === ordem) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setOrdem(o); setDir(o === 'valor' ? 'desc' : 'asc'); }
  };

  return (
    <div className="space-y-4">
      <Faixa itens={[
        { rotulo: 'Solicitações', valor: String(r.solicitacoes) },
        { rotulo: 'Freelancers', valor: String(r.freelancers) },
        { rotulo: 'Horas extras', valor: String(r.horasExtras) },
        { rotulo: 'Valor freelancer', valor: formatBRL(r.valorFreelancer) },
        { rotulo: 'Valor hora extra', valor: formatBRL(r.valorHoraExtra) },
        { rotulo: 'Vale-transporte', valor: formatBRL(r.vt), dica: 'já dentro dos valores' },
        { rotulo: 'Total geral', valor: formatBRL(r.total), destaque: true },
      ]} />

      {/* Status = Todos: o total separado pelo que ele é. */}
      {filtro.status === 'TODOS' && (
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3" aria-label="Total por situação">
          <div className="bg-surface px-3 py-2"><dt className="sgo-type-11 font-semibold text-warning">Solicitado — pendente</dt><dd className="sgo-type-15 font-semibold tabular-nums text-ink-900">{formatBRL(r.porStatus.pendente)}</dd><dd className="text-xs text-ink-500">ainda sem aprovação</dd></div>
          <div className="bg-surface px-3 py-2"><dt className="sgo-type-11 font-semibold text-info">Aprovado — a pagar</dt><dd className="sgo-type-15 font-semibold tabular-nums text-ink-900">{formatBRL(r.porStatus.aprovado)}</dd><dd className="text-xs text-ink-500">na aba Pagar</dd></div>
          <div className="bg-surface px-3 py-2"><dt className="sgo-type-11 font-semibold text-success">Pago</dt><dd className="sgo-type-15 font-semibold tabular-nums text-ink-900">{formatBRL(r.porStatus.pago)}</dd><dd className="text-xs text-ink-500">já pago</dd></div>
        </dl>
      )}

      {r.fora.qtd > 0 && (
        <Banner tone="info" title={`${r.fora.qtd} rejeitada(s) fora dos totais`} description={`Aparecem riscadas na lista (${formatBRL(r.fora.valor)}), mas não somam. Para somá-las, filtre o status Rejeitado.`} />
      )}
      {filtro.status === 'TODOS' && r.pendentes.qtd > 0 && (
        <Banner tone="warning" title={`${r.pendentes.qtd} pendente(s) de aprovação dentro do total`} description={`${formatBRL(r.pendentes.valor)} ainda não foram aprovados. Para mandar ao Financeiro só o que está a pagar, filtre o status Aprovado (a pagar).`} />
      )}

      {/* ── Por unidade: cada unidade no seu bloco ── */}
      {dados.porUnidade.length > 0 && (
        <section aria-label="Consolidado por unidade" className="space-y-2">
          <h2 className="sgo-type-15 font-semibold text-ink-900">Por unidade</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {dados.porUnidade.map((u) => (
              <div key={u.unitId} className="rounded-card border border-line bg-surface p-3">
                <p className="sgo-type-13 mb-1 font-semibold text-brand">{u.unidade.toUpperCase()}</p>
                <dl className="space-y-0.5 text-sm">
                  <div className="flex justify-between"><dt className="text-ink-500">Solicitações</dt><dd className="tabular-nums">{u.qtd}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-500">Freelancer</dt><dd className="tabular-nums">{formatBRL(u.freelancer)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-500">Hora Extra</dt><dd className="tabular-nums">{formatBRL(u.horaExtra)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-500">Vale-transporte (já dentro)</dt><dd className="tabular-nums">{formatBRL(u.vt)}</dd></div>
                  <div className="flex justify-between border-t border-line pt-1 font-semibold text-ink-900"><dt>TOTAL</dt><dd className="tabular-nums">{formatBRL(u.total)}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Pagamento por segunda-feira (v1.160.0): o freelancer da semana seg→dom é pago na segunda seguinte ── */}
      {dados.porSegunda.length > 0 && (
        <section aria-label="Pagamento dos freelancers por segunda-feira" className="space-y-2" data-testid="por-segunda">
          <h2 className="sgo-type-15 font-semibold text-ink-900">Freelancers: quando pagar</h2>
          <p className="text-xs text-ink-500">Quem trabalhou de segunda a domingo é pago na <b>segunda-feira seguinte</b>. Cada linha é uma segunda: a semana que ela paga e o que já foi pago, o que está aprovado a pagar e o que ainda espera aprovação. Hora extra não entra aqui (vai pelo cartão, na competência).</p>
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-canvas text-left text-xs text-ink-500">
                <tr>
                  <th className="px-2 py-2 font-semibold">Pagar na segunda</th>
                  <th className="px-2 py-2 font-semibold">Semana do serviço</th>
                  <th className="px-2 py-2 text-right font-semibold">Solicitações</th>
                  <th className="px-2 py-2 text-right font-semibold">Freelancers</th>
                  <th className="px-2 py-2 text-right font-semibold">Pago</th>
                  <th className="px-2 py-2 text-right font-semibold">A pagar</th>
                  <th className="px-2 py-2 text-right font-semibold">Pendente</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dados.porSegunda.map((s) => (
                  <tr key={s.pagarEm} className={s.atrasado ? 'bg-danger-bg' : ''} data-testid={`segunda-${s.pagarEm}`}>
                    <td className="whitespace-nowrap px-2 py-1.5 font-semibold tabular-nums text-brand">{rotuloSegunda(s.pagarEm)}{s.atrasado && <span className="ml-1 text-xs font-semibold text-danger">· atrasado</span>}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-ink-700">{emBR(s.semanaDe)} a {emBR(s.semanaAte)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.qtd}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.freelancers}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-success">{formatBRL(s.pago)}</td>
                    <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${s.aPagar > 0 ? 'text-info' : ''}`}>{formatBRL(s.aPagar)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${s.pendente > 0 ? 'text-warning' : ''}`}>{formatBRL(s.pendente)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-ink-900">{formatBRL(s.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Lançamentos ── */}
      <section aria-label="Lançamentos" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sgo-type-15 font-semibold text-ink-900">{dados.lancamentos.length} lançamento(s)</h2>
          <SegmentedControl<Visao>
            aria-label="Visualização"
            size="sm"
            value={visao}
            onValueChange={setVisao}
            options={[{ value: 'lancamento', label: 'Por lançamento' }, { value: 'colaborador', label: 'Por colaborador' }]}
          />
        </div>

        {dados.lancamentos.length === 0 ? (
          <p className="rounded-card border border-dashed border-line p-4 text-sm text-ink-500">Nenhum Freelancer ou Hora Extra com esses filtros no período.</p>
        ) : visao === 'lancamento' ? (
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-canvas text-left text-xs text-ink-500">
                <tr>
                  <Th o="data" rotulo="Data" atual={ordem} dir={dir} onClick={ordenarPor} />
                  <th className="px-2 py-2 font-semibold" title="Freelancer: segunda-feira seguinte à semana do serviço. Hora extra: cartão, pela competência.">Pagar em</th>
                  <Th o="unidade" rotulo="Unidade" atual={ordem} dir={dir} onClick={ordenarPor} />
                  <Th o="tipo" rotulo="Tipo" atual={ordem} dir={dir} onClick={ordenarPor} />
                  <Th o="colaborador" rotulo="Colaborador" atual={ordem} dir={dir} onClick={ordenarPor} />
                  <th className="px-2 py-2 text-right font-semibold">Horas</th>
                  <th className="px-2 py-2 font-semibold">Motivo</th>
                  <th className="px-2 py-2 text-right font-semibold">V.T.</th>
                  <Th o="valor" rotulo="Valor" atual={ordem} dir={dir} onClick={ordenarPor} direita />
                  <Th o="status" rotulo="Status" atual={ordem} dir={dir} onClick={ordenarPor} />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {linhas.map((l) => <LinhaDoLancamento key={l.id} l={l} somando={entraNosTotais(l, filtro.status)} />)}
              </tbody>
              <RodapeDeTotais resumo={r} colunas={10} colVt={7} />
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-canvas text-left text-xs text-ink-500">
                <tr>
                  <th className="px-2 py-2 font-semibold">Colaborador</th>
                  <th className="px-2 py-2 font-semibold">Unidade</th>
                  <th className="px-2 py-2 text-right font-semibold">Lanç.</th>
                  <th className="px-2 py-2 text-right font-semibold">Freelancer</th>
                  <th className="px-2 py-2 text-right font-semibold">Hora Extra</th>
                  <th className="px-2 py-2 text-right font-semibold">V.T.</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dados.porColaborador.map((p) => (
                  <PessoaComLancamentos key={p.chave} p={p} aberto={aberto === p.chave} alternar={() => setAberto(aberto === p.chave ? null : p.chave)} status={filtro.status} />
                ))}
              </tbody>
              <tfoot className="bg-sunken">
                <tr className="border-t-2 border-line-strong font-semibold text-ink-900">
                  <td className="px-2 py-2" colSpan={2}>TOTAL · {dados.porColaborador.length} pessoa(s)</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.solicitacoes}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(r.valorFreelancer)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(r.valorHoraExtra)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(r.vt)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(r.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-500">
          Valor = o valor da solicitação, o mesmo pago na aba Pagar. O vale-transporte lançado já está DENTRO dele — por isso o total geral é Freelancer + Hora Extra, sem somar o V.T. de novo.
          Cada lançamento é uma linha: o mesmo colaborador em dias diferentes não é fundido.
          “Pagar em” é a segunda-feira seguinte à semana do serviço (regra da operação); “em dd/mm” ao lado do status Pago é o dia em que a aba Pagar marcou o pagamento.
        </p>
      </section>
    </div>
  );
}

/** Os quatro totais no pé da tabela, somados pelo sistema (nada de calculadora). */
function RodapeDeTotais({ resumo: r, colunas, colVt }: { resumo: Consolidacao['resumo']; colunas: number; colVt: number }) {
  const linha = (rotulo: string, valor: number, emVt = false, forte = false) => (
    <tr className={forte ? 'border-t-2 border-line-strong font-bold text-ink-900' : 'text-ink-700'}>
      <td className="px-2 py-1.5 font-semibold" colSpan={colVt}>{rotulo}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{emVt ? formatBRL(valor) : ''}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{emVt ? '' : formatBRL(valor)}</td>
      <td className="px-2 py-1.5" colSpan={colunas - colVt - 2} />
    </tr>
  );
  return (
    <tfoot className="bg-sunken">
      {linha('TOTAL FREELANCER', r.valorFreelancer)}
      {linha('TOTAL HORA EXTRA', r.valorHoraExtra)}
      {linha('TOTAL VALE-TRANSPORTE (já dentro dos valores)', r.vt, true)}
      {linha('TOTAL GERAL', r.total, false, true)}
    </tfoot>
  );
}

function Th({ o, rotulo, atual, dir, onClick, direita = false }: { o: Ordem; rotulo: string; atual: Ordem; dir: 'asc' | 'desc'; onClick: (o: Ordem) => void; direita?: boolean }) {
  const Icone = atual !== o ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`px-2 py-2 font-semibold ${direita ? 'text-right' : ''}`} aria-sort={atual === o ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => onClick(o)} className="inline-flex items-center gap-1 hover:text-ink-900">
        {rotulo} <Icone className="h-3 w-3" aria-hidden />
      </button>
    </th>
  );
}

function LinhaDoLancamento({ l, somando, recuo = false }: { l: Lancamento; somando: boolean; recuo?: boolean }) {
  return (
    <tr className={somando ? '' : 'text-ink-400'}>
      <td className={`whitespace-nowrap px-2 py-1.5 tabular-nums ${recuo ? 'pl-8' : ''}`}>{emBR(l.data)}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums">
        {l.pagarEm
          ? <span className={l.status === 'PAID' ? 'text-ink-500' : 'font-semibold text-brand'}>{rotuloSegunda(l.pagarEm)}</span>
          : <span className="text-ink-400" title="Hora extra é paga pela competência, no cartão">cartão</span>}
      </td>
      <td className="px-2 py-1.5">{l.unidade}</td>
      <td className="px-2 py-1.5">{TIPO_TEXTO[l.tipo]}</td>
      <td className="px-2 py-1.5">
        <span className="font-medium text-ink-900">{l.pessoa}</span>
        {l.semVinculoRh && <span className="ml-1 text-xs text-warning" title="Lançada antes do vínculo com o RH: nome digitado">(nome digitado)</span>}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{textoHoras(l.horas)}</td>
      <td className="max-w-[12rem] truncate px-2 py-1.5 text-ink-500" title={l.motivo ?? undefined}>{l.motivo ?? '–'}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(l.vt)}</td>
      <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${somando ? 'text-ink-900' : 'line-through'}`}>{formatBRL(l.valor)}</td>
      <td className="whitespace-nowrap px-2 py-1.5">
        <StatusBadge tone={TOM_STATUS[l.status]}>{STATUS_TEXTO[l.status]}</StatusBadge>
        {l.pagoEm && <span className="ml-1 text-xs text-ink-500" title="Dia em que foi marcada como paga na aba Pagar">em {emBR(l.pagoEm)}</span>}
      </td>
    </tr>
  );
}

function PessoaComLancamentos({ p, aberto, alternar, status }: { p: Consolidacao['porColaborador'][number]; aberto: boolean; alternar: () => void; status: FiltroConsolidacao['status'] }) {
  const Seta = aberto ? ChevronDown : ChevronRight;
  return (
    <>
      <tr className="cursor-pointer hover:bg-canvas" onClick={alternar}>
        <td className="px-2 py-1.5">
          <button type="button" aria-expanded={aberto} className="inline-flex items-center gap-1 text-left font-medium text-ink-900">
            <Seta className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
            {p.pessoa}
          </button>
        </td>
        <td className="px-2 py-1.5 text-ink-700">{p.unidades.join(', ')}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{p.lancamentos.length}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(p.freelancer)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(p.horaExtra)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(p.vt)}</td>
        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-ink-900">{formatBRL(p.total)}</td>
      </tr>
      {aberto && (
        <tr>
          <td colSpan={7} className="bg-canvas px-2 py-2">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {p.lancamentos.map((l) => <LinhaDoLancamento key={l.id} l={l} somando={entraNosTotais(l, status)} recuo />)}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

/* ───────────────────────── Recorrência ───────────────────────── */

function VisaoRecorrencia({ dados }: { dados: Recorrencia }) {
  const t = dados.totais;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3" aria-label="Totais dos recorrentes">
        <div className="bg-surface px-3 py-2"><dt className="sgo-type-11 font-semibold text-ink-500">Freelancers recorrentes</dt><dd className="sgo-type-17 font-bold tabular-nums text-warning">{t.freelancers}</dd></div>
        <div className="bg-surface px-3 py-2"><dt className="sgo-type-11 font-semibold text-ink-500">Solicitações dos recorrentes</dt><dd className="sgo-type-17 font-bold tabular-nums text-ink-900">{t.solicitacoes}</dd></div>
        <div className="bg-surface px-3 py-2"><dt className="sgo-type-11 font-semibold text-ink-500">Valor total dos recorrentes</dt><dd className="sgo-type-17 font-bold tabular-nums text-brand">{formatBRL(t.valor)}</dd></div>
      </dl>
      <p className="text-xs text-ink-500">
        Recorrente = mais de {dados.limiteSemanal} solicitações do mesmo freelancer numa semana (segunda a domingo) — a mesma regra que avisa a supervisão ao lançar.
        A contagem considera todas as unidades que você enxerga: o freelancer é o mesmo em qualquer unidade, e a coluna Unidade mostra onde ele trabalhou.
      </p>
      <Table
        caption="Freelancers recorrentes por semana"
        rows={dados.linhas}
        getRowKey={(g) => g.chave}
        empty={<p className="p-4 text-sm text-ink-500">Nenhum freelancer passou do limite semanal no período.</p>}
        columns={[
          { key: 'nome', header: 'Freelancer', cell: (g) => <span className="font-semibold text-ink-900">{g.nome}</span> },
          { key: 'unidade', header: 'Unidade', cell: (g) => g.unidades.join(', ') },
          { key: 'semana', header: 'Semana', width: '9rem', cell: (g) => `${emBR(g.semanaDe).slice(0, 5)} a ${emBR(g.semanaAte).slice(0, 5)}` },
          { key: 'qtd', header: 'Solicitações na semana', numeric: true, width: '9rem', cell: (g) => g.solicitacoes },
          { key: 'valor', header: 'Valor total', numeric: true, width: '8rem', cell: (g) => formatBRL(g.valor) },
        ]}
        footer={{
          nome: `TOTAL · ${t.freelancers} freelancer(s)`,
          semana: t.semanas !== t.freelancers ? `${t.semanas} semana(s)` : null,
          qtd: t.solicitacoes,
          valor: formatBRL(t.valor),
        }}
      />
    </div>
  );
}
