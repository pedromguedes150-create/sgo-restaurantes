import Link from 'next/link';
import { ArrowLeft, CalendarRange } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canEditModule } from '@/lib/permissions';
import { unidadesDaEscalaDeGerentes, getGradeDeGerentes } from '@/lib/manager-schedule-central';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { ManagerScheduleClient } from '@/components/people/manager-schedule-client';

export const dynamic = 'force-dynamic';

/**
 * Escala de gerentes — a agenda de quem toma conta da unidade.
 *
 * A grade do mês responde a pergunta que o consolidado não respondia de relance:
 * *"quem está na unidade no dia 17?"*. E o lançamento fica aqui, com a
 * Supervisão, e não mais com cada gerente na própria Minha área.
 */
export default async function EscalaDeGerentesPage({
  searchParams,
}: {
  searchParams: { unit?: string; ano?: string; mes?: string };
}) {
  const user = (await getSessionUser())!;
  const units = await unidadesDaEscalaDeGerentes(user);
  if (units.length === 0) {
    return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;
  }

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const now = new Date();
  const year = Number(searchParams.ano) || now.getFullYear();
  const month = Math.min(12, Math.max(1, Number(searchParams.mes) || now.getMonth() + 1));

  const [grade, podeEditar] = await Promise.all([
    getGradeDeGerentes(user, selected.id, year, month),
    canEditModule(user.role, 'MANAGER_SCHEDULE'),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden">
        <ArrowLeft className="h-4 w-4" /> Pessoas
      </Link>

      <div className="print:hidden">
        <LargeTitle
          title="Escala de gerentes"
          subtitle="Horário, folgas e férias de quem responde pela unidade — mês a mês."
        />
      </div>

      <Card><CardContent className="pt-4">
        {grade === null ? (
          <EmptyState
            icon={CalendarRange}
            title="Unidade fora do seu escopo"
            description="Escolha uma das unidades às quais você está vinculado."
          />
        ) : (
          <ManagerScheduleClient
            grade={grade}
            units={units}
            podeEditar={podeEditar}
          />
        )}
      </CardContent></Card>
    </div>
  );
}
