import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getQuadroDaCompetencia } from '@/lib/people/payouts-competencia';
import { listPayoutCollaborators } from '@/lib/people/payouts';
import { Card, CardContent } from '@/components/ui/card';
import { PayoutsCompetenciaClient } from '@/components/people/payouts-competencia-client';
import { competencias, paraTelaDoQuadro } from '@/lib/people/quadro-ui';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

/**
 * MOBILIDADE — tela própria desde a v1.142.0 (era a 2ª aba de "Pagamento
 * Extra / Mobilidade"). Comportamento intocado: lançamento por competência,
 * entrega por unidade, fechamento e o arquivo da administradora.
 */
export default async function MobilidadePage({ searchParams }: { searchParams: { mes?: string } }) {
  const user = (await getSessionUser())!;
  const meses = competencias(12);
  const competencia = meses.includes(searchParams.mes ?? '') ? (searchParams.mes as string) : meses[1];
  const podeLancar = ['ADMIN', 'SUPERVISOR', 'CEO'].includes(user.role);

  const [quadro, colaboradores] = await Promise.all([
    getQuadroDaCompetencia(user, competencia, 'MOBILITY'),
    podeLancar ? listPayoutCollaborators(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <LargeTitle
        title="Mobilidade"
        subtitle="Lançamento por competência, entrega por unidade, fechamento e o arquivo da administradora. A Hora extra tem a sua própria tela."
      />
      <Card>
        <CardContent className="pt-4">
          <PayoutsCompetenciaClient
            tipo="MOBILITY"
            quadro={paraTelaDoQuadro(quadro)}
            competencia={competencia}
            meses={meses}
            colaboradores={colaboradores.map((c) => ({
              id: c.id,
              nome: c.name,
              cpf: c.cpf,
              /* A unidade exibida é a PRIMEIRA do cadastro, a mesma que o
                 lançamento usará — mostrar uma e gravar outra seria pior que
                 não mostrar nenhuma. */
              unitId: c.units[0]?.unit.id ?? '',
              unidade: c.units[0]?.unit.name ?? '—',
            }))}
            podeLancar={podeLancar}
            podeFecharExtra={false}
            isAdmin={user.role === 'ADMIN'}
            basePath="/modulos/mobilidade"
          />
        </CardContent>
      </Card>
    </div>
  );
}
