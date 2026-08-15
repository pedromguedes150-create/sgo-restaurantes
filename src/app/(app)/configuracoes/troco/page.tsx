import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { canEditModule } from '@/lib/permissions';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { Card, CardContent } from '@/components/ui/card';
import { CashDenominationsAdmin } from '@/components/admin/cash-denominations-admin';

export const dynamic = 'force-dynamic';

export default async function TrocoConfigPage() {
  const user = (await getSessionUser())!;
  if (!(await canEditModule(user.role, 'CASH_CONFIG'))) {
    return <p className="text-sm text-ink-500">Acesso restrito. A configuração do troco é liberada pela Supervisão/Administração (Configurações → Perfis de acesso).</p>;
  }

  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-sgo-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-sgo-brand">Troco — denominações por unidade</h1>
      {units.length === 0 ? (
        <Card><CardContent className="py-6 text-sm text-ink-500">Nenhuma unidade no seu escopo.</CardContent></Card>
      ) : (
        <Card><CardContent className="pt-4">
          <CashDenominationsAdmin units={units} isAdmin={user.role === 'ADMIN'} />
        </CardContent></Card>
      )}
    </div>
  );
}
