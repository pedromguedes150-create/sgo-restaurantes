import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { CommandsConfigAdmin } from '@/components/admin/commands-config-admin';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ComandasConfigPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-muted-foreground">Restrito ao Administrador.</p>;

  const units = await prisma.unit.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, commandConfig: { select: { rangeStart: true, rangeEnd: true } } },
  });

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-brand">Comandas — sequência por unidade</h1>
      <Card><CardContent className="pt-4">
        <CommandsConfigAdmin units={units.map((u) => ({ id: u.id, name: u.name, rangeStart: u.commandConfig?.rangeStart ?? null, rangeEnd: u.commandConfig?.rangeEnd ?? null }))} />
      </CardContent></Card>
    </div>
  );
}
