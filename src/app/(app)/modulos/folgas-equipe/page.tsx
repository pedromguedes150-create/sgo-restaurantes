import { getSessionUser } from '@/lib/auth/session';
import { effectivePermissions } from '@/lib/permissions';
import { getTeamLeaves } from '@/lib/manager-area';
import { Card, CardContent } from '@/components/ui/card';
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

export default async function FolgasEquipePage({ searchParams }: { searchParams: { start?: string; end?: string } }) {
  const user = (await getSessionUser())!;
  const perms = await effectivePermissions(user.role);
  if (!perms.LEAVES_TEAM?.canView) {
    return <p className="text-sm text-muted-foreground">Acesso restrito. O consolidado de folgas/férias é liberado pela Supervisão/Administração (Configurações → Perfis de acesso).</p>;
  }

  const def = monthRange();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const start = re.test(searchParams.start ?? '') ? searchParams.start! : def.start;
  const end = re.test(searchParams.end ?? '') && searchParams.end! >= start ? searchParams.end! : def.end;

  const data = await getTeamLeaves(user, start, end);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><CalendarOff className="h-5 w-5 text-accent" /> Folgas e Férias — Equipe</h1>
        <p className="text-sm text-muted-foreground">Consolidado por unidade no período. Escopo: suas unidades.</p>
      </div>

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
