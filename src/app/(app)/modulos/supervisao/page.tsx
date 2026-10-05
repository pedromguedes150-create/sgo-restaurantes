import Link from 'next/link';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { Eye } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getUsageBoard } from '@/lib/supervisor/usage';
import { getVisitBoard, listSupervisorChecklists } from '@/lib/supervisor/visits';
import { listVisitPlans } from '@/lib/supervisor/visit-plans';
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
      {/* O cabeçalho (título, abas, ação) vive no cliente, no padrão do kit. */}
      <SupervisionClient
        subtitulo={<>Painel de uso dos gerentes, visitas com feedback e checklists de visita.<span className="block"><FamilyTabs active="/modulos/supervisao" /></span></>}
        acoes={<Link href="/modulos/painel-unidade" className="sgo-btn">📋 Painel da unidade (reunião)</Link>}
        abas={await abasDoPerfil(user.role, 'SUPERVISION')}
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
    </div>
  );
}
