'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, TrendingUp, TrendingDown, Minus, AlertTriangle, Building2 } from 'lucide-react';
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
import {
  PERIODO_LABEL, TIPO_LABEL, STATUS_LABEL, emBR,
  type Consolidado, type FiltroConsolidado, type FreelancerNoPeriodo,
  type LinhaDoConsolidado, type PeriodoKey, type RecorrenciaFiltro, type StatusFiltro, type TipoFiltro,
} from '@/lib/payments/consolidado-tipos';

interface Unit { id: string; name: string }

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
    const f = { ...filtro, ...mudanca };
    const q = new URLSearchParams({ aba: 'consolidado', periodo: f.periodo, tipo: f.tipo, status: f.status, rec: f.recorrencia });
    if (f.unitId) q.set('unidade', f.unitId);
    if (f.periodo === 'personalizado') {
      if (f.de) q.set('de', f.de);
      if (f.ate) q.set('ate', f.ate);
    }
    router.push(`/modulos/pagamentos/relatorio-freelancers?${q.toString()}`);
  }

  const ativos = (filtro.unitId ? 1 : 0) + (filtro.tipo !== 'TODOS' ? 1 : 0) + (filtro.status !== 'TODOS' ? 1 : 0) + (filtro.recorrencia !== 'todos' ? 1 : 0);
  const r = dados.resumo;

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

      {/* ── Indicadores ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="solicitações" value={String(r.solicitacoes)} />
        <StatCard label="freelancers únicos" value={String(r.freelancersUnicos)} />
        <StatCard label="recorrentes" value={String(r.recorrentes)} tone={r.recorrentes > 0 ? 'warning' : undefined} />
        <StatCard label="valor solicitado" value={formatBRL(r.valorSolicitado)} />
        <StatCard label="aprovado / pago" value={formatBRL(r.valorAprovadoPago)} />
        <StatCard label="média por unidade" value={r.mediaPorUnidade.toFixed(1).replace('.', ',')} />
      </div>

      {/* Rejeitadas ficam À PARTE do valor solicitado: somá-las inflaria o custo
          com dinheiro que não vai sair. Some do histórico, não. */}
      {r.rejeitadasCount > 0 && (
        <p className="text-xs text-ink-500">
          Fora dos valores acima: <b className="text-ink-900">{r.rejeitadasCount}</b> solicitação(ões) rejeitada(s), {formatBRL(r.rejeitadasValor)} — permanecem no histórico.
        </p>
      )}

      {/* ── Evolução ── */}
      {dados.evolucao.pontos.length > 1 && (
        <section>
          <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">
            Solicitações por {dados.evolucao.granularidade === 'semana' ? 'semana' : 'mês'}
          </h2>
          <div className="flex items-end gap-2 rounded-card border border-line bg-surface p-3" style={{ height: 150 }}>
            {dados.evolucao.pontos.map((p) => (
              <div key={p.chave} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold text-ink-900">{p.solicitacoes}</span>
                <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(4, (p.solicitacoes / maxEvolucao) * 95)}px` }} />
                <span className="text-[10px] text-ink-500">{p.rotulo}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Freelancers recorrentes ── */}
      <section className="space-y-1">
        <h2 className="sgo-type-11 font-semibold text-ink-900">Freelancers recorrentes</h2>
        <p className="text-xs text-ink-500">
          Mais de {dados.limiteSemanal} solicitações do mesmo freelancer numa semana (segunda a domingo) — a mesma regra que avisa a supervisão ao lançar.
          A contagem considera todas as unidades que você enxerga, mesmo com o filtro de unidade ligado: o freelancer é o mesmo em qualquer uma.
        </p>
        {dados.recorrentesNaSemana.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum freelancer recorrente no período" description="Ninguém passou do limite semanal." size="sm" />
        ) : (
          <Table
            caption="Freelancers recorrentes na semana"
            rows={dados.recorrentesNaSemana}
            getRowKey={(g) => g.chave}
            onRowClick={(g) => setAberto(dados.freelancers.find((f) => f.freelancerId === g.freelancerId) ?? null)}
            columns={[
              { key: 'nome', header: 'Freelancer', cell: (g) => (
                <span className="flex flex-wrap items-center gap-1">
                  <span className="font-semibold text-ink-900">{g.nome}</span>
                  <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">Recorrente</span>
                </span>
              ) },
              { key: 'unidade', header: 'Unidade', cell: (g) => g.unidades.map(shortUnitName).join(', ') },
              { key: 'semana', header: 'Semana', hideOnMobile: true, width: '10rem', cell: (g) => `${emBR(g.semanaDe).slice(0, 5)} a ${emBR(g.semanaAte).slice(0, 5)}` },
              { key: 'qtd', header: 'Solicitações na semana', numeric: true, width: '8rem', cell: (g) => g.solicitacoes },
              { key: 'valor', header: 'Valor total', numeric: true, width: '8rem', cell: (g) => formatBRL(g.valor) },
            ]}
          />
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
                {/* Sem isto, quem teve a única solicitação rejeitada aparecia
                    como "1 solicitação · R$ 0,00" e parecia defeito. */}
                {f.rejeitadas > 0 && <span className="text-[10px] text-ink-500">{f.rejeitadas} rejeitada(s)</span>}
              </span>
            ) },
            { key: 'unidades', header: 'Unidade', hideOnMobile: true, cell: (f) => f.unidades.map(shortUnitName).join(', ') },
            { key: 'sol', header: 'Solicitações', numeric: true, width: '7rem', cell: (f) => f.solicitacoes },
            { key: 'valor', header: 'Valor total', numeric: true, width: '8rem', cell: (f) => formatBRL(f.valor) },
          ]}
        />
      </section>

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
