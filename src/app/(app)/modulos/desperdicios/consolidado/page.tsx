import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, TriangleAlert, Printer, LayoutGrid, ClipboardCheck, LineChart, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getConsolidadoDeDesperdicio } from '@/lib/waste/consolidado';
import { getEvolucaoDesperdicioKg } from '@/lib/waste/evolucao';
import { getConsolidadoSalgados } from '@/lib/waste/salgados';
import { TIPOS_DE_DESPERDICIO, GRUPOS, LABEL_TOTAL_GERAL, LABEL_TOTAL_GERAL_MES } from '@/lib/waste/tipos';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { shortUnitName } from '@/lib/unit-name';
import { getConferencia, getPerformance } from '@/lib/waste/painel';
import { getWastePhotoRequired } from '@/lib/waste/foto-config';
import { PainelConferencia, type FiltroConferencia } from '@/components/waste/painel-conferencia';
import { PainelPerformance } from '@/components/waste/painel-performance';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';

export const dynamic = 'force-dynamic';

type Aba = 'restaurante' | 'salgados';
type Visao = 'resumo' | 'conferencia' | 'performance';
const TODAS = 'todas';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** kg com 3 casas só quando precisa — 12 kg lê melhor que 12,000 kg. */
const kg = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const un = (n: number) => n.toLocaleString('pt-BR');
const mlabel = (ym: string) => { const [y, m] = ym.split('-'); return `${MES_CURTO[Number(m) - 1]}/${y.slice(2)}`; };

