import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getWorkforceGrid } from '@/lib/workforce';
import { Card, CardContent } from '@/components/ui/card';
import { WorkforceClient } from '@/components/people/workforce-client';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MapaFuncoesPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>;

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const [grid, collaborators] = await Promise.all([
    getWorkforceGrid(selected.id),
    prisma.collaborator.findMany({ where: { active: true, units: { some: { unitId: selected.id } } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

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
        <WorkforceClient unitId={selected.id} isAdmin={user.role === 'ADMIN'} grid={grid} collaborators={collaborators} />
      </CardContent></Card>
    </div>
  );
}
