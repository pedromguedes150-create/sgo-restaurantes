import Link from 'next/link';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getTrainingBoard, getTrainingWeight } from '@/lib/training';
import { Card, CardContent } from '@/components/ui/card';
import { TrainingBoard } from '@/components/training/training-board';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { permissaoDeRota } from '@/lib/permissions/links';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function TreinamentosPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const [board, weight, podeAbrir] = await Promise.all([getTrainingBoard(selected.id), getTrainingWeight(), permissaoDeRota(user.role)]);
  const veAcompanhamento = podeAbrir('/modulos/treinamentos/acompanhamento');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/modulos/pops" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> POPs</Link>
        {veAcompanhamento && (
          <Link href="/modulos/treinamentos/acompanhamento" className="inline-flex items-center gap-1 rounded-control border border-line-strong px-3 py-1.5 text-sm font-semibold text-brand hover:border-brand">
            <BarChart3 className="h-4 w-4" /> Acompanhamento da rede
          </Link>
        )}
      </div>
      <LargeTitle title="Treinamentos" />
      <FamilyTabs active="/modulos/treinamentos" />
      <p className="text-sm text-ink-500">Cada colaborador vê só o que deve realizar: os treinamentos gerais da unidade, os da sua função e os atribuídos a ele. Conta na meta (peso {weight}).</p>

      {units.length > 1 && <UnitSelectNav units={units} selected={selected.id} />}

      <Card><CardContent className="pt-4">
        <TrainingBoard isAdmin={user.role === 'ADMIN'} weight={weight} board={board} />
      </CardContent></Card>
    </div>
  );
}
