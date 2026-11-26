import { Activity, CalendarDays, Flame, Gauge, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
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
  const corDoVeredito = r.direcao === 'subiu' ? 'bg-danger-bg text-danger' : r.direcao === 'caiu' ? 'bg-success-bg text-success' : 'bg-sunken text-ink-700';
  const cobertura = esperados ? r.atual.lancamentos / esperados : 0;
  const comDado = d.serie.filter((p) => p.lancamentos > 0);
  const diasComDado = comDado.length;
  const pico = comDado.length ? comDado.reduce((m, p) => (p.total > m.total ? p : m), comDado[0]) : null;
  const maxMedia = Math.max(1, r.atual.media, r.anterior.media);

  return (
    <div className="space-y-4" data-testid="painel-performance">
      {/* v1.225.0 — o veredito em destaque: um número grande, a seta e a comparação lado a lado. */}
      <section className="sgo-panel sgo-panel--solid grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" data-testid="hero-performance">
        <div className="min-w-0">
          <p className="sgo-type-11 font-semibold text-ink-500">Média por dia lançado</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="sgo-type-24 font-bold tabular-nums text-ink-900">{n(r.atual.media)}</span>
            <span className="sgo-type-17 font-semibold text-ink-500">{u}</span>
          </p>
          <p className={`mt-2 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-bold ${corDoVeredito}`} data-testid="kpi-veredito">
            {r.direcao === 'caiu' ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {veredito}{r.variacao !== null && r.direcao !== 'sem-base' ? ` · ${r.direcao === 'subiu' ? '▲' : r.direcao === 'caiu' ? '▼' : ''} ${n(Math.abs(r.variacao), 1)}%` : ''}
          </p>
          <div className="mt-4 space-y-2">
            {[{ rotulo: MESES[d.month - 1], valor: r.atual.media, forte: true }, { rotulo: MESES[ant - 1], valor: r.anterior.media, forte: false }].map((b) => (
              <div key={b.rotulo} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
                <span className="truncate truncate-sempre text-xs font-semibold capitalize text-ink-700">{b.rotulo}</span>
                <span className="h-3 overflow-hidden rounded-pill bg-sunken" aria-hidden>
                  <span className={`block h-full rounded-pill ${b.forte ? 'bg-brand' : 'bg-ink-400'}`} style={{ width: `${Math.max(b.valor ? 2 : 0, (b.valor / maxMedia) * 100)}%` }} />
                </span>
                <span className="text-sm font-bold tabular-nums text-ink-900">{n(b.valor)} <span className="text-xs font-normal text-ink-500">{u}/dia</span></span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-500">A seta vem da média por dia lançado — o total engana quando um dos meses teve poucos lançamentos.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-card bg-sunken p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-500"><Scale className="h-3.5 w-3.5" /> Total do mês</p>
            <p className="mt-1 sgo-type-24 font-bold tabular-nums text-ink-900">{n(r.atual.total)} <span className="text-sm font-semibold text-ink-500">{u}</span></p>
            <p className="mt-1 text-xs text-ink-500">até o dia {r.diasDecorridos}, {MESES[ant - 1]} tinha {n(r.anteriorAteHoje.total)}</p>
          </div>
          <div className="flex items-center gap-3 rounded-card bg-sunken p-3">
            <svg viewBox="0 0 44 44" width={56} height={56} className="shrink-0" aria-hidden>
              <circle cx={22} cy={22} r={18} fill="none" className="text-line-strong" stroke="currentColor" strokeWidth={5} />
              <circle cx={22} cy={22} r={18} fill="none" className={cobertura < 0.8 ? 'text-warning' : 'text-success'} stroke="currentColor" strokeWidth={5} strokeLinecap="round"
                strokeDasharray={`${Math.min(1, cobertura) * 113.1} 113.1`} transform="rotate(-90 22 22)" />
            </svg>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-500"><CalendarDays className="h-3.5 w-3.5" /> Cobertura</p>
              <p className="sgo-type-24 font-bold tabular-nums text-ink-900">{Math.round(cobertura * 100)}%</p>
              <p className="text-xs text-ink-500">{r.atual.lancamentos} de {esperados || 0} lançamentos</p>
            </div>
          </div>
          <div className="rounded-card bg-sunken p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-500"><Flame className="h-3.5 w-3.5" /> Dia de pico</p>
            <p className="mt-1 sgo-type-24 font-bold tabular-nums text-ink-900">{pico ? `${n(pico.total)} ` : '—'}{pico && <span className="text-sm font-semibold text-ink-500">{u}</span>}</p>
            <p className="mt-1 text-xs text-ink-500">{pico ? `dia ${Number(pico.date.slice(8, 10))} · ${pico.lancamentos} lançamento(s)` : 'sem lançamento no mês'}</p>
          </div>
          <div className="rounded-card bg-sunken p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-500"><Gauge className="h-3.5 w-3.5" /> Dias com lançamento</p>
            <p className="mt-1 sgo-type-24 font-bold tabular-nums text-ink-900">{diasComDado} <span className="text-sm font-semibold text-ink-500">de {r.diasDecorridos}</span></p>
            <p className="mt-1 text-xs text-ink-500">{r.diasDecorridos - diasComDado > 0 ? `${r.diasDecorridos - diasComDado} dia(s) sem nenhum registro` : 'todos os dias com registro'}</p>
          </div>
        </div>
      </section>

      <Card>
        <PanelHeader title={`Dia a dia — ${MESES[d.month - 1]} (${u})`} icon={<Activity className="h-4 w-4 text-brand" />} />
        <CardContent className="pt-8">
          <BarrasDiarias pontos={d.serie} referencia={referencia} unidade={u} rotuloReferencia={`média/dia de ${MESES[ant - 1]}`} />
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" aria-hidden /> soma do dia nas unidades filtradas</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1 w-1 rounded-pill bg-line-strong" aria-hidden /> dia sem lançamento (falta de dado, não zero)</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-sunken" aria-hidden /> fim de semana</span>
          </p>
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
