import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canEditModule } from '@/lib/permissions';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Banner } from '@/components/ui/ds/banner';
import { Importador } from '@/components/ticket-media/importador';
import { competenciaDeHoje, competenciaValida, partesDaCompetencia } from '@/lib/ticket-media/calculo';
import { participantesEm } from '@/lib/ticket-media/participacao';
import { competenciasComDados } from '@/lib/ticket-media/query';

export const dynamic = 'force-dynamic';

/** A alimentação mensal: uma planilha por unidade, uma vez por mês. */
export default async function ImportarTicketMedioPage({
  searchParams,
}: {
  searchParams: { competencia?: string };
}) {
  const user = (await getSessionUser())!;
  const competencia = competenciaValida(searchParams.competencia) ? searchParams.competencia : competenciaDeHoje();

  const [participantes, podeSubstituir, comDados] = await Promise.all([
    participantesEm(user, competencia),
    canEditModule(user.role, 'CONFIG_TICKET_MEDIA'),
    competenciasComDados(user),
  ]);

  const anoAtual = partesDaCompetencia(competenciaDeHoje()).ano;
  const anos = [...new Set([...comDados.map((c) => partesDaCompetencia(c).ano), anoAtual, anoAtual - 1, partesDaCompetencia(competencia).ano])]
    .sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <Link href="/modulos/ticket-medio" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Ticket Médio
      </Link>
      <LargeTitle
        title="Importar Ticket Médio"
        subtitle="Uma planilha por unidade e competência. O SGO lê, soma e mostra o resultado antes de gravar."
      />

      {participantes.length === 0 && (
        <Banner
          tone="warning"
          title="Nenhuma unidade participante nesta competência"
          description="Marque as churrascarias em Configurações → Ticket Médio (unidades participantes). Unidade nova não entra sozinha no controle, de propósito: é o que impede o CD e a lanchonete caírem no consolidado."
        />
      )}

      <Importador
        unidades={participantes.map((p) => ({ id: p.unitId, name: p.name }))}
        competenciaInicial={competencia}
        anos={anos}
        podeSubstituir={podeSubstituir}
      />
    </div>
  );
}
