'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, TrendingUp, TrendingDown, Minus, AlertTriangle, Building2, Download, FileText } from 'lucide-react';
import { StatCard } from '@/components/ui/ds/stat-card';
import { Banner } from '@/components/ui/ds/banner';
import { Modal } from '@/components/ui/ds/modal';
import { Table } from '@/components/ui/ds/table';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { FilterBar, FilterSelect, FilterDate } from '@/components/ui/filter-bar';
import { Group } from '@/components/ui/ds/group';
import { shortUnitName } from '@/lib/unit-name';
import { formatBRL } from '@/lib/utils';
import { formatarCpf } from '@/lib/cpf';
import {
  PERIODO_LABEL, TIPO_LABEL, STATUS_LABEL, emBR,
  type Consolidado, type FiltroConsolidado, type FreelancerNoPeriodo,
  type LinhaDoConsolidado, type PeriodoKey, type RecorrenciaFiltro, type StatusFiltro, type TipoFiltro,
} from '@/lib/payments/consolidado-tipos';
import { totaisDaRecorrencia } from '@/lib/payments/consolidacao-calculo';
import { queryDoFiltroConsolidado } from '@/lib/payments/consolidado-tipos';
import { analisarConsolidado, agruparRecorrentes } from '@/lib/payments/consolidado-executivo';
import { LeituraExecutiva, BarrasDeParticipacao, BaixarRelatorio } from '@/components/shared/leitura-executiva';

interface Unit { id: string; name: string }

/** O domingo da semana que começa nesta segunda (AAAA-MM-DD). */
const domingoDe = (segunda: string) => new Date(new Date(`${segunda}T12:00:00Z`).getTime() + 6 * 86400000).toISOString().slice(0, 10);

const opt = <T extends string>(rec: Record<T, string>, ordem: T[]) => ordem.map((v) => ({ value: v, label: rec[v] }));

