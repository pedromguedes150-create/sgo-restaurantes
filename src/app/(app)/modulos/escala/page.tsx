import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getScheduleGrid } from '@/lib/schedule';
import { listShifts } from '@/lib/workforce';
import { Card, CardContent } from '@/components/ui/card';
import { ScheduleClient } from '@/components/schedule/schedule-client';
import { ArrowLeft, ArrowRightLeft, BellRing } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function EscalaPage({ searchParams }: { searchParams: { unit?: string; year?: string; month?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const now = new Date();
  const year = Number(searchParams.year) || now.getFullYear();
  const month = Number(searchParams.month) || now.getMonth() + 1;

  const [grid, collaborators, turnos] = await Promise.all([
    getScheduleGrid(selected.id, year, month),
    prisma.collaborator.findMany({ where: { active: true, units: { some: { unitId: selected.id } } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listShifts(selected.id),
  ]);

  // padrão atual por colaborador (p/ a tela de cadastro de escala)
  const patterns = await prisma.employeeSchedule.findMany({ where: { unitId: selected.id, active: true }, select: { collaboratorId: true, scheduleType: true, anchorDate: true, shiftId: true, customMask: true } });

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
        <div>
          <LargeTitle title="Escala de funcionários" subtitle="Controle de presença mensal — Planejado, Realizado e Comparação." />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/modulos/escala/trocas?unit=${selected.id}`} className="inline-flex items-center gap-1.5 rounded-lg border bg-surface px-3 py-2 text-sm font-semibold text-brand transition-colors hover:border-brand">
            <ArrowRightLeft className="h-4 w-4 text-brand" /> Trocas de escala (RH)
          </Link>
          <Link href={`/modulos/escala/avisos-rh?unit=${selected.id}`} className="inline-flex items-center gap-1.5 rounded-lg border bg-surface px-3 py-2 text-sm font-semibold text-brand transition-colors hover:border-brand">
            <BellRing className="h-4 w-4 text-brand" /> Avisos ao RH
          </Link>
        </div>
      </div>

      <Card><CardContent className="pt-4">
        <ScheduleClient
          units={units}
          selectedUnitId={selected.id}
          year={year}
          month={month}
          grid={grid}
          collaborators={collaborators}
          turnos={turnos.map((t) => ({ id: t.id, name: t.name, startTime: t.startTime, endTime: t.endTime }))}
          patterns={patterns.map((p) => ({ collaboratorId: p.collaboratorId, scheduleType: p.scheduleType, anchorDate: p.anchorDate.toISOString().slice(0, 10), shiftId: p.shiftId, customMask: p.customMask }))}
        />
      </CardContent></Card>
    </div>
  );
}
