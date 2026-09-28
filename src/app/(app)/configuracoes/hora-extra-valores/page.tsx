import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { listOvertimeRatesByUnit } from '@/lib/overtime/rates';
import { Card, CardContent } from '@/components/ui/card';
import { OvertimeRatesConfig } from '@/components/admin/overtime-rates-config';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

/** Valores de Hora Extra por unidade (v1.130.0) — mesma porta da configuração do freelancer: só Admin. */
export default async function HoraExtraValoresPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;

  const [units, rates] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listOvertimeRatesByUnit(),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Valor da hora extra (por hora)" subtitle="Os valores/hora autorizados em cada unidade. Regra própria da Hora Extra — o freelancer continua com o valor por tipo de dia." />
      <Card><CardContent className="pt-4">
        <OvertimeRatesConfig units={units} rates={rates} />
      </CardContent></Card>
    </div>
  );
}
