'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, ArrowDown, ArrowRight, AlertTriangle, TrendingUp } from 'lucide-react';
import { shortUnitName } from '@/lib/unit-name';
import type { PainelRede, UnidadeExecutiva, EvolucaoMesRede } from '@/lib/supervisor/rede';

/**
 * PAINEL EXECUTIVO DA REDE — visão da diretoria.
 * Recebe tudo pronto do servidor (`getPainelRede`). O cliente só ordena a
 * tabela e troca o indicador do gráfico; nenhum número é recalculado aqui.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function mlabel(ym: string) { const [y, m] = ym.split('-'); return `${MESES[Number(m) - 1]}/${y.slice(2)}`; }
function tone(p: number) { return p >= 80 ? 'text-success' : p >= 50 ? 'text-warning' : 'text-danger'; }
function toneBg(p: number) { return p >= 80 ? 'bg-success' : p >= 50 ? 'bg-warning' : 'bg-danger'; }
function toneDot(p: number) { return p >= 80 ? 'bg-success' : p >= 50 ? 'bg-warning' : 'bg-danger'; }

function Delta({ pp }: { pp: number | null }) {
  if (pp == null) return <span className="text-[11px] text-ink-400">sem base anterior</span>;
  if (pp === 0) return <span className="text-[11px] text-ink-500">estável vs mês anterior</span>;
  const up = pp > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'text-success' : 'text-danger'}`}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(pp)} p.p. vs mês anterior
    </span>
  );
}

function CardKpi({ label, value, sub, delta, valueTone }: { label: string; value: string; sub?: string; delta?: number | null; valueTone?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <p className="sgo-type-11 text-ink-500">{label}</p>
      <p className={`sgo-type-24 font-bold tabular-nums ${valueTone ?? 'text-ink-900'}`}>{value}</p>
      {sub && <p className="sgo-type-11 text-ink-500">{sub}</p>}
      {delta !== undefined && <div className="mt-0.5"><Delta pp={delta ?? null} /></div>}
    </div>
  );
}

type SortKey = 'performance' | 'uso' | 'checklist' | 'noPrazo' | 'atrasados' | 'naoRealiz' | 'ocorrencias' | 'desperdicio';

const INDICADORES: { key: keyof Omit<EvolucaoMesRede, 'ym'>; label: string; isPct: boolean }[] = [
  { key: 'performance', label: 'Performance', isPct: true },
  { key: 'uso', label: 'Uso do SGO', isPct: true },
  { key: 'checklistPct', label: 'Checklists', isPct: true },
  { key: 'ocorrencias', label: 'Ocorrências', isPct: false },
  { key: 'desperdicio', label: 'Desperdício', isPct: true },
];

function EvolucaoChart({ dados, indicador }: { dados: EvolucaoMesRede[]; indicador: keyof Omit<EvolucaoMesRede, 'ym'> }) {
  const W = 640, H = 180, PAD = { t: 16, b: 28, l: 34, r: 12 };
  const isPct = INDICADORES.find((i) => i.key === indicador)?.isPct ?? true;
  const vals = dados.map((d) => d[indicador] as number);
  const max = isPct ? 100 : Math.max(10, ...vals) * 1.15;
  const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (dados.length <= 1 ? innerW / 2 : (i / (dados.length - 1)) * innerW);
  const y = (v: number) => PAD.t + innerH - (Math.min(v, max) / max) * innerH;
  const pontos = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolução da rede">
      {[0, 0.5, 1].map((f) => {
        const gy = PAD.t + innerH - f * innerH;
        return (
          <g key={f}>
            <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="var(--sgo-line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="var(--sgo-ink-400)">{Math.round(f * max)}{isPct ? '%' : ''}</text>
          </g>
        );
      })}
      <polyline points={pontos} fill="none" stroke="var(--sgo-brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {vals.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="3.5" fill="var(--sgo-brand)" />
          <text x={x(i)} y={y(v) - 8} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--sgo-ink-700)">{v}{isPct ? '%' : ''}</text>
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--sgo-ink-500)">{mlabel(dados[i].ym)}</text>
        </g>
      ))}
    </svg>
  );
}

export function PainelRedeClient({ dados, ym }: { dados: PainelRede; ym: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'performance', dir: 'asc' });
  const [indicador, setIndicador] = useState<keyof Omit<EvolucaoMesRede, 'ym'>>('performance');

  const { resumo, deltas, pontos, resumoPeriodo, unidades, evolucao } = dados;

  const valorOrdenacao = (r: UnidadeExecutiva, k: SortKey): number => {
    switch (k) {
      case 'performance': return r.metaPct;
      case 'uso': return r.usagePct;
      case 'checklist': return r.checklistPct;
      case 'noPrazo': return r.checklistsDone;
      case 'atrasados': return r.checklistsLate;
      case 'naoRealiz': return r.checklistsMissed;
      case 'ocorrencias': return r.ocorrenciasAbertas;
      case 'desperdicio': return r.wastePct;
    }
  };
  const ordenadas = useMemo(() => {
    const arr = [...unidades].sort((a, b) => valorOrdenacao(a, sort.key) - valorOrdenacao(b, sort.key));
    return sort.dir === 'desc' ? arr.reverse() : arr;
  }, [unidades, sort]);

  const th = (key: SortKey, label: string) => (
    <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))} className="inline-flex items-center gap-0.5 font-semibold hover:text-brand">
      {label}{sort.key === key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );
  const linkUnidade = (unitId: string) => `/modulos/painel-unidade?visao=unidade&unit=${unitId}&mes=${ym}`;

  return (
    <div className="space-y-5">
      {/* ── Resumo executivo ── */}
      <section>
        <h2 className="mb-2 sgo-type-11 font-semibold uppercase tracking-wide text-ink-500">Resumo executivo da rede</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <CardKpi label="Performance da rede" value={`${resumo.performance}%`} valueTone={tone(resumo.performance)} delta={deltas.performance} />
          <CardKpi label="Uso do SGO" value={`${resumo.uso}%`} valueTone={tone(resumo.uso)} delta={deltas.uso} />
          <CardKpi label="Checklists no prazo" value={`${resumo.noPrazoPct}%`} valueTone={tone(resumo.noPrazoPct)} delta={deltas.noPrazo} />
          <CardKpi label="Checklists atrasados" value={`${resumo.checklistsLate}`} sub="fora do prazo" valueTone={resumo.checklistsLate > 0 ? 'text-warning' : 'text-ink-900'} />
          <CardKpi label="Não realizados" value={`${resumo.checklistsMissed}`} sub="checklists" valueTone={resumo.checklistsMissed > 0 ? 'text-danger' : 'text-ink-900'} />
          <CardKpi label="Ocorrências abertas" value={`${resumo.ocorrenciasAbertas}`} sub={`${resumo.ocorrenciasCriticas} crítica(s)`} valueTone={resumo.ocorrenciasCriticas > 0 ? 'text-danger' : 'text-ink-900'} />
          <CardKpi label="Comandas (cobertura)" value={`${resumo.comandasCobertura}%`} valueTone={tone(resumo.comandasCobertura)} />
          <CardKpi label="Desperdício (cobertura)" value={`${resumo.desperdicioCobertura}%`} valueTone={tone(resumo.desperdicioCobertura)} />
          <CardKpi label="Notas recebidas" value={`${resumo.notas}`} />
          <CardKpi label="Movimentos de cofre" value={`${resumo.cofre}`} />
        </div>
      </section>

      {/* ── Resumo do período (factual) ── */}
      <section className="rounded-card border border-line bg-sunken p-3">
        <h2 className="mb-1.5 flex items-center gap-1.5 sgo-type-13 font-semibold text-ink-900"><TrendingUp className="h-4 w-4 text-brand" /> Resumo do período</h2>
        <ul className="grid gap-x-6 gap-y-1 sgo-type-13 text-ink-700 sm:grid-cols-2">
          <li>• {resumoPeriodo.unidades} unidade(s) analisada(s)</li>
          <li>• {resumoPeriodo.performanceCaiu} unidade(s) com queda de performance</li>
          <li>• {resumoPeriodo.checklistsMelhorou} unidade(s) melhoraram os checklists</li>
          <li>• {resumoPeriodo.ocorrenciasCriticas} ocorrência(s) crítica(s) em aberto</li>
          <li>• {resumoPeriodo.semDesperdicio} unidade(s) sem lançamento de desperdício</li>
          <li>• execução geral de checklists: {resumoPeriodo.execucaoGeralPct}%</li>
        </ul>
      </section>

      {/* ── Pontos de atenção ── */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 sgo-type-11 font-semibold uppercase tracking-wide text-ink-500"><AlertTriangle className="h-4 w-4 text-warning" /> Pontos de atenção</h2>
        {pontos.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-3 sgo-type-13 text-ink-500">Nenhum ponto de atenção no período. A rede está dentro do esperado.</p>
        ) : (
          <div className="space-y-1.5">
            {pontos.map((p, i) => (
              <div key={i} className={`flex flex-wrap items-center justify-between gap-2 rounded-card border p-2.5 ${p.severidade >= 3 ? 'border-danger/40 bg-danger-bg' : p.severidade === 2 ? 'border-warning/40 bg-warning-bg' : 'border-line bg-surface'}`}>
                <div className="min-w-0">
                  <p className="sgo-type-15 font-semibold text-ink-900">{shortUnitName(p.unitName)} — {p.titulo}</p>
                  <p className="sgo-type-11 text-ink-500">{p.detalhe}</p>
                </div>
                <Link href={linkUnidade(p.unitId)} className="shrink-0 rounded-control border border-line px-2.5 py-1 sgo-type-13 font-semibold text-brand hover:border-brand">Ver unidade</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Evolução da rede ── */}
      <section className="rounded-card border border-line bg-surface p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="sgo-type-11 font-semibold uppercase tracking-wide text-ink-500">Evolução da rede — últimos {evolucao.length} meses</h2>
          <div className="flex flex-wrap gap-1">
            {INDICADORES.map((i) => (
              <button key={i.key} type="button" onClick={() => setIndicador(i.key)} className={`rounded-pill px-2.5 py-0.5 sgo-type-11 font-semibold ${indicador === i.key ? 'bg-brand text-on-brand' : 'bg-sunken text-ink-500 hover:bg-canvas'}`}>{i.label}</button>
            ))}
          </div>
        </div>
        <EvolucaoChart dados={evolucao} indicador={indicador} />
      </section>

      {/* ── Comparativo das unidades ── */}
      <section>
        <h2 className="mb-2 sgo-type-11 font-semibold uppercase tracking-wide text-ink-500">Comparativo das unidades</h2>
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[52rem] border-collapse sgo-type-13">
            <thead>
              <tr className="border-b border-line bg-sunken text-left text-ink-700">
                <th className="px-2.5 py-2">Unidade</th>
                <th className="px-2 py-2 text-center">{th('performance', 'Perf./Meta')}</th>
                <th className="px-2 py-2 text-center">{th('uso', 'Uso SGO')}</th>
                <th className="px-2 py-2 text-center">{th('checklist', 'Checklists')}</th>
                <th className="px-2 py-2 text-center">{th('noPrazo', 'No prazo')}</th>
                <th className="px-2 py-2 text-center">{th('atrasados', 'Atrasados')}</th>
                <th className="px-2 py-2 text-center">{th('naoRealiz', 'Não realiz.')}</th>
                <th className="px-2 py-2 text-center">{th('ocorrencias', 'Ocorrênc.')}</th>
                <th className="px-2 py-2 text-center">{th('desperdicio', 'Desperd.')}</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((r) => (
                <tr key={r.unitId} className="border-b border-line last:border-b-0 hover:bg-sunken">
                  <td className="px-2.5 py-2">
                    <Link href={linkUnidade(r.unitId)} className="inline-flex items-center gap-1.5 font-semibold text-ink-900 hover:text-brand">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${toneDot(r.usagePct)}`} />{shortUnitName(r.unitName)}
                    </Link>
                  </td>
                  <td className={`px-2 py-2 text-center font-semibold tabular-nums ${tone(r.metaPct)}`}>{r.metaPct}%</td>
                  <td className={`px-2 py-2 text-center font-semibold tabular-nums ${tone(r.usagePct)}`}>{r.usagePct}%</td>
                  <td className={`px-2 py-2 text-center tabular-nums ${tone(r.checklistPct)}`}>{r.checklistPct}%</td>
                  <td className="px-2 py-2 text-center tabular-nums text-ink-700">{r.checklistsDone}</td>
                  <td className={`px-2 py-2 text-center tabular-nums ${r.checklistsLate > 0 ? 'text-warning' : 'text-ink-500'}`}>{r.checklistsLate}</td>
                  <td className={`px-2 py-2 text-center tabular-nums ${r.checklistsMissed > 0 ? 'text-danger' : 'text-ink-500'}`}>{r.checklistsMissed}</td>
                  <td className={`px-2 py-2 text-center tabular-nums ${r.ocorrenciasCriticas > 0 ? 'text-danger' : 'text-ink-700'}`}>{r.ocorrenciasAbertas}{r.ocorrenciasCriticas > 0 ? ` (${r.ocorrenciasCriticas}!)` : ''}</td>
                  <td className={`px-2 py-2 text-center tabular-nums ${tone(r.wastePct)}`}>{r.wastePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 sgo-type-11 text-ink-400">Toque numa coluna para ordenar. Toque na unidade para abrir o detalhamento.</p>
      </section>

      {/* ── Adesão ao SGO ── */}
      <section>
        <h2 className="mb-2 sgo-type-11 font-semibold uppercase tracking-wide text-ink-500">Adesão ao SGO por ferramenta</h2>
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[44rem] border-collapse sgo-type-13">
            <thead>
              <tr className="border-b border-line bg-sunken text-left text-ink-700">
                <th className="px-2.5 py-2">Unidade</th>
                <th className="px-2 py-2 text-center">Checklists</th>
                <th className="px-2 py-2 text-center">Comandas</th>
                <th className="px-2 py-2 text-center">Desperdício</th>
                <th className="px-2 py-2 text-center">Cofre</th>
                <th className="px-2 py-2 text-center">Ocorrênc.</th>
                <th className="px-2 py-2 text-center">Notas</th>
                <th className="px-2 py-2 text-center">Adesão</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((r) => (
                <tr key={r.unitId} className="border-b border-line last:border-b-0">
                  <td className="px-2.5 py-2 font-semibold text-ink-900">{shortUnitName(r.unitName)}</td>
                  <td className={`px-2 py-2 text-center tabular-nums ${tone(r.checklistPct)}`}>{r.checklistPct}%</td>
                  <td className={`px-2 py-2 text-center tabular-nums ${tone(r.commandsPct)}`}>{r.commandsPct}%</td>
                  <td className={`px-2 py-2 text-center tabular-nums ${tone(r.wastePct)}`}>{r.wastePct}%</td>
                  {/* Cofre/ocorrências/notas são contagens: 0 pode ser "não se aplica", não pinta de vermelho. */}
                  <td className="px-2 py-2 text-center tabular-nums text-ink-700">{r.cashSessions}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-ink-700">{r.occurrences}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-ink-700">{r.notes}</td>
                  <td className={`px-2 py-2 text-center font-bold tabular-nums ${tone(r.usagePct)}`}>{r.usagePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
