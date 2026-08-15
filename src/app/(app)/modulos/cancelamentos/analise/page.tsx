import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listCancellationAnalyses } from '@/lib/cancellations/fraud-analysis';
import type { CancelAnalysisData } from '@/lib/cancellations/fraud-analysis';
import { Card, CardContent } from '@/components/ui/card';
import { CancellationAnalysisClient } from '@/components/cancellations/cancellation-analysis-client';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function CancelAnalisePage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return <p className="text-sm text-ink-500">Restrito à Supervisão/Administração.</p>;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade no escopo.</p>;
  const selUnit = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const analyses = await listCancellationAnalyses(user, selUnit.id);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/modulos/cancelamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Cancelamentos</Link>
      </div>
      <div>
        <LargeTitle title="Análise antifraude de cancelamentos" />
        <p className="text-sm text-ink-500">Suba o <b>PDF</b> do relatório &quot;Vendas/Itens Cancelados no Período&quot; (Teknisa). O SGO analisa por caixa, por autorizador, horário e valor, e aponta possíveis fraudes.</p>
      </div>

      {units.length > 1 && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {units.map((u) => <Link key={u.id} href={`/modulos/cancelamentos/analise?unit=${u.id}`} className={u.id === selUnit.id ? 'rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</Link>)}
        </div>
      )}

      <Card><CardContent className="pt-4">
        <CancellationAnalysisClient
          unitId={selUnit.id}
          analyses={analyses.map((a) => ({ id: a.id, filial: a.filial, period: a.period, fileName: a.fileName, createdByName: a.createdByName, createdAt: a.createdAt.toISOString(), totalCount: a.totalCount, totalValue: Number(a.totalValue), data: a.data as unknown as CancelAnalysisData }))}
        />
      </CardContent></Card>
    </div>
  );
}
