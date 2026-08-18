import Link from 'next/link';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { getSessionUser } from '@/lib/auth/session';
import { effectivePermissions } from '@/lib/permissions';
import { getTeamLeaves } from '@/lib/manager-area';
import { getManagerCoverageCalendar } from '@/lib/manager-schedule';
import { ManagerCalendar } from '@/components/people/manager-calendar';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';
import { PeriodPicker } from '@/components/ui/ds/period-picker';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { shortUnitName } from '@/lib/unit-name';
import { CalendarOff } from 'lucide-react';

export const dynamic = 'force-dynamic';

function monthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}
const fmtBR = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export default async function FolgasEquipePage({ searchParams }: { searchParams: { start?: string; end?: string; view?: string; ano?: string; mes?: string } }) {
  const user = (await getSessionUser())!;
  const perms = await effectivePermissions(user.role);
  if (!perms.LEAVES_TEAM?.canView) {
    return <p className="text-sm text-ink-500">Acesso restrito. O Controle de gerentes é liberado pela Supervisão/Administração (Configurações → Perfis de acesso).</p>;
  }

  const isCal = searchParams.view === 'calendario';
  const now = new Date();
  const year = Number(searchParams.ano) || now.getFullYear();
  const month = Math.min(12, Math.max(1, Number(searchParams.mes) || now.getMonth() + 1));
  const prevM = month === 1 ? { a: year - 1, m: 12 } : { a: year, m: month - 1 };
  const nextM = month === 12 ? { a: year + 1, m: 1 } : { a: year, m: month + 1 };

  const header = (
    <div className="space-y-3">
      <LargeTitle
        title="Controle de gerentes"
        subtitle="Folgas, férias e cobertura de gerência por unidade. Escopo: suas unidades."
      />
      <FamilyTabs active="/modulos/folgas-equipe" />
      <SegmentedNav
        aria-label="Visão"
        value={isCal ? 'calendario' : 'folgas'}
        options={[
          { value: 'folgas', label: 'Folgas / férias', href: '/modulos/folgas-equipe' },
          { value: 'calendario', label: 'Calendário de gerentes', href: '/modulos/folgas-equipe?view=calendario' },
        ]}
      />
    </div>
  );

  if (isCal) {
    const cal = await getManagerCoverageCalendar(user, year, month);
    return (
      <div className="space-y-4">
        {header}
        <div className="flex items-center justify-between rounded-lg border border-dashed p-2">
          <Link href={`/modulos/folgas-equipe?view=calendario&ano=${prevM.a}&mes=${prevM.m}`} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">← anterior</Link>
          <span className="text-sm font-bold text-ink-900">{MONTHS[month - 1]} de {year}</span>
          <Link href={`/modulos/folgas-equipe?view=calendario&ano=${nextM.a}&mes=${nextM.m}`} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">próximo →</Link>
        </div>
        <p className="text-xs text-ink-500">Baseado no horário de trabalho que cada gerente cadastra em <b>Minha área → Folgas / férias</b>, menos folgas e férias. Dias em vermelho = unidade sem gerente (realocar reserva).{user.role === 'ADMIN' || user.role === 'CEO' ? ' Como admin, você pode cadastrar/editar o horário de cada gerente clicando em “Editar horário”.' : ''}</p>
        <ManagerCalendar data={cal} isAdmin={user.role === 'ADMIN' || user.role === 'CEO'} />
      </div>
    );
  }

  const def = monthRange();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const start = re.test(searchParams.start ?? '') ? searchParams.start! : def.start;
  const end = re.test(searchParams.end ?? '') && searchParams.end! >= start ? searchParams.end! : def.end;

  const data = await getTeamLeaves(user, start, end);

  return (
    <div className="space-y-4">
      {header}

      {/* Período por ATALHO: o gestor quase sempre quer "este mês" ou "próximos
          30 dias" — digitar duas datas para isso era trabalho à toa. O intervalo
          exato continua acessível em "Escolher datas". */}
      <PeriodPicker start={start} end={end} basePath="/modulos/folgas-equipe" />

      <p className="text-[13px] tabular-nums text-ink-500">{data.total} registro(s) entre {fmtBR(start)} e {fmtBR(end)}.</p>

      {data.groups.length === 0 && (
        <EmptyState icon={CalendarOff} title="Nenhuma folga ou férias no período" description="Troque o período acima para ver outros registros." />
      )}
      {data.groups.map((g) => (
        <section key={g.unit}>
          <p className="sgo-type-11 mb-2 text-ink-500">{shortUnitName(g.unit)} <span className="font-normal">({g.items.length})</span></p>
          <List>
            {g.items.map((it, i) => (
              <ListRow
                key={i}
                title={it.name}
                subtitle={[it.note, it.startDate === it.endDate ? fmtBR(it.startDate) : `${fmtBR(it.startDate)} a ${fmtBR(it.endDate)}`].filter(Boolean).join(' · ')}
                trailing={<StatusBadge tone={it.kind === 'FERIAS' ? 'info' : 'neutral'} dot>{it.kind === 'FERIAS' ? 'Férias' : 'Folga'}</StatusBadge>}
              />
            ))}
          </List>
        </section>
      ))}
    </div>
  );
}
