import { Activity, CalendarDays, Gauge, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { SgoBar } from '@/components/sgo/sgo-bar';
import { BarraComparada, BarrasDiarias, ColunasMensais, MiniTendencia, Variacao } from '@/components/waste/graficos';
import { shortUnitName } from '@/lib/unit-name';
import type { getPerformance } from '@/lib/waste/painel';

type Dados = Awaited<ReturnType<typeof getPerformance>>;

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mlabel = (ym: string) => `${MES_CURTO[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

/**
 * Aba PERFORMANCE do painel de desperdício (v1.152.0): o desperdício aumentou ou
 * diminuiu? Tudo comparado pela MÉDIA POR DIA LANÇADO (ver painel-calculo.ts) —
 * o total aparece, mas a seta vem da média, e a cobertura fica ao lado.
 */
export function PainelPerformance({ d }: { d: Dados }) {
  const u = d.frente === 'restaurante' ? 'kg' : 'un.';
  const casas = d.frente === 'restaurante' ? 2 : 1;
  const n = (v: number, c = casas) => v.toLocaleString('pt-BR', { maximumFractionDigits: c });
  const ant = d.month === 1 ? 12 : d.month - 1;
  const r = d.resumo;

  /* Linha de referência do gráfico diário: média por DIA com lançamento no mês
     anterior (soma das unidades naquele dia), na mesma escala das barras. */
  const diasComDadoAnt = d.serieAnterior.filter((p) => p.lancamentos > 0);
  const referencia = diasComDadoAnt.length ? diasComDadoAnt.reduce((s, p) => s + p.total, 0) / diasComDadoAnt.length : null;
  const esperados = d.porUnidade.length * r.diasDecorridos;
  const subiram = d.porUnidade.filter((l) => l.direcao === 'subiu');
  const cairam = d.porUnidade.filter((l) => l.direcao === 'caiu').sort((a, b) => (a.variacao ?? 0) - (b.variacao ?? 0));
  const maxParte = Math.max(1, ...d.partes.map((p) => Math.max(p.atual, p.anterior)));
  const maxMotivo = Math.max(1, ...d.motivos.map((p) => Math.max(p.atual, p.anterior)));
  const maxSemana = Math.max(1, ...d.diaDaSemana.map((s) => s.media));

  const veredito = r.direcao === 'subiu' ? 'Aumentou' : r.direcao === 'caiu' ? 'Diminuiu' : r.direcao === 'estavel' ? 'Estável' : 'Sem base';

  return (
    <div className="space-y-4" data-testid="painel-performance">
      <SgoKpis>
        <SgoKpi label={`Média por dia lançado (${u})`} value={n(r.atual.media)} icon={Gauge} tone="blue"
          meta={<>{MESES[ant - 1]}: {n(r.anterior.media)} {u}</>} />
        <SgoKpi label={`Em relação a ${MESES[ant - 1]}`} value={veredito} icon={r.direcao === 'caiu' ? TrendingDown : TrendingUp}
          tone={r.direcao === 'subiu' ? 'red' : r.direcao === 'caiu' ? 'green' : 'gray'}
          meta={<Variacao v={r.variacao} d={r.direcao} />} testId="kpi-veredito" />
        <SgoKpi label={`Total do mês (${u})`} value={n(r.atual.total)} icon={Scale} tone="gray"
          meta={<>até o dia {r.diasDecorridos}: {MESES[ant - 1]} tinha {n(r.anteriorAteHoje.total)}</>} />
        <SgoKpi label="Cobertura (lançamentos)" value={`${r.atual.lancamentos}/${esperados || 0}`} icon={CalendarDays}
          tone={esperados && r.atual.lancamentos / esperados < 0.8 ? 'amber' : 'green'}
          meta={<>{esperados ? Math.round((r.atual.lancamentos / esperados) * 100) : 0}% dos dias × unidades</>} />
      </SgoKpis>

      <Card>
        <PanelHeader title={`Por dia — ${MESES[d.month - 1]} (${u})`} icon={<Activity className="h-4 w-4 text-brand" />} />
        <CardContent className="pt-3">
          <BarrasDiarias pontos={d.serie} referencia={referencia} unidade={u} rotuloReferencia={`média/dia de ${MESES[ant - 1]}`} />
          <p className="mt-1 text-xs text-ink-500">Barra = soma do dia nas unidades filtradas. Traço no pé = dia sem lançamento (falta de dado, não zero). Linha tracejada = média por dia de {MESES[ant - 1]}.</p>
        </CardContent>
      </Card>

      <Card>
        <PanelHeader title={`Tendência — últimos ${d.tendencia.length} meses (média por dia lançado, ${u})`} />
        <CardContent className="pt-3">
          <ColunasMensais unidade={d.frente === 'restaurante' ? 'kg' : 'un'}
            pontos={d.tendencia.map((t, i) => ({ rotulo: mlabel(t.ym), valor: t.media, destaque: i === d.tendencia.length - 1, nota: t.lancamentos ? `${n(t.total, 0)} ${u} · ${t.lancamentos} lanç.` : 'sem lançamento' }))} />
        </CardContent>
      </Card>

      {d.porUnidade.length > 1 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <PanelHeader title={<span className="text-danger">Aumentaram</span>} icon={<TrendingUp className="h-4 w-4 text-danger" />} count={subiram.length} countTone="red" />
            <CardContent className="pt-2">
              {subiram.length === 0 ? <p className="text-sm text-ink-500">Nenhuma unidade aumentou a média.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {subiram.map((l) => (
                    <li key={l.unitId} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="text-ink-900">{shortUnitName(l.unitName)}</span>
                      <span className="tabular-nums text-ink-700">{n(l.anterior.media)} → {n(l.atual.media)} {u}/dia &nbsp;<Variacao v={l.variacao} d={l.direcao} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <PanelHeader title={<span className="text-success">Diminuíram</span>} icon={<TrendingDown className="h-4 w-4 text-success" />} count={cairam.length} />
            <CardContent className="pt-2">
              {cairam.length === 0 ? <p className="text-sm text-ink-500">Nenhuma unidade diminuiu a média.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {cairam.map((l) => (
                    <li key={l.unitId} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="text-ink-900">{shortUnitName(l.unitName)}</span>
                      <span className="tabular-nums text-ink-700">{n(l.anterior.media)} → {n(l.atual.media)} {u}/dia &nbsp;<Variacao v={l.variacao} d={l.direcao} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {d.porUnidade.length > 1 && (
        <div className="sgo-panel overflow-hidden">
          <PanelHeader title="Comparativo por unidade" count={d.porUnidade.length} />
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm" data-testid="performance-por-unidade">
              <thead>
                <tr>
                  <th className="text-left">Unidade</th>
                  <th className="text-right">Média/dia ({MES_CURTO[d.month - 1]})</th>
                  <th className="text-right">Média/dia ({MES_CURTO[ant - 1]})</th>
                  <th className="text-right">Variação</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Dias lançados</th>
                  <th className="text-left">6 meses</th>
                </tr>
              </thead>
              <tbody>
                {d.porUnidade.map((l) => (
                  <tr key={l.unitId}>
                    <td className="font-medium text-ink-900">{shortUnitName(l.unitName)}</td>
                    <td className="text-right font-semibold tabular-nums">{l.atual.lancamentos ? n(l.atual.media) : '—'}</td>
                    <td className="text-right tabular-nums text-ink-700">{l.anterior.lancamentos ? n(l.anterior.media) : '—'}</td>
                    <td className="text-right"><Variacao v={l.variacao} d={l.direcao} /></td>
                    <td className="text-right tabular-nums">{n(l.atual.total)}</td>
                    <td className="text-right tabular-nums text-ink-700">{l.atual.lancamentos}/{r.diasDecorridos}</td>
                    <td><MiniTendencia valores={(d.tendenciaPorUnidade[l.unitId] ?? []).map((t) => t.media)} titulo={(d.tendenciaPorUnidade[l.unitId] ?? []).map((t) => `${mlabel(t.ym)}: ${n(t.media)}`).join(' · ')} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <PanelHeader title={d.frente === 'restaurante' ? 'Por tipo de sobra' : 'Por tipo de salgado'} count={d.partes.length} />
          <CardContent className="pt-2">
            {d.partes.length === 0 ? <p className="text-sm text-ink-500">Sem lançamentos no período.</p> : (
              <ul className="space-y-2.5" data-testid="performance-por-tipo">
                {d.partes.slice(0, 12).map((p) => (
                  <li key={p.chave}>
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-ink-900">{p.nome}</span>
                      <span className="shrink-0 tabular-nums text-ink-700">{n(p.atual)} {u} · {n(p.participacao, 0)}% &nbsp;<Variacao v={p.variacao} d={p.direcao} /></span>
                    </div>
                    <BarraComparada atual={p.atual} anterior={p.anterior} max={maxParte} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink-500">Barra grossa = {MESES[d.month - 1]}; fina = {MESES[ant - 1]}. A variação é por dia lançado.</p>
          </CardContent>
        </Card>

        {d.frente === 'salgados' ? (
          <Card>
            <PanelHeader title="Por motivo" count={d.motivos.length} />
            <CardContent className="pt-2">
              {d.motivos.length === 0 ? <p className="text-sm text-ink-500">Sem lançamentos no período.</p> : (
                <ul className="space-y-2.5">
                  {d.motivos.map((p) => (
                    <li key={p.chave}>
                      <div className="mb-0.5 flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-ink-900">{p.nome}</span>
                        <span className="shrink-0 tabular-nums text-ink-700">{n(p.atual)} {u} · {n(p.participacao, 0)}% &nbsp;<Variacao v={p.variacao} d={p.direcao} /></span>
                      </div>
                      <BarraComparada atual={p.atual} anterior={p.anterior} max={maxMotivo} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <PanelHeader title="Por turno" />
            <CardContent className="pt-2">
              <ul className="space-y-3">
                {d.turnos.map((t) => (
                  <li key={t.turno}>
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-sm">
                      <span className="text-ink-900">{t.turno}</span>
                      <span className="tabular-nums text-ink-700">{n(t.atual)} {u} &nbsp;<Variacao v={t.variacao} d={t.direcao} /></span>
                    </div>
                    <BarraComparada atual={t.atual} anterior={t.anterior} max={Math.max(1, ...d.turnos.map((x) => Math.max(x.atual, x.anterior)))} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <PanelHeader title={`Por dia da semana — média por lançamento (${u})`} />
        <CardContent className="pt-2">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-7">
            {d.diaDaSemana.map((s) => (
              <li key={s.dia} className="space-y-1">
                <div className="flex justify-between text-xs sm:flex-col sm:items-start"><span className="font-semibold text-ink-900">{s.dia}</span><span className="tabular-nums text-ink-700">{s.lancamentos ? `${n(s.media)} ${u}` : '—'}</span></div>
                <SgoBar value={(s.media / maxSemana) * 100} tone="blue" height={8} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-500">Mostra em que dia da semana se desperdiça mais, para ajustar produção e escala.</p>
        </CardContent>
      </Card>
    </div>
  );
}
