import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, TriangleAlert, Printer } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getConsolidadoDeDesperdicio } from '@/lib/waste/consolidado';
import { TIPOS_DE_DESPERDICIO, GRUPOS, LABEL_TOTAL_GERAL } from '@/lib/waste/tipos';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** kg com 3 casas só quando precisa — 12 kg lê melhor que 12,000 kg. */
const kg = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

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

/**
 * Painel consolidado de desperdício — a rede num mês.
 *
 * Existe porque a lista de tipos virou fechada: antes, cada unidade tinha as
 * suas categorias e uma coluna somada entre unidades não significava nada.
 */
export default async function ConsolidadoDesperdicioPage({
  searchParams,
}: {
  searchParams: { ano?: string; mes?: string };
}) {
  const user = (await getSessionUser())!;
  const agora = new Date();
  const year = Number(searchParams.ano) || agora.getFullYear();
  const month = Math.min(12, Math.max(1, Number(searchParams.mes) || agora.getMonth() + 1));

  const c = await getConsolidadoDeDesperdicio(user, year, month, agora);

  const ant = month === 1 ? { a: year - 1, m: 12 } : { a: year, m: month - 1 };
  const prox = month === 12 ? { a: year + 1, m: 1 } : { a: year, m: month + 1 };
  const link = (a: number, m: number) => `/modulos/desperdicios/consolidado?ano=${a}&mes=${m}`;

  return (
    <div className="space-y-4">
      <Link href="/modulos/desperdicios" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden">
        <ArrowLeft className="h-4 w-4" /> Desperdícios
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <LargeTitle title="Painel consolidado" subtitle="Todas as unidades, por tipo de desperdício e por mês." />
        <a href="#" className="hidden print:hidden" aria-hidden />
      </div>

      {/* Navegação do mês */}
      <div className="flex items-center justify-between rounded-lg border border-dashed p-2 print:hidden">
        <Link href={link(ant.a, ant.m)} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">← anterior</Link>
        <span className="text-sm font-bold text-ink-900">{MESES[month - 1]} de {year}</span>
        <Link href={link(prox.a, prox.m)} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">próximo →</Link>
      </div>

      {/* ── A rede em números ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card><CardContent className="pt-4">
          <p className="text-xl font-bold tabular-nums text-ink-900">{kg(c.rede.sobraLimpa)}</p>
          <p className="text-[11px] text-ink-700">{GRUPOS[0].label}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xl font-bold tabular-nums text-ink-900">{kg(c.rede.sobraProducao)}</p>
          <p className="text-[11px] text-ink-700">{GRUPOS[1].label}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xl font-bold tabular-nums text-ink-900">{kg(c.rede.geral)}</p>
          <p className="text-[11px] text-ink-700">{LABEL_TOTAL_GERAL.replace(' DIA', '')}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xl font-bold tabular-nums"><Variacao v={c.rede.variacao} /></p>
          <p className="text-[11px] text-ink-700">vs. {MESES[ant.m - 1]} ({kg(c.rede.anterior)} kg)</p>
        </CardContent></Card>
      </div>

      {/* ── Dashboard: para que lado cada unidade está indo ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:hidden">
        <Card><CardContent className="pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-danger">
            <TrendingUp className="h-4 w-4" /> Aumentou em {MESES[month - 1]}
          </p>
          {c.subiram.length === 0 ? (
            <p className="text-sm text-ink-500">Nenhuma unidade aumentou.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {c.subiram.map((l) => (
                <li key={l.unitId} className="flex items-center justify-between gap-2 border-b border-line py-1">
                  <span className="text-ink-900">{shortUnitName(l.unitName)}</span>
                  <span className="tabular-nums text-ink-700">
                    {kg(l.anterior)} → {kg(l.geral)} kg &nbsp;<Variacao v={l.variacao} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>

        <Card><CardContent className="pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-success">
            <TrendingDown className="h-4 w-4" /> Diminuiu em {MESES[month - 1]}
          </p>
          {c.cairam.length === 0 ? (
            <p className="text-sm text-ink-500">Nenhuma unidade diminuiu.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {c.cairam.map((l) => (
                <li key={l.unitId} className="flex items-center justify-between gap-2 border-b border-line py-1">
                  <span className="text-ink-900">{shortUnitName(l.unitName)}</span>
                  <span className="tabular-nums text-ink-700">
                    {kg(l.anterior)} → {kg(l.geral)} kg &nbsp;<Variacao v={l.variacao} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>

      {/* Sem lançamento não é bom resultado — é ausência de dado. */}
      {c.semLancamento.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg p-2 text-sm text-warning print:hidden">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>Sem nenhum lançamento em {MESES[month - 1]}:</b>{' '}
            {c.semLancamento.map((l) => shortUnitName(l.unitName)).join(', ')}. Zero quilo aqui significa que
            ninguém lançou — não que não houve desperdício.
          </span>
        </p>
      )}

      {/* ── A tabela: unidade × tipo ── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-right text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-semibold text-ink-700">Unidade</th>
              {TIPOS_DE_DESPERDICIO.map((t) => (
                <th key={t.code} className="px-2 py-1.5 font-semibold text-ink-700">{t.name}</th>
              ))}
              <th className="px-2 py-1.5 font-semibold text-ink-900">{GRUPOS[0].label}</th>
              <th className="px-2 py-1.5 font-semibold text-ink-900">{GRUPOS[1].label}</th>
              <th className="px-2 py-1.5 font-semibold text-ink-900">{LABEL_TOTAL_GERAL}</th>
              <th className="px-2 py-1.5 font-semibold text-ink-700">vs. mês anterior</th>
              <th className="px-2 py-1.5 font-semibold text-ink-700">Dias lançados</th>
            </tr>
          </thead>
          <tbody>
            {c.linhas.map((l) => (
              <tr key={l.unitId} className="border-b border-line">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-medium text-ink-900">
                  {shortUnitName(l.unitName)}
                </th>
                {TIPOS_DE_DESPERDICIO.map((t) => (
                  <td key={t.code} className="px-2 py-1.5 tabular-nums text-ink-700">{kg(l.porCodigo[t.code] ?? 0)}</td>
                ))}
                <td className="px-2 py-1.5 font-semibold tabular-nums text-ink-900">{kg(l.sobraLimpa)}</td>
                <td className="px-2 py-1.5 font-semibold tabular-nums text-ink-900">{kg(l.sobraProducao)}</td>
                <td className="px-2 py-1.5 font-bold tabular-nums text-ink-900">{kg(l.geral)}</td>
                <td className="px-2 py-1.5 tabular-nums"><Variacao v={l.variacao} /></td>
                <td className="px-2 py-1.5 tabular-nums text-ink-700">
                  {l.diasComLancamento}/{l.diasDecorridos}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-bold text-ink-900">Rede</th>
              {TIPOS_DE_DESPERDICIO.map((t) => (
                <td key={t.code} className="px-2 py-1.5 font-semibold tabular-nums text-ink-900">{kg(c.rede.porCodigo[t.code] ?? 0)}</td>
              ))}
              <td className="px-2 py-1.5 font-bold tabular-nums text-ink-900">{kg(c.rede.sobraLimpa)}</td>
              <td className="px-2 py-1.5 font-bold tabular-nums text-ink-900">{kg(c.rede.sobraProducao)}</td>
              <td className="px-2 py-1.5 font-bold tabular-nums text-ink-900">{kg(c.rede.geral)}</td>
              <td className="px-2 py-1.5 tabular-nums"><Variacao v={c.rede.variacao} /></td>
              <td className="px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-ink-500">
        <b>Dias lançados</b> é a cobertura: uma unidade com poucos dias lançados pode parecer que desperdiça pouco
        só porque quase não registrou. Leia a variação junto com essa coluna.
      </p>

      <p className="flex items-center gap-1.5 text-xs text-ink-500 print:hidden">
        <Printer className="h-4 w-4" /> Use Imprimir do navegador para gerar o PDF desta tabela.
      </p>
    </div>
  );
}
