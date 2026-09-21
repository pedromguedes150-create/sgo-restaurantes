import Link from 'next/link';
import { ArrowLeft, Download, ChevronRight, PencilLine } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getRelatorioDeGas } from '@/lib/gas/query';
import { emKg, emPercentual, emPrecoKg, emReal } from '@/lib/gas/variacao';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/ds/stat-card';
import { PrintButton } from '@/components/ui/print-button';
import { PeriodPicker } from '@/components/ui/ds/period-picker';
import { todayISO } from '@/lib/ds/date';

export const dynamic = 'force-dynamic';

/**
 * RELATÓRIO DO GÁS — por unidade, no período.
 *
 * A variação de cada nota é recalculada a cada leitura a partir da série
 * ordenada da unidade (ver `src/lib/gas/variacao.ts`), e não lida das colunas
 * gravadas no lançamento: elas envelheciam com nota retroativa e com correção
 * de data, sem nada avisar.
 *
 * Componente de SERVIDOR, e o detalhamento abre por `?unidade=` em vez de
 * estado no cliente: assim o link que o supervisor manda já abre na unidade
 * certa, e a folha impressa sai igual à tela.
 */
export default async function GasRelatorioPage({
  searchParams,
}: {
  searchParams: { start?: string; end?: string; unidade?: string };
}) {
  const user = (await getSessionUser())!;
  const relatorio = await getRelatorioDeGas(user, {
    de: searchParams.start,
    ate: searchParams.end,
    months: 12,
  });

  const ateNaTela = relatorio.ate === '9999-12-31' ? todayISO() : relatorio.ate;

  const aberta = searchParams.unidade
    ? relatorio.unidades.find((u) => u.unitId === searchParams.unidade) ?? null
    : null;

  const filtro = new URLSearchParams();
  if (searchParams.start) filtro.set('start', searchParams.start);
  if (searchParams.end) filtro.set('end', searchParams.end);
  const qs = filtro.toString();
  const linkDaUnidade = (id: string) => `/modulos/gas/relatorio?${qs ? `${qs}&` : ''}unidade=${id}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/modulos/gas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
          <ArrowLeft className="h-4 w-4" /> Gás
        </Link>
        <div className="flex gap-2">
          <a
            href={`/api/gas/export?${qs}`}
            className="sgo-control inline-flex items-center gap-1 rounded-control border border-line-strong px-3 py-1.5 text-sm font-semibold hover:border-brand"
          >
            <Download className="h-4 w-4" /> Excel
          </a>
          <PrintButton label="PDF" />
        </div>
      </div>

      <div>
        <h1 className="sgo-type-24 font-bold text-ink-900">Relatório do gás</h1>
        <p className="text-sm text-ink-500">
          Compras por unidade no período, com a variação do preço/kg recalculada em cima de todo o histórico.
        </p>
      </div>

      <div className="print:hidden">
        {/* O seletor precisa de uma data de verdade nas duas pontas: com string
            vazia o DatePicker de dentro dele quebra a página inteira. Período
            sem fim vira HOJE, que é o que a pessoa quer dizer com "até agora". */}
        <PeriodPicker start={relatorio.de} end={ateNaTela} basePath="/modulos/gas/relatorio" />
      </div>

      {relatorio.unidades.length === 0 ? (
        <p className="text-sm text-ink-500">Nenhum recebimento de gás no período.</p>
      ) : (
        <>
          {/* ── CONSOLIDADO DA REDE ── */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Notas" value={relatorio.total.notas} />
            <StatCard label="Kg comprados" value={emKg(relatorio.total.kg)} />
            <StatCard label="Valor gasto" value={emReal(relatorio.total.valor)} />
            <StatCard label="Preço médio/kg" value={emPrecoKg(relatorio.total.precoMedio)} hint="valor ÷ kg" />
            <StatCard label="Menor · maior" value={`${emPrecoKg(relatorio.total.menorPreco)}`} hint={`máx ${emPrecoKg(relatorio.total.maiorPreco)}`} />
            <StatCard
              label="Variação no período"
              value={emPercentual(relatorio.total.variacaoNoPeriodo)}
              hint={`${emPrecoKg(relatorio.total.primeiroPreco)} → ${emPrecoKg(relatorio.total.ultimoPreco)}`}
              tone={tomDaVariacao(relatorio.total.variacaoNoPeriodo)}
            />
          </div>
          {/* O preço médio da rede é PONDERADO, e a tela diz isso: a média das
              médias daria o mesmo peso a quem compra 300 kg e a quem compra
              6.000, e o número sai plausível. */}
          <p className="text-xs text-ink-500">
            Preço médio/kg = valor total ÷ kg totais — não é a média dos preços das notas.
          </p>

          {/* ── POR UNIDADE ── */}
          <Card>
            <CardContent className="pt-4">
              <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Por unidade</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left sgo-type-11 text-ink-500">
                      <th className="py-1.5 pr-2">Unidade</th>
                      <th className="py-1.5 pr-2 text-right">Notas</th>
                      <th className="py-1.5 pr-2 text-right">Kg</th>
                      <th className="py-1.5 pr-2 text-right">Valor</th>
                      <th className="py-1.5 pr-2 text-right">Médio/kg</th>
                      <th className="py-1.5 pr-2 text-right">Menor</th>
                      <th className="py-1.5 pr-2 text-right">Maior</th>
                      <th className="py-1.5 pr-2 text-right">Último</th>
                      <th className="py-1.5 text-right">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.unidades.map((u) => (
                      <tr key={u.unitId} className="border-b border-line last:border-0">
                        <td className="py-1.5 pr-2">
                          <Link href={linkDaUnidade(u.unitId)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline print:text-ink-900">
                            {u.unit}
                            <ChevronRight className="h-3.5 w-3.5 print:hidden" aria-hidden />
                          </Link>
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{u.notas}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{emKg(u.kg)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{emReal(u.valor)}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{emPrecoKg(u.precoMedio)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-ink-500">{emPrecoKg(u.menorPreco)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-ink-500">{emPrecoKg(u.maiorPreco)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{emPrecoKg(u.ultimoPreco)}</td>
                        <td className={`py-1.5 text-right font-semibold tabular-nums ${classeDaVariacao(u.variacaoNoPeriodo)}`}>
                          {emPercentual(u.variacaoNoPeriodo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line-strong font-semibold">
                      <td className="py-1.5 pr-2">Consolidado da rede</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{relatorio.total.notas}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{emKg(relatorio.total.kg)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{emReal(relatorio.total.valor)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-brand">{emPrecoKg(relatorio.total.precoMedio)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{emPrecoKg(relatorio.total.menorPreco)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{emPrecoKg(relatorio.total.maiorPreco)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{emPrecoKg(relatorio.total.ultimoPreco)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${classeDaVariacao(relatorio.total.variacaoNoPeriodo)}`}>
                        {emPercentual(relatorio.total.variacaoNoPeriodo)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-500 print:hidden">Toque numa unidade para ver todas as notas dela.</p>
            </CardContent>
          </Card>

          {/* ── DETALHAMENTO DA UNIDADE ABERTA ── */}
          {aberta && <DetalheDaUnidade unidade={aberta} voltarHref={`/modulos/gas/relatorio${qs ? `?${qs}` : ''}`} />}
        </>
      )}
    </div>
  );
}

