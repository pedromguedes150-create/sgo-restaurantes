import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ArrowLeft, Eye } from 'lucide-react';
import { subDays, format } from 'date-fns';

export const dynamic = 'force-dynamic';

const ST: Record<string, { tone: 'success' | 'medium' | 'critical' | 'neutral'; label: string }> = {
  DONE: { tone: 'success', label: 'Concluída' },
  LATE: { tone: 'medium', label: 'Fora do prazo' },
  MISSED: { tone: 'critical', label: 'Não realizada' },
  PENDING: { tone: 'neutral', label: 'Pendente' },
};

export default async function HistoricoTarefasPage({ searchParams }: { searchParams: { unit?: string; days?: string } }) {
  const user = (await getSessionUser())!;
  const days = [7, 15, 30].includes(Number(searchParams.days)) ? Number(searchParams.days) : 7;
  const fromDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const selectedUnit = searchParams.unit && units.some((u) => u.id === searchParams.unit) ? searchParams.unit : undefined;

  const instances = await prisma.taskInstance.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(selectedUnit ? { unitId: selectedUnit } : {}),
      operationalDate: { gte: fromDate },
      status: { in: ['DONE', 'LATE', 'MISSED'] },
      ...(user.seesAllUnits ? {} : { OR: [{ assignedToId: null }, { assignedToId: user.id }] }),
    },
    orderBy: [{ operationalDate: 'desc' }, { completedAt: 'desc' }],
    take: 300,
    include: { template: { select: { name: true } }, unit: { select: { name: true } }, completedBy: { select: { name: true } } },
  });

  // agrupa por dia
  const byDate = new Map<string, typeof instances>();
  for (const i of instances) { const arr = byDate.get(i.operationalDate) ?? []; arr.push(i); byDate.set(i.operationalDate, arr); }

  const linkFor = (p: Record<string, string | number>) => {
    const sp = new URLSearchParams({ days: String(days), ...(selectedUnit ? { unit: selectedUnit } : {}), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) });
    return `/tarefas/historico?${sp.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Link href="/tarefas" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Tarefas</Link>
      <h1 className="text-xl font-bold text-brand">Histórico de checklists</h1>

      <div className="flex flex-wrap gap-2">
        {[7, 15, 30].map((d) => (
          <Link key={d} href={linkFor({ days: d })} className={d === days ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{d} dias</Link>
        ))}
        {units.length > 1 && (
          <>
            <Link href={linkFor({ unit: '' })} className={!selectedUnit ? 'rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold' : 'rounded-full border px-3 py-1.5 text-sm'}>Todas</Link>
            {units.map((u) => (
              <Link key={u.id} href={`/tarefas/historico?days=${days}&unit=${u.id}`} className={selectedUnit === u.id ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</Link>
            ))}
          </>
        )}
      </div>

      {byDate.size === 0 && <p className="text-sm text-muted-foreground">Nenhum registro no período.</p>}
      {[...byDate.entries()].map(([date, list]) => (
        <Card key={date}>
          <CardContent className="space-y-1.5 pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{date}</p>
            {list.map((i) => (
              <Link key={i.id} href={`/tarefas/${i.id}`} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5 transition-colors hover:border-accent">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand">{i.template.name}</p>
                  <p className="text-xs text-muted-foreground">{i.unit.name}{i.completedBy ? ` · ${i.completedBy.name}` : ''}</p>
                </div>
                <span className="flex items-center gap-2">
                  <StatusBadge tone={ST[i.status]?.tone ?? 'neutral'}>{ST[i.status]?.label ?? i.status}</StatusBadge>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
