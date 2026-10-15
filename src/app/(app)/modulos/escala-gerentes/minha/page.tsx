import Link from 'next/link';
import { ArrowLeft, CalendarRange } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { unidadesDaEscalaDeGerentes, getGradeDeGerentes } from '@/lib/manager-schedule-central';
import { abasDaEscalaDeGerentes } from '@/lib/manager-schedule-abas';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { amanha } from '@/lib/manager-schedule-regras';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { ManagerScheduleClient } from '@/components/people/manager-schedule-client';

export const dynamic = 'force-dynamic';

/**
 * MINHA FOLGA (v1.170.0) — o gerente lança a própria folga.
 *
 * A mesma grade da Escala de gerentes (ele vê quem cobre a unidade antes de
 * escolher o dia), em modo PRÓPRIO: só para ele, só a partir de amanhã, e só
 * apaga o que ele mesmo lançou — com motivo. A Supervisão continua lançando
 * qualquer data na Escala de gerentes, e é avisada de cada lançamento daqui.
 */
export default async function MinhaFolgaPage({ searchParams }: { searchParams: { unit?: string; ano?: string; mes?: string } }) {
  const user = (await getSessionUser())!;
  const units = await unidadesDaEscalaDeGerentes(user);
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const hoje = hojeNaOperacao();
  const year = Number(searchParams.ano) || Number(hoje.slice(0, 4));
  const month = Math.min(12, Math.max(1, Number(searchParams.mes) || Number(hoje.slice(5, 7))));

  const [grade, tabs] = await Promise.all([
    getGradeDeGerentes(user, selected.id, year, month),
    abasDaEscalaDeGerentes(user, 'minha'),
  ]);
  const souGerente = ['MANAGER', 'COORDINATOR'].includes(user.role);

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden">
        <ArrowLeft className="h-4 w-4" /> Pessoas
      </Link>
      <div className="print:hidden">
        <LargeTitle
          title="Minha folga"
          subtitle={`Lance a sua folga ou férias a partir de ${amanha(hoje).split('-').reverse().join('/')}. A grade mostra quem cobre a unidade em cada dia.`}
          tabs={tabs.length > 1 ? tabs : undefined}
        />
      </div>
      <Card><CardContent className="pt-4">
        {grade === null ? (
          <EmptyState icon={CalendarRange} title="Unidade fora do seu escopo" description="Escolha uma das unidades às quais você está vinculado." />
        ) : !souGerente ? (
          <EmptyState icon={CalendarRange} title="Esta tela é do gerente" description="Quem não é gerente nem coordenador lança folgas pela Escala de gerentes." />
        ) : (
          <ManagerScheduleClient
            grade={grade}
            units={units}
            podeEditar={false}
            propria={{ userId: user.id, amanha: amanha(hoje) }}
            basePath="/modulos/escala-gerentes/minha"
          />
        )}
      </CardContent></Card>
    </div>
  );
}
