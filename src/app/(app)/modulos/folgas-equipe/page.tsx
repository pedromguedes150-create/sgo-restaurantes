import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { effectivePermissions } from '@/lib/permissions';
import { getTeamLeaves } from '@/lib/manager-area';
import { getManagerCoverageCalendar } from '@/lib/manager-schedule';
import { Card, CardContent } from '@/components/ui/card';
import { ManagerCalendar } from '@/components/people/manager-calendar';
import { CalendarOff, CalendarDays } from 'lucide-react';

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
    return <p className="text-sm text-muted-foreground">Acesso restrito. O Controle de gerentes é liberado pela Supervisão/Administração (Configurações → Perfis de acesso).</p>;
  }

  const isCal = searchParams.view === 'calendario';
  const now = new Date();
  const year = Number(searchParams.ano) || now.getFullYear();
  const month = Math.min(12, Math.max(1, Number(searchParams.mes) || now.getMonth() + 1));
  const prevM = month === 1 ? { a: year - 1, m: 12 } : { a: year, m: month - 1 };
  const nextM = month === 12 ? { a: year + 1, m: 1 } : { a: year, m: month + 1 };

  const header = (
    <div className="space-y-3">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><CalendarDays className="h-5 w-5 text-accent" /> Controle de gerentes</h1>
        <p className="text-sm text-muted-foreground">Folgas, férias e cobertura de gerência por unidade. Escopo: suas unidades.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/modulos/folgas-equipe" className={!isCal ? 'flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium'}><CalendarOff className="h-4 w-4" /> Folgas / férias</Link>
        <Link href="/modulos/folgas-equipe?view=calendario" className={isCal ? 'flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium'}><CalendarDays className="h-4 w-4" /> Calendário de gerentes</Link>
      </div>
    </div>
  );

  if (isCal) {
    const cal = await getManagerCoverageCalendar(user, year, month);
    return (
      <div className="space-y-4">
        {header}
        <div className="flex items-center justify-between rounded-lg border border-dashed p-2">
          <Link href={`/modulos/folgas-equipe?view=calendario&ano=${prevM.a}&mes=${prevM.m}`} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">← anterior</Link>
          <span className="text-sm font-bold text-brand">{MONTHS[month - 1]} de {year}</span>
          <Link href={`/modulos/folgas-equipe?view=calendario&ano=${nextM.a}&mes=${nextM.m}`} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">próximo →</Link>
        </div>
        <p className="text-xs text-muted-foreground">Baseado no horário de trabalho que cada gerente cadastra em <b>Minha área → Folgas / férias</b>, menos folgas e férias. Dias em vermelho = unidade sem gerente (realocar reserva).{user.role === 'ADMIN' || user.role === 'CEO' ? ' Como admin, você pode cadastrar/editar o horário de cada gerente clicando em “Editar horário”.' : ''}</p>
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

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">De</label>
          <input type="date" name="start" defaultValue={start} className="h-10 rounded-lg border-2 border-input bg-background px-3 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Até</label>
          <input type="date" name="end" defaultValue={end} className="h-10 rounded-lg border-2 border-input bg-background px-3 text-sm" />
        </div>
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Filtrar</button>
      </form>

      <p className="text-sm text-muted-foreground">{data.total} registro(s) entre {fmtBR(start)} e {fmtBR(end)}.</p>

      {data.groups.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma folga/férias no período.</p>}
      {data.groups.map((g) => (
        <Card key={g.unit}>
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{g.unit} <span className="font-normal">({g.items.length})</span></p>
            <div className="space-y-1.5">
              {g.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium text-brand">{it.name}</span>
                    {it.note && <span className="block text-xs text-muted-foreground">{it.note}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-xs font-semibold ${it.kind === 'FERIAS' ? 'text-accent' : 'text-brand'}`}>{it.kind === 'FERIAS' ? 'Férias' : 'Folga'}</span>
                    <span className="block text-xs text-muted-foreground">{it.startDate === it.endDate ? fmtBR(it.startDate) : `${fmtBR(it.startDate)} a ${fmtBR(it.endDate)}`}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
