import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { LargeTitle } from '@/components/layout/page-chrome';
import { UnidadesParticipantes } from '@/components/ticket-media/unidades-participantes';
import { competenciaDeHoje, competenciaValida, partesDaCompetencia } from '@/lib/ticket-media/calculo';
import { quadroDeParticipacao } from '@/lib/ticket-media/participacao';
import { competenciasComDados } from '@/lib/ticket-media/query';

export const dynamic = 'force-dynamic';

/**
 * Configurações → Ticket Médio (unidades participantes).
 *
 * Mora em `/configuracoes` como as outras telas de cadastro — é o que faz a
 * tela nascer restrita a Admin/CEO pela regra que já existe, sem inventar um
 * padrão novo. O Ticket Médio tem um atalho direto para cá, porque o pedido é
 * chegar por "Ticket Médio → Configurações → Unidades participantes".
 */
export default async function ConfigTicketMedioPage({
  searchParams,
}: {
  searchParams: { competencia?: string };
}) {
  const user = (await getSessionUser())!;
  const competencia = competenciaValida(searchParams.competencia) ? searchParams.competencia : competenciaDeHoje();

  const [unidades, comDados] = await Promise.all([
    quadroDeParticipacao(user, competencia),
    competenciasComDados(user),
  ]);

  const anoAtual = partesDaCompetencia(competenciaDeHoje()).ano;
  const anos = [...new Set([...comDados.map((c) => partesDaCompetencia(c).ano), anoAtual, anoAtual + 1, partesDaCompetencia(competencia).ano])]
    .sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <Link href="/modulos/ticket-medio" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Ticket Médio
      </Link>
      <LargeTitle
        title="Ticket Médio — unidades participantes"
        subtitle="Quem entra no consolidado das churrascarias, e desde quando."
      />
      <UnidadesParticipantes unidades={unidades} competencia={competencia} anos={anos} />
    </div>
  );
}
