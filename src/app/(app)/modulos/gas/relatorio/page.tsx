import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { getGasVariationReport } from '@/lib/gas/query';
import { Card, CardContent } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';
import { ArrowLeft, Download, TrendingUp, TrendingDown } from 'lucide-react';

export const dynamic = 'force-dynamic';

const kg = (n: number) => `R$ ${n.toFixed(4).replace('.', ',')}/kg`;

export default async function GasRelatorioPage() {
  const user = (await getSessionUser())!;
  const units = await getGasVariationReport(user, { months: 12 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/modulos/gas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Gás</Link>
        <div className="flex gap-2">
          <a href="/api/gas/export" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand"><Download className="h-4 w-4" /> Excel</a>
          <PrintButton label="PDF" />
        </div>
      </div>
      <h1 className="text-xl font-bold text-brand">Variação do preço do gás (R$/kg)</h1>
      <p className="text-sm text-ink-500">Histórico dos recebimentos (12 meses), com a variação do preço unitário a cada compra.</p>

      {units.length === 0 && <p className="text-sm text-ink-500">Nenhum recebimento no período.</p>}

      {units.map((u) => (
        <Card key={u.unitId} className="break-inside-avoid">
          <CardContent className="space-y-2 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-brand">{u.unit}</h2>
              <span className="text-xs text-ink-500">
                {u.rows.length} compra(s) · 1ª {u.first != null ? kg(u.first) : '—'} · última {u.last != null ? kg(u.last) : '—'} · mín {kg(u.min)} · máx {kg(u.max)} · méd {kg(u.avg)}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-ink-500">
                  <th className="py-1 pr-2">Data</th><th className="py-1 pr-2">Fornecedor</th><th className="py-1 pr-2 text-right">R$/kg</th><th className="py-1 text-right">Variação</th>
                </tr>
              </thead>
              <tbody>
                {u.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1 pr-2">{r.date}</td>
                    <td className="py-1 pr-2 text-ink-500">{r.supplier}</td>
                    <td className="py-1 pr-2 text-right font-semibold">{kg(r.price)}</td>
                    <td className={`py-1 text-right font-medium ${r.variationPct == null ? 'text-ink-500' : r.variationPct > 0 ? (r.alerted ? 'text-danger' : 'text-warning') : 'text-success'}`}>
                      {r.variationPct == null ? '—' : <>{r.variationPct > 0 ? <TrendingUp className="mr-0.5 inline h-3 w-3" /> : <TrendingDown className="mr-0.5 inline h-3 w-3" />}{r.variationPct > 0 ? '+' : ''}{r.variationPct}%</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
