import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getUnitCommandState } from '@/lib/commands/query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CommandsClient } from '@/components/commands/commands-client';

export const dynamic = 'force-dynamic';

export default async function ComandasPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const now = new Date();

  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
  });
  if (units.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>;

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const operationalDate = currentOperationalDate({ timezone: selected.timezone, cutoffHour: selected.cutoffHour }, now);
  const state = await getUnitCommandState(selected.id, operationalDate);

  const canResolve = user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-brand">Contagem de Comandas</h1>
        <p className="text-sm text-muted-foreground">Dia operacional {operationalDate}</p>
      </div>

      {units.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/modulos/comandas?unit=${u.id}`}
              className={u.id === selected.id ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}
            >
              {u.name}
            </Link>
          ))}
        </div>
      )}

      {state.config && (
        <Card>
          <CardContent className="grid grid-cols-3 gap-2 py-3 text-center text-sm">
            <div>
              <p className="text-xl font-black text-brand">{state.activeCount}</p>
              <p className="text-xs text-muted-foreground">ativas</p>
            </div>
            <div>
              <p className="text-xl font-black text-brand">{state.replacementCount}</p>
              <p className="text-xs text-muted-foreground">reposições</p>
            </div>
            <div>
              <p className="text-xl font-black text-critical">{state.lostCount}</p>
              <p className="text-xs text-muted-foreground">baixas</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{selected.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <CommandsClient
            unitId={selected.id}
            canResolve={canResolve}
            isAdmin={user.role === 'ADMIN'}
            hasConfig={Boolean(state.config)}
            todayDone={Boolean(state.todayCount)}
            openDivergences={state.openDivergences.map((d) => ({
              id: d.id,
              number: d.number,
              status: d.status as 'OPEN' | 'INVESTIGATING' | 'CLOSED',
              observation: d.observation,
              reporter: d.reporter?.name ?? null,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
