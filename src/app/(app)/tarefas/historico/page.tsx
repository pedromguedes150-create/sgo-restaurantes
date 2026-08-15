import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { parseUnitParam } from '@/lib/scope/unit-param';
import { ChecklistHistoryList, type HistGroup } from '@/components/tasks/checklist-history-list';
import { UnitFilter } from '@/components/ui/unit-filter';
import { ArrowLeft } from 'lucide-react';
import { subDays, format } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function HistoricoTarefasPage({ searchParams }: { searchParams: { unit?: string; days?: string } }) {
  const user = (await getSessionUser())!;
  const isAdmin = user.role === 'ADMIN';
  const days = [7, 15, 30].includes(Number(searchParams.days)) ? Number(searchParams.days) : 7;
  const fromDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const unitFilter = parseUnitParam(searchParams.unit, units.map((u) => u.id));

  const instances = await prisma.taskInstance.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(unitFilter.all ? {} : { unitId: { in: unitFilter.ids } }),
      operationalDate: { gte: fromDate },
      status: { in: ['DONE', 'LATE', 'MISSED'] },
      ...(user.seesAllUnits ? {} : { OR: [{ assignedToId: null }, { assignedToId: user.id }] }),
    },
    orderBy: [{ operationalDate: 'desc' }, { completedAt: 'desc' }],
    take: 300,
    include: { template: { select: { name: true } }, unit: { select: { name: true } }, completedBy: { select: { name: true } } },
  });

  // agrupa por dia (formato serializável para o componente cliente)
  const byDate = new Map<string, HistGroup>();
  for (const i of instances) {
    const g = byDate.get(i.operationalDate) ?? { date: i.operationalDate, items: [] };
    g.items.push({ id: i.id, name: i.template.name, unit: i.unit.name, by: i.completedBy?.name ?? null, time: i.completedAt ? new Date(i.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : null, status: i.status });
    byDate.set(i.operationalDate, g);
  }
  const groups: HistGroup[] = [...byDate.values()];

  const linkForDays = (d: number) => {
    const sp = new URLSearchParams({ days: String(d), ...(unitFilter.all ? {} : { unit: unitFilter.ids.join(',') }) });
    return `/tarefas/historico?${sp.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Link href="/tarefas" className="inline-flex items-center gap-1 text-sm font-semibold text-sgo-brand"><ArrowLeft className="h-4 w-4" /> Tarefas</Link>
      <h1 className="text-xl font-bold text-sgo-brand">Histórico de checklists</h1>

      <div className="flex flex-wrap items-center gap-2">
        {[7, 15, 30].map((d) => (
          <Link key={d} href={linkForDays(d)} className={d === days ? 'rounded-full bg-sgo-brand px-3 py-1.5 text-sm font-semibold text-on-brand' : 'rounded-full border px-3 py-1.5 text-sm'}>{d} dias</Link>
        ))}
        {units.length > 1 && <UnitFilter units={units} selected={unitFilter.all ? [] : unitFilter.ids} />}
      </div>

      <ChecklistHistoryList groups={groups} isAdmin={isAdmin} groupByUnit={units.length > 1} />
    </div>
  );
}
