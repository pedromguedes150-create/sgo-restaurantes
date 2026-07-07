import { Banknote } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getCashOverview, getCashDashboard } from '@/lib/cash';
import { Card, CardContent } from '@/components/ui/card';
import { CashClient } from '@/components/cash/cash-client';

export const dynamic = 'force-dynamic';

export default async function TrocoPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>;
  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const wide = user.role === 'ADMIN' || user.role === 'CEO' || user.role === 'SUPERVISOR';
  const [overview, dash] = await Promise.all([
    getCashOverview(user, selected.id),
    wide ? getCashDashboard(user, yearMonth) : Promise.resolve(null),
  ]);
  if (!overview) return <p className="text-sm text-muted-foreground">Sem acesso a esta unidade.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><Banknote className="h-5 w-5 text-accent" /> Gestão de Troco</h1>
        <p className="text-sm text-muted-foreground">Caixas em cadeia: o fechamento de um é a abertura esperada do próximo. Diferença na contagem gera alerta à supervisão.</p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <CashClient
            units={units}
            selectedUnitId={selected.id}
            openSession={overview.openSession}
            lastClosing={overview.lastClosing}
            today={overview.today}
            history={overview.history}
            month={overview.month}
            dash={dash}
            canOperate={user.role !== 'FINANCE' && user.role !== 'CEO'}
            isAdmin={user.role === 'ADMIN'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
