import { prisma } from '@/lib/db/prisma';

/**
 * A ponte entre o checklist e as Ocorrências.
 *
 * Regra que dá nome ao arquivo: **checklist é acompanhamento da rotina;
 * ocorrência é problema que pede ação de alguém**. Até a v1.78.1 todo item
 * marcado "A corrigir" virava ocorrência sozinho, e a aba enchia de rotina
 * misturada com o que de fato precisava de outro setor. Agora a ocorrência só
 * existe quando o usuário disser que existe.
 */

/** Para onde a ocorrência vai. O tipo escolhido decide. */
export type DestinoDaOcorrencia = 'MANUTENCAO' | 'TI' | 'GERAL';

export const DESTINO_LABEL: Record<DestinoDaOcorrencia, string> = {
  MANUTENCAO: 'Manutenção',
  TI: 'T.I.',
  GERAL: 'Geral',
};

/** A aba em que a ocorrência vai aparecer, para o link do checklist levar direto. */
export const DESTINO_HREF: Record<DestinoDaOcorrencia, string> = {
  MANUTENCAO: '/modulos/ocorrencias?view=manutencao',
  TI: '/modulos/ocorrencias?view=ti',
  GERAL: '/modulos/ocorrencias',
};

/**
 * O direcionamento pedido (Manutenção / T.I. / Geral Crítico) já existe no
 * cadastro: cada tipo de ocorrência tem `isMaintenance` e `isIT`, e são eles
 * que decidem a sub-aba. Aqui só se dá nome à conta, para a tela poder dizer
 * ANTES de gravar para onde aquilo vai — que é o que faltava.
 *
 * "Geral Crítico" não é um destino separado: é a aba Geral com gravidade
 * CRITICAL, que já avisa supervisão e diretoria na hora.
 */
export function destinoDoTipo(tipo: { isMaintenance?: boolean | null; isIT?: boolean | null } | null | undefined): DestinoDaOcorrencia {
  if (tipo?.isMaintenance) return 'MANUTENCAO';
  if (tipo?.isIT) return 'TI';
  return 'GERAL';
}

export interface OcorrenciaDoItem {
  id: string;
  number: number;
  destino: DestinoDaOcorrencia;
  destinoLabel: string;
  href: string;
  desde: string;
}

/**
 * A ocorrência ABERTA de um item do checklist, se houver.
 *
 * É o que impede a mesma pendência de virar cinco ocorrências: enquanto não
 * for encerrada, o item mostra a que já existe em vez de oferecer abrir outra.
 */
export async function ocorrenciasAbertasDosItens(
  unitId: string,
  itemIds: string[],
): Promise<Record<string, OcorrenciaDoItem>> {
  if (itemIds.length === 0) return {};
  const abertas = await prisma.occurrence.findMany({
    where: {
      unitId,
      sourceTaskItemId: { in: itemIds },
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, number: true, createdAt: true, sourceTaskItemId: true,
      type: { select: { isMaintenance: true, isIT: true } },
    },
  });

  const out: Record<string, OcorrenciaDoItem> = {};
  for (const o of abertas) {
    const itemId = o.sourceTaskItemId;
    if (!itemId || out[itemId]) continue; // a mais recente vence
    const destino = destinoDoTipo(o.type);
    out[itemId] = {
      id: o.id,
      number: o.number,
      destino,
      destinoLabel: DESTINO_LABEL[destino],
      href: `/modulos/ocorrencias/${o.id}`,
      desde: o.createdAt.toLocaleDateString('pt-BR'),
    };
  }
  return out;
}
