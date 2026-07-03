import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getUnitCommandState } from '@/lib/commands/query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CommandsClient } from '@/components/commands/commands-client';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';

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

  const isAdmin = user.role === 'ADMIN';
  const [recentCounts, recentDivs] = isAdmin
    ? await Promise.all([
        prisma.commandCount.findMany({ where: { unitId: selected.id }, orderBy: { operationalDate: 'desc' }, take: 20, include: { createdBy: { select: { name: true } } } }),
        prisma.commandDivergence.findMany({ where: { unitId: selected.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ])
    : [[], []];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-brand">Contagem de Comandas</h1>
        <p className="text-sm text-muted-foreground">Dia operacional {operationalDate}</p>
      </div>

      {units.length > 1 && <UnitSelectNav units={units.map((u) => ({ id: u.id, name: u.name }))} selected={selected.id} />}

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

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Lançamentos (admin)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Contagens diárias</p>
              {recentCounts.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma contagem.</p>}
              {recentCounts.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border bg-card p-2.5">
                  <div>
                    <p className="text-sm font-semibold text-brand">{c.operationalDate}</p>
                    <p className="text-xs text-muted-foreground">{c.allPresent ? 'todas presentes' : `${c.absentCount} ausente(s)`}{c.createdBy ? ` · ${c.createdBy.name}` : ''}</p>
                  </div>
                  <DeleteOpButton entity="commandCount" id={c.id} label={`a contagem de ${c.operationalDate}`} />
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Divergências</p>
              {recentDivs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma divergência.</p>}
              {recentDivs.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border bg-card p-2.5">
                  <div>
                    <p className="text-sm font-semibold text-brand">Comanda nº {d.number}</p>
                    <p className="text-xs text-muted-foreground">{d.status}{d.observation ? ` · ${d.observation}` : ''}</p>
                  </div>
                  <DeleteOpButton entity="commandDivergence" id={d.id} label={`a divergência da comanda ${d.number}`} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