function tomDaVariacao(v: number | null): 'default' | 'danger' | 'success' {
  if (v == null || v === 0) return 'default';
  /* Gás mais caro é ruim: a seta para cima aqui é vermelha, ao contrário de um
     indicador de venda. */
  return v > 0 ? 'danger' : 'success';
}

function classeDaVariacao(v: number | null): string {
  if (v == null || v === 0) return 'text-ink-500';
  return v > 0 ? 'text-danger' : 'text-success';
}

function DetalheDaUnidade({
  unidade,
  voltarHref,
}: {
  unidade: Awaited<ReturnType<typeof getRelatorioDeGas>>['unidades'][number];
  voltarHref: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="sgo-type-17 font-semibold text-ink-900">{unidade.unit}</p>
          <Link href={voltarHref} className="text-sm text-brand hover:underline print:hidden">Fechar detalhamento</Link>
        </div>
        <p className="mb-2 text-xs text-ink-500">
          {unidade.notas} nota(s) · {emKg(unidade.kg)} · {emReal(unidade.valor)} · médio {emPrecoKg(unidade.precoMedio)}
          {unidade.ancora != null && <> · a primeira linha compara com {emPrecoKg(unidade.ancora)}, a última compra antes do período</>}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left sgo-type-11 text-ink-500">
                <th className="py-1.5 pr-2">Data</th>
                <th className="py-1.5 pr-2">Fornecedor</th>
                <th className="py-1.5 pr-2 text-right">Kg</th>
                <th className="py-1.5 pr-2 text-right">Valor</th>
                <th className="py-1.5 pr-2 text-right">R$/kg</th>
                <th className="py-1.5 pr-2 text-right">Anterior</th>
                <th className="py-1.5 text-right">Variação</th>
              </tr>
            </thead>
            <tbody>
              {unidade.rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-2 tabular-nums">
                    {r.date}
                    {r.dateEdited && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-warning" title={`Data corrigida por ${r.dateEditedByName ?? 'Admin/Supervisão'}`}>
                        <PencilLine className="h-3 w-3" aria-hidden /> corrigida
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-ink-500">
                    {r.supplier}
                    {r.lancadoPor && <span className="block text-xs text-ink-400">{r.lancadoPor}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{emKg(r.kg)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{emReal(r.total)}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{emPrecoKg(r.price)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-ink-500">{emPrecoKg(r.prevPrice)}</td>
                  <td className={`py-1.5 text-right font-semibold tabular-nums ${classeDaVariacao(r.variationPct)}`}>
                    {emPercentual(r.variationPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
