import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { OccurrencesConfigAdmin } from '@/components/admin/occurrences-config-admin';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function OcorrenciasConfigPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;

  const types = await prisma.occurrenceType.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, active: true, isMaintenance: true, isIT: true,
      categories: { orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true, active: true } },
    },
  });

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Ocorrências — tipos e categorias" />
      <Card><CardContent className="pt-4">
        <OccurrencesConfigAdmin types={types} />
      </CardContent></Card>
    </div>
  );
}
