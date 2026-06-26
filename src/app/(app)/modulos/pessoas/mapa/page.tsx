import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getWorkforceGrid, getAllocationBoard, listShifts, STANDARD_SECTORS } from '@/lib/workforce';
import { availabilityForDate } from '@/lib/schedule';
import { Card, CardContent } from '@/components/ui/card';
import { WorkforceClient } from '@/components/people/workforce-client';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MapaFuncoesPage({ searchParams }: { searchParams: { unit?: string; date?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>;

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const [grid, board, turnos] = await Promise.all([
    getWorkforceGrid(selected.id),
    getAllocationBoard(selected.id),
    listShifts(selected.id),
  ]);
  const existingSectorNames = grid.sectors.map((s) => s.name.toLowerCase());
  const suggestedSectors = STANDARD_SECTORS.filter((n) => !existingSectorNames.includes(n.toLowerCase()));

  const availDate = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : null;
  const availability = availDate ? await availabilityForDate(selected.id, availDate) : null;

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <h1 className="text-xl font-bold text-brand">Mapa de Funções</h1>
      <p className="text-sm text-muted-foreground">Setor × Horário × Colaborador, com cobertura 🟢 ok · 🟡 parcial · 🔴 sem cobertura.</p>

      {units.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {units.map((u) => (
            <Link key={u.id} href={`/modulos/pessoas/mapa?unit=${u.id}`} className={u.id === selected.id ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>{u.name}</Link>
          ))}
        </div>
      )}

      <Card><CardContent className="pt-4">
        <WorkforceClient
          unitId={selected.id}
          isAdmin={user.role === 'ADMIN'}
          grid={grid}
          board={board}
          turnos={turnos.map((t) => ({ id: t.id, name: t.name, startTime: t.startTime, endTime: t.endTime, active: t.active }))}
          suggestedSectors={suggestedSectors}
          availDate={availDate}
          availability={availability}
        />
      </CardContent></Card>
    </div>
  );
}
