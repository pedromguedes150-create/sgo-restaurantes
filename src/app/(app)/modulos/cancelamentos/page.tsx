import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listCancellations, getReasons, getCancellationSummary } from '@/lib/cancellations/query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CancellationsClient } from '@/components/cancellations/cancellations-client';

export const dynamic = 'force-dynamic';

export default async function CancelamentosPage() {
  const user = (await getSessionUser())!;
  const yearMonth = new Date().toISOString().slice(0, 7);

  const [pending, reasons, summary, units] = await Promise.all([
    listCancellations(user, { status: 'PENDING' }),
    getReasons(),
    getCancellationSummary(user, yearMonth),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand">Cancelamento de Cupons</h1>

      {/* Resumo do mês */}
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-brand">{summary.monthTotal}</p><p className="text-xs text-muted-foreground">no mês</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-success">{summary.justifiedPct}%</p><p className="text-xs text-muted-foreground">justificados</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-critical">{summary.pending}</p><p className="text-xs text-muted-foreground">pendentes</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          <CancellationsClient
            isAdmin={user.role === 'ADMIN'}
            units={units}
            reasons={reasons.map((r) => ({ id: r.id, name: r.name }))}
            pending={pending.map((c) => ({ id: c.id, unit: c.unit.name, coupon: c.couponNumber, operator: c.cashOperator, value: Number(c.value) }))}
          />
        </CardContent>
      </Card>

      {summary.byOperator.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Ranking por operador (mês)</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {summary.byOperator.map((o, i) => (
              <div key={o.operator} className="flex justify-between text-sm">
                <span>{i + 1}. {o.operator}</span>
                <span className="font-semibold text-brand">{o.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
