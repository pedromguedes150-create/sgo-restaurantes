import Link from 'next/link';
import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { LeituraExecutiva, BarrasDeParticipacao } from '@/components/shared/leitura-executiva';
import { shortUnitName } from '@/lib/unit-name';
import type { AnaliseSalgados, Matriz } from '@/lib/waste/salgados-executivo';

const un = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const p1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function TabelaDaMatriz({ m, primeira, rotulo, total }: { m: Matriz; primeira: string; rotulo: (s: string) => string; total: string }) {
  if (m.linhas.length === 0) return <p className="px-4 pb-4 text-sm text-ink-500">Sem lançamentos no mês.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="sgo-tbl w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">{primeira}</th>
            {m.colunas.map((c) => <th key={c} className="text-right">{c}</th>)}
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {m.linhas.map((l) => (
            <tr key={l.rotulo}>
              <td className="whitespace-normal font-semibold text-ink-900">{rotulo(l.rotulo)}</td>
              {l.valores.map((v, i) => <td key={m.colunas[i]} className={`text-right tabular-nums ${v === 0 ? 'text-ink-400' : 'text-ink-900'}`}>{v === 0 ? '—' : un(v)}</td>)}
              <td className="text-right font-bold tabular-nums text-ink-900">{un(l.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="text-left font-bold text-ink-900">{total}</th>
            {m.totais.map((v, i) => <td key={m.colunas[i]} className="text-right font-bold tabular-nums text-ink-900">{un(v)}</td>)}
            <td className="text-right font-bold tabular-nums text-ink-900">{un(m.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * RESUMO EXECUTIVO das Sobras Lanchonete (v1.224.0): leitura do mês, números,
 * participação por tipo e motivo, o quadro por unidade e os dois cruzamentos
 * (o discriminativo). Só apresentação: a conta é de `analisarSalgados`.
 */
export function ResumoSalgados({ a, mes, anterior, evolucao, acoes, rodape }: {
  a: AnaliseSalgados;
  mes: string;
  anterior: string;
  evolucao: ReactNode;
  acoes: ReactNode;
  rodape: ReactNode;
}) {
  const semLancamento = a.porUnidade.filter((u) => u.dias === 0);
  const subiu = (a.variacaoDaMedia ?? 0) > 0;
  const estavel = a.variacaoDaMedia !== null && Math.abs(a.variacaoDaMedia) < 5;
  return (
    <div className="space-y-4" data-testid="resumo-salgados">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500">Relatório executivo de <b className="capitalize text-ink-900">{mes}</b> · unidades de salgado (não se soma com o kg do restaurante).</p>
        {acoes}
      </div>

      <LeituraExecutiva titulo="Leitura do mês" frases={a.leituras} />

      <SgoKpis>
        <SgoKpi label="Total descartado" value={`${un(a.total)} un.`} meta={`${a.diasLancados} dia(s) lançado(s)`} testId="kpi-total" />
        <SgoKpi label="Média por dia lançado" value={a.mediaPorDia === null ? '—' : `${un(a.mediaPorDia)} un.`} meta={a.anterior.mediaPorDia === null ? `sem base em ${anterior}` : `${anterior}: ${un(a.anterior.mediaPorDia)} un./dia`} testId="kpi-media" />
        <SgoKpi
          label="Variação da média/dia"
          value={a.variacaoDaMedia === null ? '—' : estavel ? 'Estável' : `${subiu ? '▲' : '▼'} ${p1(Math.abs(a.variacaoDaMedia))}%`}
          valueColor={a.variacaoDaMedia === null || estavel ? undefined : subiu ? 'var(--sgo-bad)' : 'var(--sgo-ok)'}
          meta={a.variacaoDoTotal === null ? 'sem base de comparação' : `total: ${a.variacaoDoTotal > 0 ? '+' : ''}${p1(a.variacaoDoTotal)}% (${un(a.anterior.total)} → ${un(a.total)})`}
          testId="kpi-variacao"
        />
        <SgoKpi label="Unidades que lançaram" value={`${a.unidadesQueLancaram} de ${a.unidadesNoEscopo}`} valueColor={a.unidadesQueLancaram < a.unidadesNoEscopo ? 'var(--sgo-warn)' : undefined} meta={a.unidadesQueLancaram < a.unidadesNoEscopo ? `${a.unidadesNoEscopo - a.unidadesQueLancaram} sem registro` : 'todas com registro'} testId="kpi-cobertura" />
      </SgoKpis>

      {a.baseFraca && (
        <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg p-2 text-sm text-warning" data-testid="aviso-base-fraca">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>O total não é comparável com {anterior}:</b> lá foram {a.anterior.diasLancados} dia(s) lançado(s), agora {a.diasLancados}. Leia a variação pela média por dia lançado.</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BarrasDeParticipacao testId="barras-tipos" titulo={`Por tipo de salgado · ${a.porTipo.length}`} itens={a.porTipo.map((t) => ({ rotulo: t.name, valor: `${un(t.qty)} un.`, pct: t.pct }))} vazio="Sem lançamentos no mês." />
        <div className="space-y-3">
          <BarrasDeParticipacao testId="barras-motivos" titulo="Por motivo" itens={a.porMotivo.map((m) => ({ rotulo: m.name, valor: `${un(m.qty)} un.`, pct: m.pct }))} vazio="Sem lançamentos no mês." />
          <BarrasDeParticipacao testId="barras-unidades" titulo="Participação por unidade" itens={a.porUnidade.filter((u) => u.total > 0).map((u) => ({ rotulo: shortUnitName(u.unitName), valor: `${un(u.total)} un.`, pct: u.pct, apoio: `${u.dias} dia(s)` }))} vazio="Sem lançamentos no mês." />
        </div>
      </div>

      {evolucao}

      {semLancamento.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg p-2 text-sm text-warning print:hidden">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>Sem nenhum lançamento de salgados em {mes}:</b> {semLancamento.map((l) => shortUnitName(l.unitName)).join(', ')}. Zero aqui significa que ninguém lançou — não que não houve descarte.</span>
        </p>
      )}

      <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="tabela-unidades">
        <p className="sgo-panel__title px-4 pt-3">Por unidade</p>
        <div className="overflow-x-auto">
          <table className="sgo-tbl w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Unidade</th>
                <th className="text-right">Total (un.)</th>
                <th className="text-right">% da rede</th>
                <th className="text-right">Dias lançados</th>
                <th className="text-right">Média/dia lançado</th>
                <th className="text-left">Tipo mais descartado</th>
                <th className="text-left">Motivo mais recorrente</th>
              </tr>
            </thead>
            <tbody>
              {a.porUnidade.map((u) => (
                <tr key={u.unitId}>
                  <td className="font-semibold text-ink-900">{shortUnitName(u.unitName)}</td>
                  <td className="text-right font-bold tabular-nums text-ink-900">{un(u.total)}</td>
                  <td className="text-right tabular-nums">{u.total ? `${p1(u.pct)}%` : '—'}</td>
                  <td className={`text-right tabular-nums ${u.dias === 0 ? 'font-semibold text-warning' : ''}`}>{u.dias}</td>
                  <td className="text-right tabular-nums">{u.media === null ? '—' : un(u.media)}</td>
                  <td className="whitespace-normal">{u.topTipo ? `${u.topTipo.name} (${un(u.topTipo.qty)})` : '—'}</td>
                  <td className="whitespace-normal">{u.topMotivo ? `${u.topMotivo.name} (${un(u.topMotivo.qty)} · ${p1(u.topMotivo.pct)}%)` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="text-left font-bold text-ink-900">Rede</th>
                <td className="text-right font-bold tabular-nums text-ink-900">{un(a.total)}</td>
                <td className="text-right tabular-nums">{a.total ? '100%' : '—'}</td>
                <td className="text-right tabular-nums">{a.diasLancados}</td>
                <td className="text-right tabular-nums">{a.mediaPorDia === null ? '—' : un(a.mediaPorDia)}</td>
                <td className="whitespace-normal">{a.porTipo[0] ? `${a.porTipo[0].name} (${un(a.porTipo[0].qty)})` : '—'}</td>
                <td className="whitespace-normal">{a.porMotivo[0] ? `${a.porMotivo[0].name} (${un(a.porMotivo[0].qty)})` : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="px-4 pb-3 pt-2 text-xs text-ink-500">Média/dia lançado = total ÷ dias em que a unidade lançou. Poucos dias com número alto costuma ser lançamento acumulado.</p>
      </section>

      <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="matriz-unidade-motivo">
        <p className="sgo-panel__title px-4 pt-3">Discriminativo · Unidade × Motivo (un.)</p>
        <TabelaDaMatriz m={a.unidadeXMotivo} primeira="Unidade" rotulo={shortUnitName} total="Rede" />
      </section>

      <details className="sgo-panel sgo-panel--solid overflow-hidden print:hidden" data-testid="matriz-tipo-motivo">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-ink-900">Discriminativo · Tipo de salgado × Motivo ({a.tipoXMotivo.linhas.length} tipos)</summary>
        <TabelaDaMatriz m={a.tipoXMotivo} primeira="Tipo de salgado" rotulo={(s) => s} total="Total" />
      </details>

      {rodape}
    </div>
  );
}

/** O rodapé padrão: onde está cada lançamento e onde ver a tendência. */
export function RodapeDoResumo({ conferencia, performance }: { conferencia: string; performance: string }) {
  return (
    <p className="text-xs text-ink-500 print:hidden">
      Cada linha lançada (dia, tipo, motivo, quem lançou) vai na aba <b>LANÇAMENTOS</b> do Excel. Para ver as fotos, abra <Link className="font-semibold text-brand underline" href={conferencia}>Conferência</Link>; para a tendência dia a dia, <Link className="font-semibold text-brand underline" href={performance}>Performance</Link>.
    </p>
  );
}
