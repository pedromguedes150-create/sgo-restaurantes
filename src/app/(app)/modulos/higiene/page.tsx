import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listHygieneRequests, getHygieneAnalytics, listHygieneLocations } from '@/lib/hygiene';
import { Card, CardContent } from '@/components/ui/card';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { HygieneManageClient } from '@/components/hygiene/hygiene-manage-client';
import { Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HigienePage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;
  const selUnit = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const canManage = ['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role);

  const [requests, analytics, locations] = await Promise.all([
    listHygieneRequests(user, selUnit.id, 30),
    getHygieneAnalytics(user, selUnit.id, 30),
    listHygieneLocations(user, selUnit.id),
  ]);
  const peak = analytics && analytics.byHour.length ? analytics.byHour.reduce((a, b) => (b.count > a.count ? b : a)) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><Sparkles className="h-5 w-5 text-brand" /> Higiene dos banheiros</h1>
        <p className="text-sm text-ink-500">Solicitações do QR dos banheiros, com aviso ao gerente e análise. (WhatsApp em fase futura.)</p>
      </div>

      {units.length > 1 && <UnitSelectNav units={units} selected={selUnit.id} />}

      {analytics && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Solicitações (30d)" value={String(analytics.total)} />
          <Kpi label="Em aberto" value={String(analytics.open)} tone={analytics.open > 0 ? 'critical' : 'ok'} />
          <Kpi label="Resposta média" value={analytics.avgResponseMin != null ? `${analytics.avgResponseMin} min` : '—'} />
          <Kpi label="Horário de pico" value={peak ? `${String(peak.hour).padStart(2, '0')}h` : '—'} />
        </div>
      )}

      {analytics && analytics.byLocation.length > 0 && (
        <Card><CardContent className="pt-4">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Banheiros com mais solicitações (30d)</p>
          <div className="space-y-1.5">
            {analytics.byLocation.map((l) => {
              const max = analytics.byLocation[0].count || 1;
              return (
                <div key={l.name}>
                  <div className="mb-0.5 flex justify-between text-xs"><span>{l.name}</span><span className="font-semibold">{l.count}</span></div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${(l.count / max) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      )}

      <HygieneManageClient
        unitId={selUnit.id}
        canManage={canManage}
        requests={requests.map((r) => ({ id: r.id, locationName: r.locationName, issue: r.issue, rating: r.rating, comment: r.comment, status: r.status, resolvedByName: r.resolvedByName, createdAt: r.createdAt.toISOString(), resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name, active: l.active }))}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'critical' | 'ok' }) {
  return (
    <Card><CardContent className="py-3 text-center">
      <p className={`text-2xl font-black ${tone === 'critical' ? 'text-danger' : 'text-brand'}`}>{value}</p>
      <p className="text-xs text-ink-500">{label}</p>
    </CardContent></Card>
  );
}
