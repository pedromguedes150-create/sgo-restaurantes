import Link from 'next/link';
import { ArrowLeft, ArrowRightLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listScheduleChanges } from '@/lib/schedule-changes';
import { Card, CardContent } from '@/components/ui/card';
import { ScheduleChangesClient } from '@/components/schedule/schedule-changes-client';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function TrocasPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;
  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];

  const [rows, collabs] = await Promise.all([
    listScheduleChanges(user),
    prisma.collaborator.findMany({ where: { active: true, units: { some: { unitId: selected.id } } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/modulos/escala" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Escala</Link>
      <div>
        <LargeTitle title="Trocas de escala (RH)" subtitle="Registre as trocas para informar o RH — os Admins são avisados a cada registro. (A troca em si você lança na Escala, aba Realizado.)" />
      </div>
      <Card>
        <CardContent className="pt-4">
          <ScheduleChangesClient
            rows={rows}
            units={units}
            selectedUnitId={selected.id}
            collabs={collabs}
            canCreate={user.role !== 'FINANCE' && user.role !== 'CEO'}
            isAdmin={user.role === 'ADMIN'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
