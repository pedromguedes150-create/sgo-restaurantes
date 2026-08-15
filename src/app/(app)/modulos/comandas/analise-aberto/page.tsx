import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listOpenCommandAnalyses } from '@/lib/commands/open-analysis';
import { Card, CardContent } from '@/components/ui/card';
import { OpenCommandAnalysisClient } from '@/components/commands/open-command-analysis-client';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AnaliseAbertoPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) {
    return <p className="text-sm text-ink-500">Restrito à Supervisão/Administração.</p>;
  }
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade no escopo.</p>;
  const selUnit = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const analyses = await listOpenCommandAnalyses(user, selUnit.id);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/modulos/comandas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Comandas</Link>
      </div>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><ShieldAlert className="h-5 w-5 text-brand" /> Análise de comandas em aberto</h1>
        <p className="text-sm text-ink-500">Suba o relatório do Teknisa; o SGO destaca comandas <b>abertas com valor e data anterior ao corte</b> (possível fraude das 2 comandas) para o monitoramento buscar as câmeras.</p>
      </div>

      {units.length > 1 && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {units.map((u) => (
            <Link key={u.id} href={`/modulos/comandas/analise-aberto?unit=${u.id}`} className={u.id === selUnit.id ? 'rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</Link>
          ))}
        </div>
      )}

      <Card><CardContent className="pt-4">
        <OpenCommandAnalysisClient
          unitId={selUnit.id}
          unitName={selUnit.name}
          today={today}
          analyses={analyses.map((a) => ({
            id: a.id, cutDate: a.cutDate, fileName: a.fileName, createdByName: a.createdByName,
            createdAt: a.createdAt.toISOString(), totalCommands: a.totalCommands, suspectCount: a.suspectCount,
            suspectValue: Number(a.suspectValue),
            suspects: (a.suspects as unknown as { number: string; openedAt: string | null; openedDate: string | null; value: number; daysOpen: number; items: { name: string; qty: number; value: number }[] }[]) ?? [],
          }))}
        />
      </CardContent></Card>
    </div>
  );
}
