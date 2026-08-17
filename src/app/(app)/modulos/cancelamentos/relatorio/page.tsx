import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { getCancellationsForExport, getCancellationSummary } from '@/lib/cancellations/query';
import { Card, CardContent } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { formatBRL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CancelamentosRelatorioPage({ searchParams }: { searchParams: { month?: string; unit?: string } }) {
  const user = (await getSessionUser())!;
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : new Date().toISOString().slice(0, 7);
  const unitId = searchParams.unit && canAccessUnit(user, searchParams.unit) ? searchParams.unit : undefined;

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const [rows, summary] = await Promise.all([
    getCancellationsForExport(user, month, unitId),
    getCancellationSummary(user, month),
  ]);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const exportHref = `/api/cancellations/export?month=${month}${unitId ? `&unit=${unitId}` : ''}`;
  const [yy, mm] = month.split('-');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/modulos/cancelamentos" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> Cancelamentos</Link>
        <div className="flex gap-2">
          <a href={exportHref} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-sunken"><Download className="h-4 w-4" /> Excel</a>
          <PrintButton label="PDF" />
        </div>
      </div>

      {units.length > 1 && (
        <div className="print:hidden">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Filtrar unidade</p>
          <UnitSelectNav units={[{ id: '', name: 'Todas as unidades' }, ...units]} selected={unitId ?? ''} />
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-ink-900">Relatório de Cancelamento de Cupons</h1>
        <p className="text-sm text-ink-500">Competência {mm}/{yy}{unitId ? ` · ${units.find((u) => u.id === unitId)?.name ?? ''}` : ' · todas as unidades'}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-ink-900">{summary.monthTotal}</p><p className="text-xs text-ink-500">cupons no mês</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-success">{summary.justifiedPct}%</p><p className="text-xs text-ink-500">justificados</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-danger">{summary.pending}</p><p className="text-xs text-ink-500">pendentes</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-ink-900">{formatBRL(totalValue)}</p><p className="text-xs text-ink-500">valor total</p></CardContent></Card>
      </div>

      <Card className="break-inside-avoid">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-sunken/40 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Unidade</th>
                <th className="px-3 py-2">Cupom</th>
                <th className="px-3 py-2">Operador</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-ink-500">Nenhum cupom no período.</td></tr>}
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-1.5 tabular-nums">{r.operationalDate.split('-').reverse().join('/')}</td>
                  <td className="px-3 py-1.5">{r.unit}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.coupon}</td>
                  <td className="px-3 py-1.5">{r.operator}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(r.value)}</td>
                  <td className="px-3 py-1.5">{r.status}</td>
                  <td className="px-3 py-1.5">{r.reason}{r.note ? ` — ${r.note}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {summary.byOperator.length > 0 && (
        <Card className="break-inside-avoid">
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-bold text-ink-900">Ranking por operador</p>
            <div className="space-y-1">
              {summary.byOperator.map((o, i) => (
                <div key={o.operator} className="flex justify-between text-sm">
                  <span>{i + 1}. {o.operator}</span>
                  <span className="font-semibold text-ink-900 tabular-nums">{o.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
