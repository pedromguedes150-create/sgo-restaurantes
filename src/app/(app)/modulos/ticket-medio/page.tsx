import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canEditModule, viewableNavHrefs } from '@/lib/permissions';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Banner } from '@/components/ui/ds/banner';
import { SeletorDeCompetencia } from '@/components/ticket-media/seletor-de-competencia';
import { PainelDoTicketClient } from '@/components/ticket-media/painel-do-ticket';
import { competenciaDeHoje, competenciaValida, partesDaCompetencia, rotuloDaCompetencia } from '@/lib/ticket-media/calculo';
import { participantesEm } from '@/lib/ticket-media/participacao';
import { competenciasComDados, getPainel } from '@/lib/ticket-media/query';

export const dynamic = 'force-dynamic';

/**
 * TICKET MÉDIO — a tela de acompanhamento mensal das churrascarias.
 *
 * O recorte deste módulo NÃO é o seletor global do cabeçalho. Lá "Toda a Rede"
 * inclui CD, lanchonete e o que mais estiver cadastrado; aqui só entram as
 * unidades marcadas como participantes, e a palavra na tela é outra por isso
 * mesmo: "Consolidado das churrascarias".
 */
export default async function TicketMedioPage({
  searchParams,
}: {
  searchParams: { competencia?: string; unidade?: string };
}) {
  const user = (await getSessionUser())!;

  const competencia = competenciaValida(searchParams.competencia) ? searchParams.competencia : competenciaDeHoje();
  const participantes = await participantesEm(user, competencia);

  /* Unidade pedida que não participa não vira painel zerado: painel zerado
     pareceria "mês sem movimento", quando o caso é outro. */
  const pedida = searchParams.unidade ?? null;
  const participa = pedida ? participantes.some((p) => p.unitId === pedida) : true;
  const unitId = participa ? pedida : null;

  const painel = await getPainel(user, { competencia, unitId });
  const [podeImportar, podeConfigurar, comDados] = await Promise.all([
    viewableNavHrefs(user.role).then((hs) => hs.includes('/modulos/ticket-medio/importar')),
    canEditModule(user.role, 'CONFIG_TICKET_MEDIA'),
    competenciasComDados(user),
  ]);

  /* Anos oferecidos: os que já têm lançamento, mais o corrente — para o mês em
     que ninguém importou nada ainda não ficar sem opção no seletor. */
  const anoAtual = partesDaCompetencia(competenciaDeHoje()).ano;
  const anos = [...new Set([...comDados.map((c) => partesDaCompetencia(c).ano), anoAtual, partesDaCompetencia(competencia).ano])]
    .sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Ticket Médio"
        subtitle="Acompanhamento mensal das churrascarias — receita, cupons e ticket por unidade e consolidado."
      />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <SeletorDeCompetencia competencia={competencia} anos={anos} />
        {podeConfigurar && (
          <Link
            href="/configuracoes/ticket-medio"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
          >
            <Settings2 className="h-4 w-4" /> Unidades participantes
          </Link>
        )}
      </div>

      {pedida && !participa && (
        <Banner
          tone="info"
          title="Esta unidade não participa do controle de Ticket Médio"
          description={`Em ${rotuloDaCompetencia(competencia)} ela não estava marcada como participante, então não há ticket a calcular. Mostrando o consolidado das churrascarias.`}
        />
      )}

      <PainelDoTicketClient
        painel={painel}
        unidades={participantes.map((p) => ({ id: p.unitId, name: p.name }))}
        unitId={unitId}
        podeImportar={podeImportar}
        competencia={competencia}
      />
    </div>
  );
}
