import { Eye } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getUsageBoard } from '@/lib/supervisor/usage';
import { getVisitBoard, listSupervisorChecklists } from '@/lib/supervisor/visits';
import { listVisitPlans } from '@/lib/supervisor/visit-plans';
import { Card, CardContent } from '@/components/ui/card';
import { SupervisionClient } from '@/components/supervisor/supervision-client';

export const dynamic = 'force-dynamic';

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default async function SupervisaoPage({ searchParams }: { searchParams: { mes?: string } }) {
  const user = (await getSessionUser())!;
  const months = lastMonths(12);
  const yearMonth = months.includes(searchParams.mes ?? '') ? (searchParams.mes as string) : months[0];

  const [usage, board, checklists, units, plans] = await Promise.all([
    getUsageBoard(user, yearMonth),
    getVisitBoard(user),
    listSupervisorChecklists(true),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listVisitPlans(user),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><Eye className="h-5 w-5 text-accent" /> Rotina do Supervisor</h1>
        <p className="text-sm text-muted-foreground">Painel de uso dos gerentes, visitas com feedback e checklists de visita.</p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <SupervisionClient
            usage={usage}
            yearMonth={yearMonth}
            months={months}
            board={board}
            units={units}
            checklists={checklists.map((c) => ({ id: c.id, name: c.name, items: Array.isArray(c.items) ? (c.items as string[]) : [] }))}
            plans={plans}
            canOperate={user.role === 'SUPERVISOR' || user.role === 'ADMIN'}
            isAdmin={user.role === 'ADMIN'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
