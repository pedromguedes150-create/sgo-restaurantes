import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { listRatesByUnit, listHolidays } from '@/lib/freelancer/pricing';
import { Card, CardContent } from '@/components/ui/card';
import { FreelancerRatesConfig } from '@/components/admin/freelancer-rates-config';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function FreelancerValoresPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-muted-foreground">Restrito ao Administrador.</p>;

  const [units, rates, holidays] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listRatesByUnit(),
    listHolidays(),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-brand">Valor do freelancer (por hora)</h1>
      <Card><CardContent className="pt-4">
        <FreelancerRatesConfig units={units} rates={rates} holidays={holidays.map((h) => ({ id: h.id, date: h.date, name: h.name }))} />
      </CardContent></Card>
    </div>
  );
}
