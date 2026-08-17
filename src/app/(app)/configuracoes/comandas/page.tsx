import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { CommandsConfigAdmin } from '@/components/admin/commands-config-admin';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function ComandasConfigPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;

  const [units, sequences] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.commandSequence.findMany({ orderBy: [{ order: 'asc' }, { rangeStart: 'asc' }], select: { id: true, unitId: true, name: true, rangeStart: true, rangeEnd: true, active: true } }),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Comandas — sequências por unidade" />
      <Card><CardContent className="pt-4">
        <CommandsConfigAdmin units={units} sequences={sequences} />
      </CardContent></Card>
    </div>
  );
}
