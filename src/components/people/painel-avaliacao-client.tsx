'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Printer, Users, Star, Percent, AlertTriangle, ClipboardList, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Select } from '@/components/ui/ds/select';
import { SearchField } from '@/components/ui/ds/field';
import { Table } from '@/components/ui/ds/table';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { SgoBar } from '@/components/sgo/sgo-bar';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { shortUnitName } from '@/lib/unit-name';
import { fmtNota, ROTULO_CLASSIFICACAO } from '@/lib/people/avaliacao-calculo';
import { fmtMes, pct, queryDoFiltroPainel, ROTULO_PLANO, type FiltroPainel, type Painel, type SituacaoPlano } from '@/lib/people/avaliacao-painel-calculo';

const TOM_PLANO: Record<SituacaoPlano, StatusTone> = { PENDING: 'medium', IN_PROGRESS: 'neutral', DONE: 'success', VENCIDO: 'critical' };
const br = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const nomeMes = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }); };

/**
 * Painel gerencial da avaliação (v1.162.0): filtros na URL (período em meses,
 * unidade, função, colaborador), indicadores, por unidade, por função,
 * evolução mensal, abaixo do esperado, critérios com mais dificuldade e os
 * planos de desenvolvimento. Excel e PDF usam o MESMO filtro.
 */
