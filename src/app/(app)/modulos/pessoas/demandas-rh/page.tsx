import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { canEditModule } from '@/lib/permissions';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listarDemandas, TIPOS_DEMANDA, PRIORIDADES_DEMANDA } from '@/lib/rh/demandas';
import { DemandasRhClient } from '@/components/people/demandas-rh-client';

export const dynamic = 'force-dynamic';

/**
 * Demandas ao RH (v1.168.0). O gerente registra; a fila de saída envia; a
 * situação devolvida pelo RH aparece aqui. Sem detalhe técnico do envio —
 * isso fica em Configurações → Integrações → Envios ao RH (Admin).
 */
export default async function DemandasRhPage() {
  const user = (await getSessionUser())!;
  const [units, collaborators, rows, canCreate] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.collaborator.findMany({ where: { active: true, units: { some: { unit: { active: true, ...unitScopeWhere(user, 'id') } } } }, orderBy: { name: 'asc' }, select: { id: true, name: true, units: { select: { unitId: true } } } }),
    listarDemandas(user),
    canEditModule(user.role, 'RH_DEMANDS'),
  ]);
  const collaboratorsByUnit: Record<string, { id: string; name: string }[]> = {};
  for (const c of collaborators) for (const u of c.units) (collaboratorsByUnit[u.unitId] ??= []).push({ id: c.id, name: c.name });

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <DemandasRhClient canCreate={canCreate && units.length > 0} units={units} collaboratorsByUnit={collaboratorsByUnit} rows={rows} tipos={TIPOS_DEMANDA} prioridades={PRIORIDADES_DEMANDA} />
    </div>
  );
}
