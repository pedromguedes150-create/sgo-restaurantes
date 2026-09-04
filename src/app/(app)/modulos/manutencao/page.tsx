import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listTickets, listPlans, getMaintenanceSummary } from '@/lib/maintenance';
import { MaintenanceClient } from '@/components/maintenance/maintenance-client';

export const dynamic = 'force-dynamic';

export default async function ManutencaoPage({ searchParams }: { searchParams: { view?: string } }) {
  const user = (await getSessionUser())!;
  const view = searchParams.view === 'preventiva' ? 'preventiva' : 'chamados';

  const [units, tickets, plans, summary, equipment, suppliers] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listTickets(user),
    listPlans(user),
    getMaintenanceSummary(user),
    prisma.inventoryItem.findMany({ where: { active: true, ...unitScopeWhere(user, 'unitId') }, orderBy: { name: 'asc' }, select: { id: true, name: true, unitId: true } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const unitName = new Map(units.map((u) => [u.id, u.name]));

  const ticketDtos = tickets.map((t) => ({
    id: t.id, number: t.number, unit: unitName.get(t.unitId) ?? '', title: t.title, description: t.description,
    equipmentName: t.equipmentName, supplierId: t.supplierId, supplierName: t.supplierName, status: t.status,
    cost: t.cost != null ? Number(t.cost) : null, deadline: t.deadline ? t.deadline.toISOString() : null,
    openedByName: t.openedByName, doneByName: t.doneByName, doneAt: t.doneAt ? t.doneAt.toISOString() : null, resolutionNote: t.resolutionNote,
  }));
  const planDtos = plans.map((p) => ({
    id: p.id, unit: unitName.get(p.unitId) ?? '', title: p.title, description: p.description, equipmentName: p.equipmentName,
    frequencyDays: p.frequencyDays, nextDueAt: p.nextDueAt.toISOString(), lastDoneAt: p.lastDoneAt ? p.lastDoneAt.toISOString() : null, active: p.active,
    logs: p.logs.map((l) => ({ doneAt: l.doneAt.toISOString(), doneByName: l.doneByName, note: l.note })),
  }));

  return (
    <MaintenanceClient
            abas={await abasDoPerfil(user.role, 'MAINTENANCE')}
      view={view}
      isAdmin={user.role === 'ADMIN'}
      units={units}
      equipment={equipment}
      suppliers={suppliers}
      summary={summary}
      tickets={ticketDtos}
      plans={planDtos}
    />
  );
}
