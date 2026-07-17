import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getUnitDayMap, getAllocationBoard, getDayFreelancers, getSnapshotGrid, listShifts, STANDARD_SECTORS, type WorkforceGrid , getSimulation } from '@/lib/workforce';
import { availabilityForDate } from '@/lib/schedule';
import { Card, CardContent } from '@/components/ui/card';
import { WorkforceClient } from '@/components/people/workforce-client';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MapaFuncoesPage({ searchParams }: { searchParams: { unit?: string; date?: string; hora?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true, timezone: true } });
  if (units.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>;

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const tz = selected.timezone || 'America/Sao_Paulo';

  // "Hoje" e "agora" no fuso da unidade
  const now = new Date();
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [hh, mm] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':').map(Number);
  const nowMinutes = hh * 60 + mm;

  const selectedDate = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : todayISO;
  const isToday = selectedDate === todayISO;
  const isPast = selectedDate < todayISO;
  const isFuture = selectedDate > todayISO;

  // Horário escolhido (HH:MM). Vazio = dia inteiro (ou "agora", se for hoje).
  const horaMatch = /^(\d{2}):(\d{2})$/.exec(searchParams.hora ?? '');
  const horaMinutes = horaMatch ? Number(horaMatch[1]) * 60 + Number(horaMatch[2]) : null;
  const mapTime = horaMatch && horaMinutes != null && horaMinutes >= 0 && horaMinutes < 24 * 60 ? searchParams.hora! : '';
  const filterMinutes = mapTime ? horaMinutes : (isToday ? nowMinutes : null);
  const isNow = isToday && !mapTime;

  const simulation = isFuture ? await getSimulation(selected.id, selectedDate) : null;
  const [board, turnos, availability] = await Promise.all([
    getAllocationBoard(selected.id),
    listShifts(selected.id),
    availabilityForDate(selected.id, selectedDate),
  ]);

  // Dia passado SEM horário específico → snapshot congelado (histórico imutável).
  // Com horário (ou hoje/futuro) → deriva da Escala (realizado no passado, planejado no futuro = projeção).
  let grid: WorkforceGrid | null = (isPast && !mapTime) ? await getSnapshotGrid(selected.id, selectedDate) : null;
  const historical = grid != null;
  let freelancers: Awaited<ReturnType<typeof getDayFreelancers>> = [];
  if (!grid) {
    [grid, freelancers] = await Promise.all([
      getUnitDayMap(selected.id, selectedDate, filterMinutes),
      getDayFreelancers(selected.id, selectedDate, filterMinutes),
    ]);
  }
  const safeGrid = grid as WorkforceGrid;
  const existingSectorNames = safeGrid.sectors.map((s) => s.name.toLowerCase());
  const suggestedSectors = STANDARD_SECTORS.filter((n) => !existingSectorNames.includes(n.toLowerCase()));

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <h1 className="text-xl font-bold text-brand">Mapa de Funções</h1>
      <p className="text-sm text-muted-foreground">Monte o <b>quadro padrão</b> uma vez; o <b>mapa da unidade</b> mostra automaticamente quem está trabalhando agora (segue a Escala). Cobertura 🟢 ok · 🟡 parcial · 🔴 sem cobertura.</p>

      {units.length > 1 && <UnitSelectNav units={units.map((u) => ({ id: u.id, name: u.name }))} selected={selected.id} />}

      <Card><CardContent className="pt-4">
        <WorkforceClient
          unitId={selected.id}
          isAdmin={user.role === 'ADMIN'}
          grid={safeGrid}
          board={board}
          historical={historical}
          turnos={turnos.map((t) => ({ id: t.id, name: t.name, startTime: t.startTime, endTime: t.endTime, active: t.active }))}
          suggestedSectors={suggestedSectors}
          mapDate={selectedDate}
          mapTime={mapTime}
          todayISO={todayISO}
          isToday={isToday}
          isFuture={isFuture}
          isNow={isNow}
          availability={availability}
          simulation={simulation ? { assignments: (simulation.assignments as { collaboratorId: string; name: string; sectorId: string; sectorName: string }[]) ?? [], note: simulation.note, by: simulation.createdByName, at: simulation.updatedAt.toISOString() } : null}
          freelancers={freelancers}
        />
      </CardContent></Card>
    </div>
  );
}
