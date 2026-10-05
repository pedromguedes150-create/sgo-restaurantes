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
import { PainelOperacional } from '@/components/supervisor/painel-operacional';
import { ensureDefaultAuditItems, getIndicadoresOperacionais, podeConduzirVisita } from '@/lib/supervisor/operacional';

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

  /* Aba "Acompanhamento operacional" (v1.155.0): só é montada para quem a vê. */
  const abas = await abasDoPerfil(user.role, 'SUPERVISION');
  let operacional: React.ReactNode = null;
  if (abas.OPERACIONAL?.canView !== false) {
    await ensureDefaultAuditItems().catch(() => {});
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const nomes = new Map(units.map((u) => [u.id, u.name]));
    const [dados, andamento, planejadas] = await Promise.all([
      getIndicadoresOperacionais(user, yearMonth),
      prisma.supervisorVisit.findMany({ where: { kind: 'OPERACIONAL', status: 'PLANNED', startedAt: { not: null }, ...unitScopeWhere(user, 'unitId') }, orderBy: { scheduledDate: 'asc' }, select: { id: true, unitId: true, scheduledDate: true, responses: { select: { answer: true } } } }),
      prisma.supervisorVisit.findMany({ where: { kind: 'SIMPLES', status: 'PLANNED', scheduledDate: { gte: new Date(Date.parse(`${hoje}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10) }, ...unitScopeWhere(user, 'unitId') }, orderBy: { scheduledDate: 'asc' }, take: 20, select: { id: true, unitId: true, scheduledDate: true } }),
    ]);
    operacional = (
      <PainelOperacional
        d={dados}
        podeConduzir={podeConduzirVisita(user)}
        emAndamento={andamento.map((v) => ({ id: v.id, unitName: nomes.get(v.unitId) ?? '', data: v.scheduledDate, respondidos: v.responses.filter((r) => r.answer).length, total: v.responses.length }))}
        planejadas={planejadas.map((v) => ({ id: v.id, unitName: nomes.get(v.unitId) ?? '', data: v.scheduledDate }))}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* O cabeçalho (título, abas, ação) vive no cliente, no padrão do kit. */}
      <SupervisionClient
        subtitulo={<>Painel de uso dos gerentes, visitas com feedback e o acompanhamento operacional (o que a visita confere no local).<span className="block"><FamilyTabs active="/modulos/supervisao" /></span></>}
        acoes={<Link href="/modulos/painel-unidade" className="sgo-btn">📋 Painel da unidade (reunião)</Link>}
        abas={abas}
        operacional={operacional}
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
