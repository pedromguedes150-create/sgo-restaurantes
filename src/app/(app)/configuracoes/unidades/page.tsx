import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { UnitsAdmin } from '@/components/admin/units-admin';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function UnidadesAdminPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-muted-foreground">Restrito ao Administrador.</p>;
  const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-brand">Unidades</h1>
      <Card><CardContent className="pt-4">
        <UnitsAdmin units={units.map((u) => ({ id: u.id, name: u.name, code: u.code, cutoffHour: u.cutoffHour, timezone: u.timezone, active: u.active, rhUnitName: u.rhUnitName }))} />
      </CardContent></Card>
    </div>
  );
}