const PERIODOS = opt(PERIODO_LABEL, ['semana', 'semana-anterior', 'mes', 'mes-anterior', 'personalizado'] as PeriodoKey[]);
const TIPOS = opt(TIPO_LABEL, ['TODOS', 'FREELANCER', 'OVERTIME'] as TipoFiltro[]);
const STATUS = opt(STATUS_LABEL, ['TODOS', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'] as StatusFiltro[]);
const RECORRENCIA: { value: RecorrenciaFiltro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'recorrentes', label: 'Somente recorrentes' },
];

const ORDENS = [
  { value: 'valor', label: 'Valor' },
  { value: 'solicitacoes', label: 'Solicitações' },
  { value: 'recorrentes', label: 'Recorrentes' },
];

export function ConsolidadoClient({ dados, filtro, units }: { dados: Consolidado; filtro: FiltroConsolidado; units: Unit[] }) {
  const router = useRouter();
  const [ordem, setOrdem] = useState('valor');
  const [aberto, setAberto] = useState<FreelancerNoPeriodo | null>(null);

  /* Os filtros vivem na URL: é o servidor que agrega, e um link do consolidado
     precisa abrir a mesma tela para quem recebe. */
  function navegar(mudanca: Partial<FiltroConsolidado>) {
    router.push(`/modulos/pagamentos/relatorio-freelancers?${queryDoFiltroConsolidado({ ...filtro, ...mudanca })}`);
  }

  const ativos = (filtro.unitId ? 1 : 0) + (filtro.tipo !== 'TODOS' ? 1 : 0) + (filtro.status !== 'TODOS' ? 1 : 0) + (filtro.recorrencia !== 'todos' ? 1 : 0);
  const r = dados.resumo;
  /* v1.224.0 — a leitura executiva: a mesma conta, respondida em frases e fatias. */
  const analise = useMemo(() => analisarConsolidado(dados), [dados]);
  /* Totais dos recorrentes (v1.127.0): eram somados na calculadora. */
  const tRec = totaisDaRecorrencia(dados.recorrentesNaSemana);
  /* v1.225.0 — um cartão por pessoa, com as semanas dentro (a tabela repetia o nome a cada semana). */
  const recorrentes = useMemo(() => agruparRecorrentes(dados.recorrentesNaSemana), [dados.recorrentesNaSemana]);
  /* Os relatórios de recorrência saem da Consolidação de pagamentos, com o
     MESMO período e a mesma unidade desta tela. */
  const qRec = new URLSearchParams({ aba: 'recorrencia', periodo: 'personalizado', de: dados.periodo.de, ate: dados.periodo.ate });
  if (filtro.unitId) qRec.set('unidade', filtro.unitId);
  /* Hora Extra entra na contagem quando o tipo é Todos/Hora Extra, mas esta
     tela LISTA freelancers (por cadastro de freelancer): sem o aviso, elas
     "somem" — estão no número e em linha nenhuma. */
  const horasExtras = r.solicitacoes - dados.freelancers.reduce((n, f) => n + f.solicitacoes, 0);

  const unidades = useMemo(() => {
    const xs = [...dados.porUnidade];
    if (ordem === 'solicitacoes') xs.sort((a, b) => b.solicitacoes - a.solicitacoes || b.valor - a.valor);
    else if (ordem === 'recorrentes') xs.sort((a, b) => b.recorrentes - a.recorrentes || b.valor - a.valor);
    return xs;
  }, [dados.porUnidade, ordem]);

  const maxEvolucao = Math.max(...dados.evolucao.pontos.map((p) => p.solicitacoes), 1);
  const nomeDaUnidade = filtro.unitId ? units.find((u) => u.id === filtro.unitId)?.name : null;

  return (
    <div className="space-y-4">
      {/* ── Leitura rápida: a frase que responde a pergunta antes de qualquer
             tabela. Fica no topo de propósito. ── */}
      <div className="rounded-card border-2 border-brand/40 bg-brand/5 p-3">
        <p className="sgo-type-11 font-semibold text-ink-500">{PERIODO_LABEL[filtro.periodo]}{nomeDaUnidade ? ` · ${shortUnitName(nomeDaUnidade)}` : ''} · {emBR(dados.periodo.de)} a {emBR(dados.periodo.ate)}</p>
        <p className="mt-1 text-sm text-ink-900">
          <b className="sgo-type-17">{r.solicitacoes}</b> solicitações
          {' · '}<b>{r.freelancersUnicos}</b> freelancers únicos
          {' · '}<b className={r.recorrentes > 0 ? 'text-warning' : undefined}>{r.recorrentes}</b> recorrentes
          {' · '}<b>{formatBRL(r.valorSolicitado)}</b>
        </p>
        <Comparacao dados={dados} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500">Relatório executivo do recorte abaixo. O Excel traz resumo, unidade, freelancer, recorrentes, setor e cada lançamento — sem CPF e sem PIX (isso é do Fechamento).</p>
        <BaixarRelatorio excelHref={`/api/payments/freelancer-report/consolidado?${queryDoFiltroConsolidado(filtro)}`} pdfOnClick={() => window.print()} />
      </div>

      <LeituraExecutiva titulo="Leitura do período" frases={analise.leituras} />

      <div className="print:hidden">
      <FilterBar
        active={ativos}
        onClear={ativos > 0 ? () => navegar({ unitId: undefined, tipo: 'TODOS', status: 'TODOS', recorrencia: 'todos' }) : undefined}
        result={<span>{r.solicitacoes} solicitação(ões)</span>}
      >
        <FilterSelect label="Período" value={filtro.periodo} options={PERIODOS} onValueChange={(v) => navegar({ periodo: v as PeriodoKey })} />
        {filtro.periodo === 'personalizado' && (
          <>
            <FilterDate label="De" value={filtro.de ?? dados.periodo.de} onValueChange={(v) => navegar({ de: v ?? undefined })} max={filtro.ate ?? undefined} />
            <FilterDate label="Até" value={filtro.ate ?? dados.periodo.ate} onValueChange={(v) => navegar({ ate: v ?? undefined })} min={filtro.de ?? undefined} />
          </>
        )}
        <FilterSelect
          label="Unidade" value={filtro.unitId ?? ''}
          options={[{ value: '', label: 'Todas' }, ...units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]}
          onValueChange={(v) => navegar({ unitId: v || undefined })}
        />
        <FilterSelect label="Tipo" value={filtro.tipo} options={TIPOS} onValueChange={(v) => navegar({ tipo: v as TipoFiltro })} />
        <FilterSelect label="Status" value={filtro.status} options={STATUS} onValueChange={(v) => navegar({ status: v as StatusFiltro })} />
        <FilterSelect label="Recorrência" value={filtro.recorrencia} options={RECORRENCIA} onValueChange={(v) => navegar({ recorrencia: v as RecorrenciaFiltro })} />
      </FilterBar>
      </div>

      {/* ── Indicadores ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="solicitações" value={String(r.solicitacoes)} />
        <StatCard label="freelancers únicos" value={String(r.freelancersUnicos)} />
        <StatCard label="recorrentes" value={String(r.recorrentes)} tone={r.recorrentes > 0 ? 'warning' : undefined} />
        <StatCard label="valor solicitado" value={formatBRL(r.valorSolicitado)} />
        <StatCard label="aprovado / pago" value={formatBRL(r.valorAprovadoPago)} />
        <StatCard label="média por unidade" value={r.mediaPorUnidade.toFixed(1).replace('.', ',')} />
        <StatCard label="valor médio por solicitação" value={analise.ticketMedio === null ? '—' : formatBRL(analise.ticketMedio)} />
        <StatCard label="valor médio por freelancer" value={analise.valorPorFreelancer === null ? '—' : formatBRL(analise.valorPorFreelancer)} />
        <StatCard label="valor em recorrentes" value={formatBRL(analise.recorrencia.valor)} hint={`${analise.recorrencia.pctDoValor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do valor`} tone={analise.recorrencia.pessoas > 0 ? 'warning' : undefined} />
      </div>

      {/* ── Onde o valor está (v1.224.0) ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BarrasDeParticipacao testId="barras-status" titulo="Situação do valor" itens={analise.porStatus.map((s) => ({ rotulo: s.rotulo, valor: formatBRL(s.valor), pct: s.pct, apoio: `${s.qtd} solic.` }))} nota="Percentual sobre o valor válido do recorte; rejeitadas não contam." />
        <BarrasDeParticipacao testId="barras-unidade" titulo="Valor por unidade" itens={analise.porUnidade.map((u) => ({ rotulo: shortUnitName(u.rotulo), valor: formatBRL(u.valor), pct: u.pct, apoio: `${u.qtd} solic.` }))} />
        <BarrasDeParticipacao testId="barras-top" titulo={`Maiores valores · ${analise.topFreelancers.length} freelancer(s) = ${analise.top5Pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do total`} itens={analise.topFreelancers.map((t) => ({ rotulo: t.rotulo, valor: formatBRL(t.valor), pct: t.pct, apoio: `${t.qtd} solic.${t.recorrente ? ' · recorrente' : ''}`, destaque: t.recorrente }))} />
        <BarrasDeParticipacao testId="barras-dia" titulo="Por dia da semana (dia do serviço)" itens={analise.porDiaDaSemana.filter((d) => d.qtd > 0).map((d) => ({ rotulo: d.rotulo, valor: formatBRL(d.valor), pct: d.pct, apoio: `${d.qtd} solic.` }))} />
        {analise.porSetor.length > 1 && (
          <BarrasDeParticipacao testId="barras-setor" titulo="Por setor" itens={analise.porSetor.map((s) => ({ rotulo: s.rotulo, valor: formatBRL(s.valor), pct: s.pct, apoio: `${s.qtd} solic.` }))} />
        )}
      </div>

      {/* Rejeitadas ficam À PARTE do valor solicitado: somá-las inflaria o custo
          com dinheiro que não vai sair. Some do histórico, não. */}
      {r.rejeitadasCount > 0 && (
        <p className="text-xs text-ink-500">
          Fora dos valores acima: <b className="text-ink-900">{r.rejeitadasCount}</b> solicitação(ões) rejeitada(s), {formatBRL(r.rejeitadasValor)} — permanecem no histórico.
        </p>
      )}

      {/* ── Evolução (v1.225.0): colunas com o valor, a quantidade e o período ── */}
      {dados.evolucao.pontos.length > 1 && (
        <section className="sgo-panel sgo-panel--solid p-4" data-testid="evolucao-do-periodo">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink-900">Solicitações por {dados.evolucao.granularidade === 'semana' ? 'semana' : 'mês'}</h2>
            <p className="text-xs text-ink-500">{dados.evolucao.granularidade === 'semana' ? 'Semana de segunda a domingo, pelo dia do serviço.' : 'Pelo dia do serviço.'} A mais cheia fica em destaque.</p>
          </div>
          <div className="mt-6 grid items-end gap-2 sm:gap-4" style={{ gridTemplateColumns: `repeat(${dados.evolucao.pontos.length}, minmax(0, 1fr))` }}>
            {dados.evolucao.pontos.map((p) => {
              const topo = p.solicitacoes === maxEvolucao;
              const fim = dados.evolucao.granularidade === 'semana' ? emBR(domingoDe(p.chave)).slice(0, 5) : null;
              return (
                <div key={p.chave} className="flex min-w-0 flex-col items-center gap-1">
                  <span className={`sgo-type-17 font-bold tabular-nums ${topo ? 'text-brand' : 'text-ink-900'}`}>{p.solicitacoes}</span>
                  <div className="flex h-32 w-full items-end rounded-card bg-sunken">
                    <div className={`w-full rounded-card ${topo ? 'bg-brand' : 'bg-brand/60'}`} style={{ height: `${Math.max(4, (p.solicitacoes / maxEvolucao) * 100)}%` }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-ink-900">{formatBRL(p.valor)}</span>
                  <span className="text-center sgo-type-11 text-ink-500">{fim ? `${p.rotulo} a ${fim}` : p.rotulo}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {horasExtras > 0 && (
        <Banner
          tone="info"
          title={`${horasExtras} hora(s) extra(s) no período`}
          description="Elas entram na contagem de solicitações, mas esta tela lista só freelancers. Para ver cada hora extra (colaborador, horas, valor) e fechar com o Financeiro, use a Consolidação de pagamentos → Visão financeira."
          action={<a href={`/modulos/pagamentos/consolidacao?periodo=personalizado&de=${dados.periodo.de}&ate=${dados.periodo.ate}${filtro.unitId ? `&unidade=${filtro.unitId}` : ''}`} className="text-sm font-semibold text-brand hover:underline">Abrir visão financeira</a>}
        />
      )}

      {/* ── Freelancers recorrentes ── */}
      <section className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sgo-type-11 font-semibold text-ink-900">Freelancers recorrentes</h2>
          <div className="flex gap-2">
            <a href={`/api/payments/consolidacao/export?${qRec.toString()}`} className="inline-flex h-8 items-center gap-1 rounded-control border border-line-strong px-2 text-xs font-semibold text-ink-900 hover:border-brand"><Download className="h-3.5 w-3.5" /> Excel</a>
            <a href={`/modulos/pagamentos/consolidacao/relatorio?${qRec.toString()}&imprimir=1`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-control border border-line-strong px-2 text-xs font-semibold text-ink-900 hover:border-brand"><FileText className="h-3.5 w-3.5" /> PDF</a>
          </div>
        </div>
        <p className="text-xs text-ink-500">
          Mais de {dados.limiteSemanal} solicitações do mesmo freelancer numa semana (segunda a domingo) — a mesma regra que avisa a supervisão ao lançar.
          A contagem considera todas as unidades que você enxerga, mesmo com o filtro de unidade ligado: o freelancer é o mesmo em qualquer uma.
        </p>
        {recorrentes.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum freelancer recorrente no período" description="Ninguém passou do limite semanal." size="sm" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-card bg-warning-bg p-3 text-center" data-testid="resumo-recorrentes">
              <div><p className="sgo-type-24 font-bold tabular-nums text-ink-900">{tRec.freelancers}</p><p className="text-xs text-ink-700">pessoa(s) recorrente(s)</p></div>
              <div><p className="sgo-type-24 font-bold tabular-nums text-ink-900">{tRec.solicitacoes}</p><p className="text-xs text-ink-700">solicitações nessas semanas</p></div>
              <div><p className="sgo-type-24 font-bold tabular-nums text-ink-900">{formatBRL(tRec.valor)}</p><p className="text-xs text-ink-700">valor nessas semanas</p></div>
            </div>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="cartoes-recorrentes">
              {recorrentes.map((g, i) => (
                <li key={g.freelancerId}>
                  <button
                    type="button"
                    onClick={() => setAberto(dados.freelancers.find((f) => f.freelancerId === g.freelancerId) ?? null)}
                    className="w-full rounded-card border border-line bg-surface p-4 text-left shadow-sgo-card transition-shadow hover:border-brand hover:shadow-sgo-card-hover"
                    data-testid="cartao-recorrente"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-brand-tint text-sm font-bold text-brand" aria-hidden>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-bold text-ink-900">{g.nome}</p>
                        <p className="break-words text-xs text-ink-500">{g.unidades.map(shortUnitName).join(', ')} · {g.semanas.length} semana(s) acima do limite</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="sgo-type-17 font-bold tabular-nums text-ink-900">{formatBRL(g.valor)}</p>
                        <p className="text-xs tabular-nums text-ink-500">{g.solicitacoes} solic.</p>
                      </div>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {g.semanas.map((s) => (
                        <li key={s.de} className="rounded-pill bg-warning-bg px-3 py-1 text-xs text-ink-900">
                          <span className="font-semibold tabular-nums">{emBR(s.de).slice(0, 5)} a {emBR(s.ate).slice(0, 5)}</span>
                          <span className="text-ink-700"> · {s.solicitacoes}× · {formatBRL(s.valor)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 break-words border-t border-line pt-2 text-xs text-ink-500 print:hidden">
                      CPF {g.cpf ? formatarCpf(g.cpf) : '—'} · PIX {g.pixKey ?? '—'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── Visão por unidade ── */}
      <section className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sgo-type-11 font-semibold text-ink-900">Visão por unidade</h2>
          <SegmentedControl aria-label="Ordenar a visão por unidade" value={ordem} onValueChange={setOrdem} options={ORDENS} size="sm" />
        </div>
        <Table
          caption="Uso de freelancers por unidade"
          rows={unidades}
          getRowKey={(u) => u.unitId}
          onRowClick={(u) => navegar({ unitId: u.unitId })}
          empty={<EmptyState icon={Building2} title="Nenhum lançamento no período" description="Amplie o período ou limpe os filtros." />}
          columns={[
            { key: 'unidade', header: 'Unidade', cell: (u) => shortUnitName(u.nome) },
            { key: 'sol', header: 'Solicitações', numeric: true, width: '7rem', cell: (u) => u.solicitacoes },
            { key: 'unicos', header: 'Únicos', numeric: true, width: '6rem', hideOnMobile: true, cell: (u) => u.unicos },
            { key: 'rec', header: 'Recorrentes', numeric: true, width: '7rem', cell: (u) => (
              u.recorrentes > 0
                ? <span className="inline-flex items-center gap-1 font-semibold text-warning"><AlertTriangle className="h-3.5 w-3.5" />{u.recorrentes}</span>
                : <span className="text-ink-500">0</span>
            ) },
            { key: 'valor', header: 'Valor total', numeric: true, width: '8rem', cell: (u) => formatBRL(u.valor) },
            { key: 'pct', header: '% da rede', numeric: true, width: '6rem', hideOnMobile: true, cell: (u) => `${u.pctRede.toFixed(1).replace('.', ',')}%` },
          ]}
          footer={{
            unidade: 'TOTAL',
            sol: unidades.reduce((n, u) => n + u.solicitacoes, 0),
            valor: formatBRL(unidades.reduce((n, u) => n + u.valor, 0)),
          }}
        />
      </section>

      {/* ── Freelancers do período ── */}
      <section className="space-y-1">
        <h2 className="sgo-type-11 font-semibold text-ink-900">Freelancers no período</h2>
        <Table
          caption="Freelancers no período"
          rows={dados.freelancers}
          getRowKey={(f) => f.freelancerId}
          onRowClick={(f) => setAberto(f)}
          empty={<EmptyState icon={Users} title="Nenhum freelancer no período" description="Amplie o período ou limpe os filtros." />}
          columns={[
            { key: 'nome', header: 'Freelancer', cell: (f) => (
              <span className="flex flex-wrap items-center gap-1">
                <span className="font-semibold text-ink-900">{f.nome}</span>
                {f.recorrente && <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">Recorrente</span>}
                {f.rejeitadas > 0 && <span className="text-[10px] text-ink-500">{f.rejeitadas} rejeitada(s)</span>}
              </span>
            ) },
            { key: 'cpf', header: 'CPF', hideOnMobile: true, width: '9rem', cell: (f) => f.cpf ? formatarCpf(f.cpf) : <span className="text-ink-400">—</span> },
            { key: 'pix', header: 'Chave PIX', hideOnMobile: true, width: '10rem', cell: (f) => f.pixKey ?? <span className="text-ink-400">—</span> },
            { key: 'unidades', header: 'Unidade', hideOnMobile: true, cell: (f) => f.unidades.map(shortUnitName).join(', ') },
            { key: 'sol', header: 'Solicitações', numeric: true, width: '7rem', cell: (f) => f.solicitacoes },
            { key: 'valor', header: 'Valor total', numeric: true, width: '8rem', cell: (f) => formatBRL(f.valor) },
          ]}
          footer={{
            nome: `TOTAL · ${dados.freelancers.length} freelancer(s)`,
            sol: dados.freelancers.reduce((n, f) => n + f.solicitacoes, 0),
            valor: formatBRL(dados.freelancers.reduce((n, f) => n + f.valor, 0)),
          }}
        />
      </section>

      {/* ── Discriminativo: cada solicitação do recorte (v1.224.0) ── */}
      <details className="rounded-card border border-line bg-surface print:hidden" data-testid="discriminativo">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-ink-900">Discriminativo · {dados.linhas.length} lançamento(s) do recorte</summary>
        <Table
          caption="Lançamentos do recorte"
          rows={dados.linhas}
          getRowKey={(l) => l.id}
          columns={[
            { key: 'data', header: 'Data', width: '6rem', cell: (l) => emBR(l.data) },
            { key: 'unidade', header: 'Unidade', cell: (l) => shortUnitName(l.unidade) },
            { key: 'pessoa', header: 'Pessoa', cell: (l) => (
              <span className="flex flex-wrap items-center gap-1">
                <span className="font-semibold text-ink-900">{l.pessoa}</span>
                {l.recorrente && <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">Recorrente</span>}
              </span>
            ) },
            { key: 'setor', header: 'Setor', hideOnMobile: true, cell: (l) => l.setor ?? <span className="text-ink-400">—</span> },
            { key: 'horario', header: 'Horário', hideOnMobile: true, width: '7rem', cell: (l) => l.horario ?? <span className="text-ink-400">—</span> },
            { key: 'status', header: 'Situação', width: '7rem', cell: (l) => <span className={l.status === 'REJECTED' ? 'font-semibold text-danger' : undefined}>{l.statusLabel}</span> },
            { key: 'valor', header: 'Valor', numeric: true, width: '7rem', cell: (l) => <span className={l.status === 'REJECTED' ? 'text-ink-500 line-through' : undefined}>{formatBRL(l.valor)}</span> },
          ]}
          footer={{ data: 'TOTAL', pessoa: `${dados.linhas.length} lançamento(s)`, valor: formatBRL(r.valorSolicitado) }}
        />
      </details>

      {aberto && <Detalhe f={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}

/** "117 solicitações | +18% em relação ao mês anterior" */
function Comparacao({ dados }: { dados: Consolidado }) {
  const { variacaoPct, solicitacoesAntes, anterior } = dados.comparacao;
  if (variacaoPct === null) {
    return <p className="mt-0.5 text-xs text-ink-500">Sem base de comparação: nenhuma solicitação em {anterior.rotulo}.</p>;
  }
  const subiu = variacaoPct > 0.5;
  const desceu = variacaoPct < -0.5;
  const Icone = subiu ? TrendingUp : desceu ? TrendingDown : Minus;
  const cor = subiu ? 'text-danger' : desceu ? 'text-success' : 'text-ink-500';
  const sinal = variacaoPct > 0 ? '+' : '';
  /* A preposição vem da natureza do período: "a agosto/2026", mas "à semana
     de…" e "ao período de…". Concordância é o tipo de detalhe que faz um
     painel parecer rascunho. */
  const referencia = anterior.tipo === 'mes'
    ? `a ${anterior.rotulo}`
    : anterior.tipo === 'semana'
      ? `à ${anterior.rotulo}`
      : `ao período de ${anterior.rotulo}`;
  return (
    <p className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${cor}`}>
      <Icone className="h-3.5 w-3.5" />
      {sinal}{variacaoPct.toFixed(0)}% em relação {referencia} ({solicitacoesAntes} solicitações)
    </p>
  );
}

/** Detalhamento: as solicitações que formam o número da linha clicada. */
function Detalhe({ f, onClose }: { f: FreelancerNoPeriodo; onClose: () => void }) {
  return (
    <Modal
      open onClose={onClose} size="lg"
      title={f.nome}
      description={`${f.solicitacoes} solicitação(ões) · ${formatBRL(f.valor)} · ${f.unidades.map(shortUnitName).join(', ')}`}
    >
      {f.recorrente && (
        <Banner
          tone="warning"
          className="mb-3"
          title="Freelancer recorrente"
          description="Passou do limite semanal de solicitações — a supervisão já foi avisada no lançamento."
        />
      )}
      <Group>
        {f.linhas.map((l) => <LinhaDetalhe key={l.id} l={l} />)}
      </Group>
    </Modal>
  );
}

function LinhaDetalhe({ l }: { l: LinhaDoConsolidado }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
      <span className="text-sm text-ink-900">
        {emBR(l.data)} · {shortUnitName(l.unidade)}
        <span className="text-ink-500"> · {l.tipoLabel}</span>
      </span>
      <span className="flex items-center gap-2">
        {/* Rejeitada continua visível, marcada: ela é histórico, não custo. */}
        <span className={l.status === 'REJECTED' ? 'text-xs font-semibold text-danger' : 'text-xs text-ink-500'}>{l.statusLabel}</span>
        <span className={l.status === 'REJECTED' ? 'text-sm text-ink-500 line-through' : 'text-sm font-semibold text-ink-900'}>{formatBRL(l.valor)}</span>
      </span>
    </div>
  );
}
