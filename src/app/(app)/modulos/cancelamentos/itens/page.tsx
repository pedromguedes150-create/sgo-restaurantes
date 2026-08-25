import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { StatCard } from '@/components/ui/ds/stat-card';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getItemReasons, listItemCancellations, getItemCancelSummary } from '@/lib/cancellations/items';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ItemCancellationsClient } from '@/components/cancellations/item-cancellations-client';
import { LargeTitle } from '@/components/layout/page-chrome';
import { formatBRL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CancelamentoDeItensPage() {
  const user = (await getSessionUser())!;
  const yearMonth = new Date().toISOString().slice(0, 7);

  const [reasons, rows, summary, units] = await Promise.all([
    getItemReasons(),
    listItemCancellations(user, { yearMonth }),
    getItemCancelSummary(user, yearMonth),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-5">
      <Link href="/modulos/cancelamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> Cancelamento de Cupons
      </Link>

      <LargeTitle
        title="Cancelamento de itens"
        subtitle="Itens retirados do pedido antes de virar cupom"
      />

      {/* O VALOR COM PRODUTO JÁ ENTREGUE vem destacado: cancelar antes de o
          produto sair custa zero, e um total único esconderia a parte que dói. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="no mês" value={summary.total} />
        <StatCard label="valor cancelado" value={formatBRL(summary.value)} />
        <StatCard label="já entregues" value={summary.deliveredCount} tone={summary.deliveredCount > 0 ? 'danger' : undefined} />
        <StatCard label="valor já entregue" value={formatBRL(summary.deliveredValue)} tone={summary.deliveredValue > 0 ? 'danger' : undefined} />
      </div>

      {(summary.byWaiter.length > 0 || summary.byReason.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Por garçom</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {summary.byWaiter.slice(0, 10).map((w) => (
                <div key={w.name} className="flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate text-ink-700">{w.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-500">{w.count} · {formatBRL(w.value)}</span>
                </div>
              ))}
              {summary.byWaiter.length === 0 && <p className="text-sm text-ink-500">Sem registros no mês.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Por motivo</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {summary.byReason.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate text-ink-700">{m.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-500">{m.count}</span>
                </div>
              ))}
              {summary.byReason.length === 0 && <p className="text-sm text-ink-500">Sem registros no mês.</p>}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <ItemCancellationsClient
            units={units}
            reasons={reasons.map((r) => ({ id: r.id, name: r.name }))}
            rows={rows.map((r) => ({
              id: r.id,
              unit: r.unit.name,
              product: r.productName,
              quantity: Number(r.quantity),
              value: Number(r.value),
              waiter: r.waiterName,
              table: r.tableLabel,
              reason: r.reason?.name ?? null,
              delivered: r.delivered,
              photo: r.photoPath,
              canceledAt: r.canceledAt.toISOString(),
              authorizedBy: r.authorizedBy?.name ?? null,
              note: r.note,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
