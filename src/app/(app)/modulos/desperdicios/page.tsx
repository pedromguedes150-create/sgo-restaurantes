import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getActiveCategories, getEntryForDay, getWasteSeries, getCrossUnitWaste } from '@/lib/waste/query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WasteForm } from '@/components/waste/waste-form';
import { WasteDatePicker } from '@/components/waste/waste-date-picker';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';

export const dynamic = 'force-dynamic';

export default async function DesperdiciosPage({
  searchParams,
}: {
  searchParams: { unit?: string; date?: string };
}) {
  const user = (await getSessionUser())!;
  const now = new Date();

  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
  });

  if (units.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>;
  }

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const today = currentOperationalDate({ timezone: selected.timezone, cutoffHour: selected.cutoffHour }, now);
  const operationalDate = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) && searchParams.date <= today ? searchParams.date : today;
  const isBackdated = operationalDate !== today;

  const [categories, entry, series, wasteTemplate] = await Promise.all([
    getActiveCategories(),
    getEntryForDay(selected.id, operationalDate),
    getWasteSeries(selected.id, 30, now),
    prisma.taskTemplate.findFirst({
      where: { unitId: selected.id, module: 'WASTE', active: true },
      select: { requiresEvidence: true },
    }),
  ]);

  const canCompare = user.seesAllUnits || user.role === 'SUPERVISOR';
  const cross = canCompare ? await getCrossUnitWaste(user, 30, now) : [];
  const maxCat = Math.max(1, ...series.byCategory.map((c) => c.total));

  const isAdmin = user.role === 'ADMIN';
  const recent = isAdmin
    ? await prisma.wasteEntry.findMany({
        where: { unitId: selected.id },
        orderBy: { operationalDate: 'desc' },
        take: 30,
        include: { items: { select: { kg: true, category: { select: { name: true } } } }, createdBy: { select: { name: true } } },
      })
    : [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-brand">Desperdícios</h1>
          <p className="text-sm text-muted-foreground">Dia operacional {operationalDate}</p>
        </div>
        <a href={`/api/waste/export?unit=${selected.id}&year=${operationalDate.slice(0, 4)}&month=${Number(operationalDate.slice(5, 7))}`} className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-brand hover:border-accent">Exportar (Excel)</a>
      </div>

      {/* Seletor de unidade (compacto) */}
      {units.length > 1 && <UnitSelectNav units={units.map((u) => ({ id: u.id, name: u.name }))} selected={selected.id} />}

      {/* Lançamento do dia */}
      <Card>
        <CardHeader>
          <CardTitle>{isBackdated ? `Lançamento de ${operationalDate}` : 'Lançamento de hoje'} — {selected.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WasteDatePicker unitId={selected.id} date={operationalDate} max={today} />
          {isBackdated && <p className="rounded-lg bg-medium/10 px-3 py-2 text-xs font-medium text-[#92600A]">Lançando para um dia anterior ({operationalDate}).</p>}
          {entry?.createdBy && (
            <p className="mb-3 text-xs text-muted-foreground">
              Registrado por {entry.createdBy} · total atual {entry.total.toFixed(2)} KG
            </p>
          )}
          <WasteForm
            unitId={selected.id}
            operationalDate={operationalDate}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            initialKg={entry?.kgByCategory ?? {}}
            initialObservation={entry?.observation ?? null}
            requiresEvidence={Boolean(wasteTemplate?.requiresEvidence)}
            hasEvidence={Boolean(entry?.evidencePath)}
          />
        </CardContent>
      </Card>

      {/* Histórico de lançamentos (Admin: editar pelo seletor de dia / excluir) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de lançamentos (admin)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>}
            {recent.map((e) => {
              const total = e.items.reduce((s, i) => s + Number(i.kg), 0);
              return (
                <div key={e.id} className="rounded-lg border bg-card p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-brand">{e.operationalDate}</p>
                      <p className="text-xs text-muted-foreground">{total.toFixed(2)} KG · {e.items.length} categoria(s){e.createdBy ? ` · ${e.createdBy.name}` : ''}</p>
                    </div>
                    <DeleteOpButton entity="waste" id={e.id} label={`o desperdício de ${e.operationalDate}`} />
                  </div>
                  {e.items.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-accent">Ver itens lançados</summary>
                      <ul className="mt-1 space-y-0.5">
                        {e.items.map((i, idx) => (
                          <li key={idx} className="flex justify-between text-xs">
                            <span>{i.category?.name ?? 'Categoria'}</span>
                            <span className="font-medium">{Number(i.kg).toFixed(2)} KG</span>
                          </li>
                        ))}
                      </ul>
                      {e.observation && <p className="mt-1 text-xs text-muted-foreground">Obs.: {e.observation}</p>}
                    </details>
                  )}
                </div>
              );
            })}
            <p className="pt-1 text-xs text-muted-foreground">Para lançar/corrigir um dia específico, escolha a data no formulário acima.</p>
          </CardContent>
        </Card>
      )}

      {/* Mini-dashboard: barras por categoria (30 dias) */}
      <Card>
        <CardHeader>
          <CardTitle>Por categoria (30 dias)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total no período</span>
            <span className="font-bold text-brand">{series.grandTotal.toFixed(2)} KG</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Dias com registro</span>
            <span className="font-semibold">
              {series.daysWithRecord}/{series.windowDays} ({series.recordRatePct}%)
            </span>
          </div>
          <div className="space-y-2 pt-1">
            {series.byCategory.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            )}
            {series.byCategory.map((c) => (
              <div key={c.categoryId}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span>{c.name}</span>
                  <span className="font-semibold">{c.total.toFixed(1)} KG</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Comparativo entre unidades (Admin/CEO/Supervisor) */}
      {canCompare && cross.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comparativo entre unidades (30 dias)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cross.map((u) => (
              <div key={u.unitId} className="flex items-center justify-between text-sm">
                <span className="font-medium">{u.name}</span>
                <span className="text-muted-foreground">
                  {u.total.toFixed(1)} KG · {u.recordRatePct}% dias
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
