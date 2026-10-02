import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { podeEditarAba } from '@/lib/permissions/abas';
import { getHorasExtras, lerFiltroHE } from '@/lib/hora-extra/query';
import { PODE_VINCULAR, listarSemVinculo, vincularAutomaticamente } from '@/lib/hora-extra/vinculo';
import { activeOvertimeRatesByUnit } from '@/lib/overtime/rates';
import { activeOvertimeReasons } from '@/lib/overtime/reasons';
import { getQuadroDaCompetencia } from '@/lib/people/payouts-competencia';
import { podeFecharPagamentoExtra } from '@/lib/people/pagamento-extra';
import { competencias, paraTelaDoQuadro } from '@/lib/people/quadro-ui';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { HoraExtraClient } from '@/components/hora-extra/hora-extra-client';

export const dynamic = 'force-dynamic';

/**
 * HORA EXTRA (v1.142.0) — painel, solicitações e fechamento numa tela só.
 *
 * O vínculo automático das HE antigas roda ao abrir (idempotente, só mexe no
 * que não tem dúvida); o resto vai para a fila manual, para quem pode vincular.
 */
export default async function HoraExtraPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = (await getSessionUser())!;
  const filtro = lerFiltroHE({ get: (k) => searchParams[k] ?? null });
  const podeVincular = PODE_VINCULAR.has(user.role);
  if (podeVincular) await vincularAutomaticamente(user);

  const abas = await abasDoPerfil(user.role, 'PAYMENTS');
  const podeLancar = podeEditarAba(abas, 'nova');
  const meses = competencias(12);
  const competencia = filtro.mes && meses.includes(filtro.mes) ? filtro.mes : meses[1];

  const [painel, semVinculo, motivosCatalogo, vinculos, quadro] = await Promise.all([
    getHorasExtras(user, filtro),
    podeVincular ? listarSemVinculo(user) : Promise.resolve([]),
    activeOvertimeReasons(),
    podeLancar
      ? prisma.collaboratorUnit.findMany({
        where: { collaborator: { active: true }, ...unitScopeWhere(user, 'unitId') },
        select: { unitId: true, collaborator: { select: { id: true, name: true, jobTitle: true } } },
        orderBy: { collaborator: { name: 'asc' } },
      })
      : Promise.resolve([]),
    filtro.aba === 'fechamento' ? getQuadroDaCompetencia(user, competencia, 'EXTRA') : Promise.resolve(null),
  ]);
  const collaboratorsByUnit: Record<string, { id: string; name: string; jobTitle: string | null }[]> = {};
  for (const v of vinculos) (collaboratorsByUnit[v.unitId] ??= []).push(v.collaborator);
  const overtimeRatesByUnit = podeLancar ? await activeOvertimeRatesByUnit(painel.unidades.map((u) => u.id)) : {};

  return (
    <div className="space-y-4">
      <Link href="/modulos/pagamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pagamentos</Link>
      <LargeTitle title="Hora extra" subtitle="Solicitações e aprovações de hora extra: painel por motivo e período, lista para conferência e o fechamento da competência (paga no mês seguinte ao trabalho)." />
      <Card><CardContent className="pt-4">
        <HoraExtraClient
          filtro={painel.filtro}
          periodo={painel.periodo}
          hes={painel.hes}
          resumo={painel.resumo}
          motivos={painel.motivos}
          status={painel.status}
          evolucao={painel.evolucao}
          unidades={painel.unidades}
          motivosCatalogo={motivosCatalogo}
          semVinculo={semVinculo}
          fechamento={quadro ? { quadro: paraTelaDoQuadro(quadro), competencia, meses } : undefined}
          form={{ units: painel.unidades, collaboratorsByUnit, overtimeRatesByUnit }}
          podeLancar={podeLancar}
          podeFechar={podeFecharPagamentoExtra(user.role)}
          podeVincular={podeVincular}
          isAdmin={user.role === 'ADMIN'}
        />
      </CardContent></Card>
    </div>
  );
}
