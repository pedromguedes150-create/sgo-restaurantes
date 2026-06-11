import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getMetaBreakdown, getMetaRanking } from '@/lib/metas/query';
import { getUnitMonthScore } from '@/lib/tasks/summary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MetasPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const ym = new Date().toISOString().slice(0, 7);

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' } });
  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];

  const isAdminView = user.seesAllUnits || user.role === 'SUPERVISOR';
  const ranking = isAdminView ? await getMetaRanking(user, ym) : [];
  const breakdown = selected ? await getMetaBreakdown(selected.id, ym) : [];
  const score = selected ? await getUnitMonthScore(selected.id, ym) : null;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand">Metas e Performance</h1>
      <p className="text-sm text-muted-foreground">Mês {ym}</p>

      {isAdminView && ranking.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-accent" /> Ranking de metas</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {ranking.map((r, i) => (
              <div key={r.unitId} className="flex justify-between text-sm">
                <span>{i + 1}. {r.name}</span>
                <span className="font-bold text-brand">{r.scorePct}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {units.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {units.map((u) => (
            <a key={u.id} href={`/modulos/metas?unit=${u.id}`} className={u.id === selected?.id ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>{u.name}</a>
          ))}
        </div>
      )}

      {selected && score && (
        <Card>
          <CardHeader><CardTitle>{isAdminView ? selected.name : 'Minha Meta do Mês'} — {score.scorePct}%</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-accent" style={{ width: `${score.scorePct}%` }} />
            </div>
            <div className="space-y-2">
              {breakdown.length === 0 && <p className="text-sm text-muted-foreground">Sem tarefas resolvidas no mês ainda.</p>}
              {breakdown.map((t) => (
                <div key={t.name}>
                  <div className="flex justify-between text-sm">
                    <span>{t.name} <span className="text-xs text-muted-foreground">(peso {t.weight})</span></span>
                    <span className="font-semibold">{t.done}/{t.resolved} · {t.scorePct}%</span>
                  </div>
                  <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-success" style={{ width: `${t.scorePct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