export function PainelAvaliacaoClient({ painel, filtro, unidades, funcoes, meses }: {
  painel: Painel; filtro: FiltroPainel; unidades: { id: string; name: string }[]; funcoes: string[]; meses: string[];
}) {
  const router = useRouter();
  const [f, setF] = useState<FiltroPainel>(filtro);
  const [busca, setBusca] = useState(filtro.colaborador ?? '');
  const aplicar = (n: Partial<FiltroPainel>) => {
    const next = { ...f, ...n };
    setF(next);
    router.push(`/modulos/pessoas/avaliacao?aba=painel&${queryDoFiltroPainel(next)}`);
  };
  const q = queryDoFiltroPainel(filtro);
  const p = painel;

  return (
    <div className="space-y-4">
      <div className="sgo-filtros -mx-4 flex flex-wrap items-end gap-2 print:hidden">
        <div className="w-40"><Select label="De" size="sm" className="capitalize" value={f.de} onValueChange={(v) => aplicar({ de: v })} options={meses.map((m) => ({ value: m, label: nomeMes(m) }))} /></div>
        <div className="w-40"><Select label="Até" size="sm" className="capitalize" value={f.ate} onValueChange={(v) => aplicar({ ate: v })} options={meses.map((m) => ({ value: m, label: nomeMes(m) }))} /></div>
        {unidades.length > 1 && (
          <div className="w-52"><Select label="Unidade" size="sm" value={f.unitId ?? 'todas'} onValueChange={(v) => aplicar({ unitId: v === 'todas' ? null : v })} options={[{ value: 'todas', label: 'Todas as unidades' }, ...unidades.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]} /></div>
        )}
        <div className="w-52"><Select label="Função" size="sm" value={f.funcao ?? 'todas'} onValueChange={(v) => aplicar({ funcao: v === 'todas' ? null : v })} options={[{ value: 'todas', label: 'Todas as funções' }, ...funcoes.map((x) => ({ value: x, label: x }))]} /></div>
        <div className="w-52">
          <SearchField label="Colaborador" inputSize="sm" value={busca} onValueChange={setBusca} placeholder="Nome…" onKeyDown={(e) => { if (e.key === 'Enter') aplicar({ colaborador: busca.trim() || null }); }} />
        </div>
        <Button size="sm" variant="secondary" onClick={() => aplicar({ colaborador: busca.trim() || null })}>Aplicar</Button>
        <span className="ml-auto flex gap-1.5">
          <a className="sgo-btn sgo-btn--sm" href={`/api/people/evaluation/painel/export?${q}`}><FileSpreadsheet className="h-4 w-4" /> Excel</a>
          <a className="sgo-btn sgo-btn--sm" href={`/modulos/pessoas/avaliacao/relatorio?${q}&imprimir=1`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" /> PDF</a>
        </span>
      </div>

      <SgoKpis>
        <SgoKpi label="Avaliações no período" value={p.resumo.avaliacoes} meta={`${p.resumo.colaboradores} colaborador(es)`} icon={Users} tone="blue" testId="kpi-avaliacoes" />
        <SgoKpi label="Média geral" value={fmtNota(p.resumo.media)} meta="1,00 a 5,00" icon={Star} tone="blue" testId="kpi-media" />
        <SgoKpi label="Cobertura" value={pct(p.resumo.cobertura)} meta="avaliações ÷ (ativos × meses)" icon={Percent} tone="green" testId="kpi-cobertura" />
        <SgoKpi label="Abaixo do esperado" value={p.resumo.abaixo} meta="última nota < 2,50" icon={AlertTriangle} tone={p.resumo.abaixo ? 'red' : 'green'} testId="kpi-abaixo" />
        <SgoKpi label="Planos abertos" value={p.planos.pendentes + p.planos.emAndamento} meta={`${p.planos.vencidos} vencido(s) · ${p.planos.concluidos} concluído(s)`} metaTone={p.planos.vencidos ? 'warn' : undefined} icon={ClipboardList} tone="amber" testId="kpi-planos" />
        <SgoKpi label="Revisões abertas" value={p.resumo.revisoesAbertas} icon={MessageSquareWarning} tone={p.resumo.revisoesAbertas ? 'amber' : 'green'} testId="kpi-revisoes" />
      </SgoKpis>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Classificação das avaliações" />
          <CardContent>
            <div className="space-y-2">
              {p.classificacoes.map((c) => (
                <div key={c.classificacao} className="flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0">{c.rotulo}</span>
                  <SgoBar value={p.resumo.avaliacoes ? (c.qtd / p.resumo.avaliacoes) * 100 : 0} tone={c.classificacao === 'MELHORAR' ? 'red' : c.classificacao === 'REGULAR' ? 'amber' : 'green'} className="flex-1" />
                  <span className="w-8 text-right tabular-nums">{c.qtd}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <PanelHeader title="Evolução mensal da média" />
          <CardContent>
            <div className="space-y-2">
              {p.evolucao.map((e) => (
                <div key={e.yearMonth} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0 tabular-nums">{fmtMes(e.yearMonth)}</span>
                  <SgoBar value={e.media != null ? ((e.media - 1) / 4) * 100 : 0} tone={e.media == null ? 'neutral' : e.media < 2.5 ? 'red' : e.media < 3.5 ? 'amber' : 'green'} className="flex-1" />
                  <span className="w-12 text-right tabular-nums">{fmtNota(e.media)}</span>
                  <span className="w-14 text-right text-xs text-ink-500">{e.avaliacoes} aval.</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <PanelHeader title="Por unidade" />
        <Table
          caption="Desempenho por unidade"
          rows={p.porUnidade} getRowKey={(r) => r.unitId}
          columns={[
            { key: 'u', header: 'Unidade', cell: (r) => shortUnitName(r.unitName), wrap: true },
            { key: 'a', header: 'Ativos', numeric: true, cell: (r) => r.ativos },
            { key: 'n', header: 'Avaliações', numeric: true, cell: (r) => r.avaliacoes },
            { key: 'c', header: 'Cobertura', numeric: true, cell: (r) => pct(r.cobertura) },
            { key: 'm', header: 'Média', numeric: true, cell: (r) => fmtNota(r.media) },
            { key: 'b', header: 'Abaixo do esperado', numeric: true, cell: (r) => (r.abaixo ? <StatusBadge tone="critical">{r.abaixo}</StatusBadge> : 0) },
          ]}
          empty="Nenhuma unidade no seu alcance."
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Por função" />
          <Table
            caption="Desempenho por função"
            rows={p.porFuncao} getRowKey={(r) => r.funcao}
            columns={[
              { key: 'f', header: 'Função', cell: (r) => r.funcao, wrap: true },
              { key: 'n', header: 'Aval.', numeric: true, cell: (r) => r.avaliacoes },
              { key: 'p', header: 'Pessoas', numeric: true, cell: (r) => r.colaboradores },
              { key: 'm', header: 'Média', numeric: true, cell: (r) => fmtNota(r.media) },
              { key: 'b', header: 'Abaixo', numeric: true, cell: (r) => r.abaixo },
            ]}
            empty="Sem avaliações no período."
          />
        </Card>
        <Card>
          <PanelHeader title="Critérios com maior dificuldade" />
          <Table
            caption="Média por critério, menores primeiro"
            rows={p.criterios.slice(0, 10)} getRowKey={(r) => r.key}
            columns={[
              { key: 'c', header: 'Critério', cell: (r) => r.label, wrap: true },
              { key: 'm', header: 'Média', numeric: true, cell: (r) => fmtNota(r.media) },
              { key: 'n', header: 'Respostas', numeric: true, cell: (r) => r.respostas },
              { key: 'b', header: 'Notas 1–2', numeric: true, cell: (r) => r.abaixo },
            ]}
            empty="Sem avaliações no formato por função no período."
          />
        </Card>
      </div>

      <Card>
        <PanelHeader title="Colaboradores abaixo do esperado" />
        <p className="px-4 pb-2 text-xs text-ink-500">A última avaliação de cada um no período, com nota abaixo de 2,50.</p>
        <Table
          caption="Abaixo do esperado"
          rows={p.abaixoDoEsperado} getRowKey={(r) => r.collaboratorId}
          columns={[
            { key: 'c', header: 'Colaborador', cell: (r) => r.collaboratorName, wrap: true },
            { key: 'u', header: 'Unidade', cell: (r) => shortUnitName(r.unitName), hideOnMobile: true },
            { key: 'f', header: 'Função', cell: (r) => r.funcao, hideOnMobile: true },
            { key: 'm', header: 'Mês', cell: (r) => fmtMes(r.yearMonth) },
            { key: 'n', header: 'Nota', numeric: true, cell: (r) => <StatusBadge tone="critical">{fmtNota(r.nota)}</StatusBadge> },
            { key: 'p', header: 'Planos abertos', numeric: true, cell: (r) => (r.planosAbertos ? r.planosAbertos : <span className="text-warning">nenhum</span>) },
          ]}
          empty="Ninguém abaixo do esperado no período. 🎉"
        />
      </Card>

      <Card>
        <PanelHeader title="Planos de desenvolvimento" count={p.planos.vencidos || undefined} countTone="red" />
        <p className="px-4 pb-2 text-xs text-ink-500">{p.planos.pendentes} pendente(s) · {p.planos.emAndamento} em andamento · {p.planos.vencidos} vencido(s) · {p.planos.concluidos} concluído(s)</p>
        <Table
          caption="Planos de desenvolvimento"
          rows={p.planos.lista} getRowKey={(r) => r.id}
          columns={[
            { key: 'c', header: 'Colaborador', cell: (r) => r.collaboratorName, wrap: true },
            { key: 'u', header: 'Unidade', cell: (r) => shortUnitName(r.unitName), hideOnMobile: true },
            { key: 'k', header: 'Critério', cell: (r) => r.criterionLabel, wrap: true },
            { key: 'a', header: 'Ação', cell: (r) => r.action, wrap: true, hideOnMobile: true },
            { key: 'r', header: 'Responsável', cell: (r) => r.responsibleName, hideOnMobile: true },
            { key: 'd', header: 'Prazo', cell: (r) => br(r.dueDate) },
            { key: 's', header: 'Situação', cell: (r) => <StatusBadge tone={TOM_PLANO[r.situacao]}>{ROTULO_PLANO[r.situacao]}</StatusBadge> },
          ]}
          empty="Nenhum plano no período."
        />
      </Card>
      <p className="text-xs text-ink-500">Classificação: {Object.values(ROTULO_CLASSIFICACAO).join(' · ')}. Média geral e por unidade são médias simples das notas finais congeladas em cada avaliação.</p>
    </div>
  );
}