/** A variação com o sinal e a cor certos. Em desperdício, SUBIR é ruim. */
function Variacao({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-500">—</span>;
  const subiu = v > 0;
  return (
    <span className={subiu ? 'font-semibold text-danger' : 'font-semibold text-success'}>
      {subiu ? '▲' : '▼'} {Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  );
}

/** Evolução mensal em barras — um bloco só, sem biblioteca de gráfico. */
function Evolucao({ pontos, unidade }: { pontos: { ym: string; valor: number }[]; unidade: string }) {
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  return (
    <div className="grid grid-cols-6 gap-2">
      {pontos.map((p) => (
        <div key={p.ym} className="flex flex-col items-center gap-1">
          <span className="sgo-type-11 font-semibold tabular-nums text-ink-900">{unidade === 'kg' ? kg(p.valor) : un(p.valor)}</span>
          <div className="flex h-24 w-full items-end rounded-md bg-sunken">
            <div className="w-full rounded-md bg-brand" style={{ height: `${Math.max(4, (p.valor / max) * 100)}%` }} />
          </div>
          <span className="sgo-type-11 text-ink-500">{mlabel(p.ym)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Painel consolidado de desperdício — a rede num mês, em DUAS abas.
 * Restaurante (kg) e Salgados (unidades) nunca se somam: cada aba tem os seus
 * números, o seu consolidado e a sua evolução.
 */
export default async function ConsolidadoDesperdicioPage({
  searchParams,
}: {
  searchParams: { ano?: string; mes?: string; aba?: string; visao?: string; unidade?: string; filtro?: string };
}) {
  const user = (await getSessionUser())!;
  const agora = new Date();
  const year = Number(searchParams.ano) || agora.getFullYear();
  const month = Math.min(12, Math.max(1, Number(searchParams.mes) || agora.getMonth() + 1));
  const aba: Aba = searchParams.aba === 'salgados' ? 'salgados' : 'restaurante';
  const visao: Visao = searchParams.visao === 'conferencia' || searchParams.visao === 'performance' ? searchParams.visao : 'resumo';
  const unidade = searchParams.unidade && searchParams.unidade !== TODAS ? searchParams.unidade : null;
  const filtro: FiltroConferencia = searchParams.filtro === 'sem-foto' || searchParams.filtro === 'depois' ? searchParams.filtro : 'todos';

  const ant = month === 1 ? { a: year - 1, m: 12 } : { a: year, m: month - 1 };
  const prox = month === 12 ? { a: year + 1, m: 1 } : { a: year, m: month + 1 };
  /* Todo estado do painel mora na URL (o link que o supervisor manda já abre
     no lugar certo e a impressão sai igual à tela). */
  const link = (a: number, m: number, ab: Aba = aba, v: Visao = visao, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ ano: String(a), mes: String(m), aba: ab, visao: v });
    if (unidade && v !== 'resumo') q.set('unidade', unidade);
    for (const [k, val] of Object.entries(extra)) q.set(k, val);
    return `/modulos/desperdicios/consolidado?${q.toString()}`;
  };

  const unidadesDoFiltro = visao === 'resumo' ? [] : await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const subtitulos: Record<Visao, string> = {
    resumo: 'O mês da rede, unidade por unidade.',
    conferencia: 'Cada lançamento com quem lançou, quando e as fotos.',
    performance: 'Aumentou ou diminuiu? Gráficos e comparação com o mês anterior.',
  };
  const cabecalho = (
    <>
      <Link href={`/modulos/desperdicios?aba=${aba}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden">
        <ArrowLeft className="h-4 w-4" /> Desperdícios
      </Link>
      {/* Cabeçalho do kit: as três visões são as abas; frente, mês e unidade
          ficam na linha de filtros. Restaurante (kg) e Salgados (un.) nunca se somam. */}
      <LargeTitle
        title="Painel de desperdício"
        subtitle={`${aba === 'restaurante' ? 'Sobras Restaurante (kg)' : 'Sobras Salgados (unidades)'} · ${subtitulos[visao]}`}
        tabs={[
          { label: 'Resumo', icon: <LayoutGrid className="h-3.5 w-3.5" />, href: link(year, month, aba, 'resumo'), active: visao === 'resumo', testId: 'visao-resumo' },
          { label: 'Conferência', icon: <ClipboardCheck className="h-3.5 w-3.5" />, href: link(year, month, aba, 'conferencia'), active: visao === 'conferencia', testId: 'visao-conferencia' },
          { label: 'Performance', icon: <LineChart className="h-3.5 w-3.5" />, href: link(year, month, aba, 'performance'), active: visao === 'performance', testId: 'visao-performance' },
        ]}
        actions={<span className="hidden items-center gap-1.5 text-xs text-ink-500 sm:inline-flex"><Printer className="h-4 w-4" /> Imprimir do navegador gera o PDF</span>}
      />
      <div className="sgo-filtros -mx-4 print:hidden">
        <span className="sgo-label">Frente</span>
        <SegmentedNav aria-label="Frente do desperdício" value={aba}
          options={[{ value: 'restaurante', label: 'Restaurante (kg)', href: link(year, month, 'restaurante') }, { value: 'salgados', label: 'Salgados (un.)', href: link(year, month, 'salgados') }]} />
        <span className="sgo-label">Mês</span>
        <div className="inline-flex items-center gap-1">
          <Link href={link(ant.a, ant.m)} className="sgo-btn sgo-btn--sm" aria-label="Mês anterior"><ChevronLeft className="h-3.5 w-3.5" /></Link>
          <span className="min-w-32 text-center text-sm font-bold capitalize text-ink-900">{MESES[month - 1]} de {year}</span>
          <Link href={link(prox.a, prox.m)} className="sgo-btn sgo-btn--sm" aria-label="Próximo mês"><ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
        {visao !== 'resumo' && unidadesDoFiltro.length > 1 && (
          <>
            <span className="sgo-label">Unidade</span>
            <UnitSelectNav paramName="unidade" units={[{ id: TODAS, name: 'Todas as unidades' }, ...unidadesDoFiltro.map((u) => ({ id: u.id, name: shortUnitName(u.name) }))]} selected={unidade ?? TODAS} />
          </>
        )}
      </div>
    </>
  );

  /* ───────────────────────── CONFERÊNCIA / PERFORMANCE ───────────────────────── */
  if (visao === 'conferencia') {
    const [dados, fotoObrigatoria] = await Promise.all([getConferencia(user, aba, year, month, unidade), getWastePhotoRequired()]);
    return (
      <div className="space-y-4">
        {cabecalho}
        <PainelConferencia d={dados} filtro={filtro} fotoObrigatoria={fotoObrigatoria} linkFiltro={(f) => link(year, month, aba, 'conferencia', f === 'todos' ? {} : { filtro: f })} />
      </div>
    );
  }
  if (visao === 'performance') {
    const dados = await getPerformance(user, aba, year, month, unidade);
    return (
      <div className="space-y-4">
        {cabecalho}
        <PainelPerformance d={dados} />
      </div>
    );
  }

  /* ───────────────────────── SALGADOS (unidades) ───────────────────────── */
  if (aba === 'salgados') {
    const s = await getConsolidadoSalgados(user, year, month);
    const semLancamento = s.linhas.filter((l) => l.total === 0);
    return (
      <div className="space-y-4">
        {cabecalho}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card><CardContent className="pt-4"><p className="text-xl font-bold tabular-nums text-ink-900">{un(s.rede.total)}</p><p className="text-[11px] text-ink-700">Total descartado (un.)</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xl font-bold tabular-nums"><Variacao v={s.rede.variacao} /></p><p className="text-[11px] text-ink-700">vs. {MESES[ant.m - 1]} ({un(s.rede.anterior)} un.)</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="truncate text-lg font-bold text-ink-900">{s.rede.topTipos[0]?.name ?? '—'}</p><p className="text-[11px] text-ink-700">Tipo mais descartado{s.rede.topTipos[0] ? ` (${un(s.rede.topTipos[0].qty)} un.)` : ''}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="truncate text-lg font-bold text-ink-900">{s.rede.topMotivos[0]?.name ?? '—'}</p><p className="text-[11px] text-ink-700">Motivo mais recorrente{s.rede.topMotivos[0] ? ` (${un(s.rede.topMotivos[0].qty)} un.)` : ''}</p></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Card><CardContent className="pt-4">
            <p className="mb-2 text-sm font-semibold text-ink-900">Tipos com maior descarte na rede</p>
            {s.rede.topTipos.length === 0 ? <p className="text-sm text-ink-500">Sem lançamentos no mês.</p> : (
              <ul className="space-y-1 text-sm">
                {s.rede.topTipos.map((t) => (
                  <li key={t.name} className="flex items-center justify-between border-b border-line py-1"><span className="text-ink-900">{t.name}</span><span className="font-semibold tabular-nums text-ink-700">{un(t.qty)} un.</span></li>
                ))}
              </ul>
            )}
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="mb-2 text-sm font-semibold text-ink-900">Motivos mais recorrentes na rede</p>
            {s.rede.topMotivos.length === 0 ? <p className="text-sm text-ink-500">Sem lançamentos no mês.</p> : (
              <ul className="space-y-1 text-sm">
                {s.rede.topMotivos.map((m) => (
                  <li key={m.name} className="flex items-center justify-between border-b border-line py-1"><span className="text-ink-900">{m.name}</span><span className="font-semibold tabular-nums text-ink-700">{un(m.qty)} un.</span></li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </div>

        <Card><CardContent className="pt-4">
          <p className="mb-2 text-sm font-semibold text-ink-900">Evolução — últimos 6 meses (un.)</p>
          <Evolucao pontos={s.evolucao.map((e) => ({ ym: e.ym, valor: e.total }))} unidade="un" />
        </CardContent></Card>

        <p className="text-xs text-ink-500 print:hidden">Para ver cada lançamento com a foto do recipiente, abra <Link className="font-semibold text-brand underline" href={link(year, month, aba, 'conferencia')}>Conferência</Link>; para saber se aumentou ou diminuiu, <Link className="font-semibold text-brand underline" href={link(year, month, aba, 'performance')}>Performance</Link>.</p>

        {semLancamento.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg p-2 text-sm text-warning print:hidden">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span><b>Sem nenhum lançamento de salgados em {MESES[month - 1]}:</b> {semLancamento.map((l) => shortUnitName(l.unitName)).join(', ')}. Zero aqui significa que ninguém lançou — não que não houve descarte.</span>
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-line text-left text-ink-700">
                <th className="px-2 py-1.5 font-semibold">Unidade</th>
                <th className="px-2 py-1.5 text-right font-semibold text-ink-900">Total (un.)</th>
                <th className="px-2 py-1.5 font-semibold">Tipos com mais descarte</th>
                <th className="px-2 py-1.5 font-semibold">Motivo mais recorrente</th>
                <th className="px-2 py-1.5 text-right font-semibold">Dias lançados</th>
              </tr>
            </thead>
            <tbody>
              {s.linhas.map((l) => (
                <tr key={l.unitId} className="border-b border-line">
                  <th scope="row" className="px-2 py-1.5 text-left font-medium text-ink-900">{shortUnitName(l.unitName)}</th>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums text-ink-900">{un(l.total)}</td>
                  <td className="px-2 py-1.5 text-ink-700">{l.topTipos.length ? l.topTipos.map((t) => `${t.name} (${un(t.qty)})`).join(' · ') : '—'}</td>
                  <td className="px-2 py-1.5 text-ink-700">{l.motivoTop ? `${l.motivoTop.name} (${un(l.motivoTop.qty)})` : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-700">{l.diasComLancamento}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-strong">
                <th scope="row" className="px-2 py-1.5 text-left font-bold text-ink-900">Rede</th>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums text-ink-900">{un(s.rede.total)}</td>
                <td className="px-2 py-1.5 text-ink-700">{s.rede.topTipos.slice(0, 3).map((t) => `${t.name} (${un(t.qty)})`).join(' · ') || '—'}</td>
                <td className="px-2 py-1.5 text-ink-700">{s.rede.topMotivos[0] ? `${s.rede.topMotivos[0].name} (${un(s.rede.topMotivos[0].qty)})` : '—'}</td>
                <td className="px-2 py-1.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  /* ───────────────────────── RESTAURANTE (kg) ───────────────────────── */
  const [c, evolucao] = await Promise.all([getConsolidadoDeDesperdicio(user, year, month, agora), getEvolucaoDesperdicioKg(user, year, month)]);
  const mediaDiaria = (l: { geral: number; diasComLancamento: number }) => (l.diasComLancamento ? l.geral / l.diasComLancamento : 0);
  const diasRede = c.linhas.reduce((s, l) => s + l.diasComLancamento, 0);

  return (
    <div className="space-y-4">
      {cabecalho}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Card><CardContent className="pt-4"><p className="text-xl font-bold tabular-nums text-ink-900">{kg(c.rede.sobraLimpa)}</p><p className="text-[11px] text-ink-700">{GRUPOS[0].label}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xl font-bold tabular-nums text-ink-900">{kg(c.rede.sobraProducao)}</p><p className="text-[11px] text-ink-700">{GRUPOS[1].label}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xl font-bold tabular-nums text-ink-900">{kg(c.rede.geral)}</p><p className="text-[11px] text-ink-700">{LABEL_TOTAL_GERAL_MES}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xl font-bold tabular-nums text-ink-900">{kg(diasRede ? c.rede.geral / diasRede : 0)}</p><p className="text-[11px] text-ink-700">Média diária (kg/dia lançado)</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xl font-bold tabular-nums"><Variacao v={c.rede.variacao} /></p><p className="text-[11px] text-ink-700">vs. {MESES[ant.m - 1]} ({kg(c.rede.anterior)} kg)</p></CardContent></Card>
      </div>

      <Card><CardContent className="pt-4">
        <p className="mb-2 text-sm font-semibold text-ink-900">Evolução — últimos 6 meses (kg)</p>
        <Evolucao pontos={evolucao.map((e) => ({ ym: e.ym, valor: e.kg }))} unidade="kg" />
      </CardContent></Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:hidden">
        <Card><CardContent className="pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-danger"><TrendingUp className="h-4 w-4" /> Aumentou em {MESES[month - 1]}</p>
          {c.subiram.length === 0 ? <p className="text-sm text-ink-500">Nenhuma unidade aumentou.</p> : (
            <ul className="space-y-1 text-sm">
              {c.subiram.map((l) => (
                <li key={l.unitId} className="flex items-center justify-between gap-2 border-b border-line py-1">
                  <span className="text-ink-900">{shortUnitName(l.unitName)}</span>
                  <span className="tabular-nums text-ink-700">{kg(l.anterior)} → {kg(l.geral)} kg &nbsp;<Variacao v={l.variacao} /></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-success"><TrendingDown className="h-4 w-4" /> Diminuiu em {MESES[month - 1]}</p>
          {c.cairam.length === 0 ? <p className="text-sm text-ink-500">Nenhuma unidade diminuiu.</p> : (
            <ul className="space-y-1 text-sm">
              {c.cairam.map((l) => (
                <li key={l.unitId} className="flex items-center justify-between gap-2 border-b border-line py-1">
                  <span className="text-ink-900">{shortUnitName(l.unitName)}</span>
                  <span className="tabular-nums text-ink-700">{kg(l.anterior)} → {kg(l.geral)} kg &nbsp;<Variacao v={l.variacao} /></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>

      {c.semLancamento.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg p-2 text-sm text-warning print:hidden">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>Sem nenhum lançamento em {MESES[month - 1]}:</b> {c.semLancamento.map((l) => shortUnitName(l.unitName)).join(', ')}. Zero quilo aqui significa que ninguém lançou — não que não houve desperdício.</span>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-right text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-semibold text-ink-700">Unidade</th>
              {TIPOS_DE_DESPERDICIO.map((t) => <th key={t.code} className="px-2 py-1.5 font-semibold text-ink-700">{t.name}</th>)}
              <th className="px-2 py-1.5 font-semibold text-ink-900">{GRUPOS[0].label}</th>
              <th className="px-2 py-1.5 font-semibold text-ink-900">{GRUPOS[1].label}</th>
              <th className="px-2 py-1.5 font-semibold text-ink-900">{LABEL_TOTAL_GERAL}</th>
              <th className="px-2 py-1.5 font-semibold text-ink-700">Média diária</th>
              <th className="px-2 py-1.5 font-semibold text-ink-700">vs. mês anterior</th>
              <th className="px-2 py-1.5 font-semibold text-ink-700">Dias lançados</th>
            </tr>
          </thead>
          <tbody>
            {c.linhas.map((l) => (
              <tr key={l.unitId} className="border-b border-line">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-medium text-ink-900">{shortUnitName(l.unitName)}</th>
                {TIPOS_DE_DESPERDICIO.map((t) => <td key={t.code} className="px-2 py-1.5 tabular-nums text-ink-700">{kg(l.porCodigo[t.code] ?? 0)}</td>)}
                <td className="px-2 py-1.5 font-semibold tabular-nums text-ink-900">{kg(l.sobraLimpa)}</td>
                <td className="px-2 py-1.5 font-semibold tabular-nums text-ink-900">{kg(l.sobraProducao)}</td>
                <td className="px-2 py-1.5 font-bold tabular-nums text-ink-900">{kg(l.geral)}</td>
                <td className="px-2 py-1.5 tabular-nums text-ink-700">{kg(mediaDiaria(l))}</td>
                <td className="px-2 py-1.5 tabular-nums"><Variacao v={l.variacao} /></td>
                <td className="px-2 py-1.5 tabular-nums text-ink-700">{l.diasComLancamento}/{l.diasDecorridos}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-bold text-ink-900">Rede</th>
              {TIPOS_DE_DESPERDICIO.map((t) => <td key={t.code} className="px-2 py-1.5 font-semibold tabular-nums text-ink-900">{kg(c.rede.porCodigo[t.code] ?? 0)}</td>)}
              <td className="px-2 py-1.5 font-bold tabular-nums text-ink-900">{kg(c.rede.sobraLimpa)}</td>
              <td className="px-2 py-1.5 font-bold tabular-nums text-ink-900">{kg(c.rede.sobraProducao)}</td>
              <td className="px-2 py-1.5 font-bold tabular-nums text-ink-900">{kg(c.rede.geral)}</td>
              <td className="px-2 py-1.5 tabular-nums text-ink-700">{kg(diasRede ? c.rede.geral / diasRede : 0)}</td>
              <td className="px-2 py-1.5 tabular-nums"><Variacao v={c.rede.variacao} /></td>
              <td className="px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-ink-500">
        <b>Dias lançados</b> é a cobertura: uma unidade com poucos dias lançados pode parecer que desperdiça pouco só porque quase não registrou. Leia a variação junto com essa coluna. As colunas “Refeitório (histórico)” existem só para os meses anteriores à mudança — não se lança mais nelas.
      </p>
    </div>
  );
}
