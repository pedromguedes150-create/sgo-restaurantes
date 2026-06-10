import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = (await getSessionUser())!; // layout já garante autenticação

  // Escopo por unidade aplicado NO SERVIDOR (regra nº 3):
  // CEO/ADMIN veem todas; demais veem apenas as suas.
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-xl font-bold text-brand">Olá, {user.name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted-foreground">
          {user.seesAllUnits
            ? 'Você tem visão consolidada da rede.'
            : `Você gerencia ${units.length} unidade(s).`}
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Suas unidades</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {units.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>
          )}
          {units.map((u) => {
            const opDate = currentOperationalDate({
              timezone: u.timezone,
              cutoffHour: u.cutoffHour,
            });
            return (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border bg-surface px-3 py-2.5"
              >
                <div>
                  <p className="font-semibold text-brand">{u.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.code} · corte {String(u.cutoffHour).padStart(2, '0')}:00 · dia operacional{' '}
                    {opDate}
                  </p>
                </div>
                <StatusBadge tone="success">🟢 OK</StatusBadge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Próximos passos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Estrutura base (Fase 1) concluída: autenticação, perfis, escopo por unidade e data
            operacional. Os módulos operacionais (Checklists, Desperdícios, Ocorrências…) entram nas
            próximas fases.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
