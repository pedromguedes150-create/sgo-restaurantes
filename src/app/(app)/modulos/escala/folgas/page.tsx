import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { listarFolgasDaUnidade } from '@/lib/schedule/folgas-lote';
import { FolgasLoteClient } from '@/components/schedule/folgas-lote-client';

export const dynamic = 'force-dynamic';

export default async function FolgasDaUnidadePage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;

  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  if (!selected) return <p className="text-sm text-ink-500">Nenhuma unidade no seu acesso.</p>;

  const [res, tipos] = await Promise.all([
    listarFolgasDaUnidade(user, selected.id),
    prisma.scheduleTemplate.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
  ]);
  if (!res.ok) return <p className="text-sm text-ink-500">Sem acesso a esta unidade.</p>;

  return (
    <div className="space-y-4">
      <Link href={`/modulos/escala?unit=${selected.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> Escala
      </Link>
      <LargeTitle title="Folgas da unidade" subtitle="O dia de folga de cada colaborador, numa tela só" />

      {tipos.length === 0 ? (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
          Nenhum tipo de escala cadastrado. Peça ao Admin para criar em <b>Configurações → Tipos de escala</b>.
        </p>
      ) : (
        <Card><CardContent className="pt-4">
          <FolgasLoteClient
            unitId={selected.id}
            unitName={selected.name}
            linhas={res.linhas}
            tipos={tipos.map((t) => ({ id: t.id, name: t.name, workDays: t.workDays, offDays: t.offDays }))}
          />
        </CardContent></Card>
      )}
    </div>
  );
}
