import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getOccurrenceTypes } from '@/lib/occurrences/query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OccurrenceForm } from '@/components/occurrences/occurrence-form';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function NovaOcorrenciaPage() {
  const user = (await getSessionUser())!;
  const [units, types] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    getOccurrenceTypes(),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/modulos/ocorrencias" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <LargeTitle title="Nova ocorrência" />
      <Card>
        <CardHeader>
          <CardTitle>Registro</CardTitle>
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <p className="text-sm text-ink-500">Você não tem unidades vinculadas.</p>
          ) : (
            <OccurrenceForm
              units={units}
              types={types.map((t) => ({ id: t.id, name: t.name, categories: t.categories }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
