import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { UnitsAdmin } from '@/components/admin/units-admin';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';
import { ConferenciaRazoesRh } from '@/components/admin/razoes-rh';
import { listarRazoesAdicionais } from '@/lib/rh/razoes';

export const dynamic = 'force-dynamic';

export default async function UnidadesAdminPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
  const adicionais = await listarRazoesAdicionais(units.map((u) => u.id));

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Unidades" />
      <Card><CardContent className="pt-4">
        <UnitsAdmin units={units.map((u) => ({ id: u.id, name: u.name, code: u.code, address: u.address, cutoffHour: u.cutoffHour, timezone: u.timezone, active: u.active, rhUnitName: u.rhUnitName, cnpj: u.cnpj, hasPizzeria: u.hasPizzeria, operationType: u.operationType, operatingDays: u.operatingDays, rhAdicionais: adicionais.filter((a) => a.unitId === u.id).map((a) => ({ id: a.id, rhName: a.rhName, cnpj: a.cnpj, criterio: a.criterio, createdByName: a.createdByName })) }))} />
      </CardContent></Card>
      <Card><CardContent className="pt-4">
        <ConferenciaRazoesRh />
      </CardContent></Card>
    </div>
  );
}
