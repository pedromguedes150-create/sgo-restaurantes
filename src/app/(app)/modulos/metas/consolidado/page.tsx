import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { permissaoDeRota } from '@/lib/permissions/links';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getMetaRanking } from '@/lib/metas/query';
import { calcularStats, getPioresMetas } from '@/lib/metas/consolidado';
import { ConsolidadoRedeClient } from '@/components/metas/consolidado-rede-client';
import { LargeTitle } from '@/components/layout/page-chrome';
import { FamilyTabs } from '@/components/layout/family-tabs';

export const dynamic = 'force-dynamic';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function lastMonths(n: number): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    out.push({ value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}` });
  }
  return out;
}

export default async function ConsolidadoPage({ searchParams }: { searchParams: { month?: string } }) {
  const user = (await getSessionUser())!;

  // Only Admin/CEO/Supervisor see this page
  const podeVer = await permissaoDeRota(user.role);
  if (!podeVer('/modulos/metas/consolidado')) redirect('/modulos/metas');

  const months = lastMonths(12);
  const ym = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : months[0].value;
  const monthLabel = months.find((m) => m.value === ym)?.label ?? ym;

  const [ranking, pioresMetas, units] = await Promise.all([
    getMetaRanking(user, ym),
    getPioresMetas(user, ym),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const stats = calcularStats(ranking);

  return (
    <div className="space-y-5">
      <LargeTitle
        title="Consolidado da Rede"
        subtitle={`Mês ${monthLabel}`}
        actions={
          <div className="flex gap-2 print:hidden">
            <FamilyTabs active="/modulos/metas/consolidado" />
          </div>
        }
      />

      {/* Month selector */}
      <div className="max-w-xs print:hidden">
        <p className="sgo-type-11 mb-1 text-ink-500">Mês de referência</p>
        <select
          name="month"
          defaultValue={ym}
          onChange={undefined}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink-900"
          aria-label="Mês de referência"
          form="month-form"
        />
        {/* Client-side month switch via link */}
        <div className="mt-1 flex flex-wrap gap-1">
          {months.slice(0, 6).map((m) => (
            <a
              key={m.value}
              href={`/modulos/metas/consolidado?month=${m.value}`}
              className={`rounded-pill px-2.5 py-0.5 text-xs font-medium transition-colors ${
                m.value === ym ? 'bg-brand text-white' : 'bg-sunken text-ink-500 hover:bg-canvas'
              }`}
            >
              {m.label.split('/')[0].slice(0, 3)}/{m.label.split('/')[1].slice(2)}
            </a>
          ))}
        </div>
      </div>

      <ConsolidadoRedeClient
        ranking={ranking}
        stats={stats}
        pioresMetas={pioresMetas}
        month={ym}
        monthLabel={monthLabel}
        unidadesDisponiveis={units}
      />
    </div>
  );
}
