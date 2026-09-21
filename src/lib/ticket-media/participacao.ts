import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { competenciaAnterior, competenciaValida, type Competencia } from './calculo';

/**
 * QUEM PARTICIPA do Ticket Médio, e desde quando.
 *
 * A participação é uma CONFIGURAÇÃO PRÓPRIA do módulo, e isso foi pedido com
 * todas as letras: o SGO não tem no cadastro nada que diga "isto é uma
 * churrascaria". Nome, razão social e CNPJ não servem — várias unidades
 * dividem a mesma razão social, e o CD tem nome de unidade como qualquer
 * outra. Adivinhar pelo nome poria o Centro de Distribuição no consolidado das
 * churrascarias, e o erro só apareceria num ticket médio estranho.
 *
 * Por isso: **unidade nova nasce FORA**. Nada aqui é automático; o Admin marca.
 *
 * E por isso a participação tem VIGÊNCIA em vez de um sim/não: ver o comentário
 * do model `TicketMediaParticipation`. Em resumo — tirar a unidade do controle
 * em setembro não pode mudar o consolidado de janeiro.
 */

export interface UnidadeParticipante {
  unitId: string;
  name: string;
  code: string;
  /** Participa NA competência consultada. */
  participa: boolean;
  /** Primeira competência da vigência corrente/aplicável. */
  desde: string | null;
  /** Última competência, quando a participação foi encerrada. */
  ate: string | null;
}

/** Uma vigência cobre a competência? (as duas pontas incluídas) */
function cobre(p: { startsAt: string; endsAt: string | null }, c: Competencia): boolean {
  if (c < p.startsAt) return false;
  return p.endsAt === null || c <= p.endsAt;
}

/**
 * As unidades que participam numa competência, dentro do escopo do usuário.
 *
 * O escopo do usuário entra SEMPRE: um gerente não passa a ver a rede inteira
 * porque o módulo é consolidado.
 */
export async function participantesEm(user: SessionUser, competencia: Competencia): Promise<UnidadeParticipante[]> {
  const unidades = await prisma.unit.findMany({
    where: { ...unitScopeWhere(user, 'id') },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
  if (unidades.length === 0) return [];

  const vigencias = await prisma.ticketMediaParticipation.findMany({
    where: { unitId: { in: unidades.map((u) => u.id) } },
    orderBy: { startsAt: 'asc' },
  });

  return unidades
    .map((u) => {
      const minhas = vigencias.filter((v) => v.unitId === u.id);
      const valendo = minhas.find((v) => cobre(v, competencia));
      return {
        unitId: u.id, name: u.name, code: u.code,
        participa: Boolean(valendo),
        desde: valendo?.startsAt ?? null,
        ate: valendo?.endsAt ?? null,
      };
    })
    .filter((u) => u.participa);
}

/**
 * TODAS as unidades do escopo com o estado de participação na competência —
 * inclusive as que não participam. É o que a tela de configuração lista.
 */
export async function quadroDeParticipacao(user: SessionUser, competencia: Competencia): Promise<UnidadeParticipante[]> {
  const unidades = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
  const vigencias = await prisma.ticketMediaParticipation.findMany({
    where: { unitId: { in: unidades.map((u) => u.id) } },
    orderBy: { startsAt: 'asc' },
  });

  return unidades.map((u) => {
    const minhas = vigencias.filter((v) => v.unitId === u.id);
    const valendo = minhas.find((v) => cobre(v, competencia));
    const ultima = minhas[minhas.length - 1];
    return {
      unitId: u.id, name: u.name, code: u.code,
      participa: Boolean(valendo),
      desde: valendo?.startsAt ?? ultima?.startsAt ?? null,
      ate: valendo ? valendo.endsAt : (ultima?.endsAt ?? null),
    };
  });
}

/** Atalho: esta unidade participa nesta competência? */
export async function unidadeParticipa(unitId: string, competencia: Competencia): Promise<boolean> {
  const vigencias = await prisma.ticketMediaParticipation.findMany({ where: { unitId } });
  return vigencias.some((v) => cobre(v, competencia));
}

export type MotivoDaParticipacao = 'COMPETENCIA' | 'UNIDADE' | 'SEM_ACESSO' | 'NADA_A_FAZER';

export interface ResultadoDaParticipacao {
  ok: boolean;
  reason?: MotivoDaParticipacao;
  ligadas: number;
  desligadas: number;
}

/**
 * Liga/desliga a participação, valendo A PARTIR da competência informada.
 *
 * Ligar abre uma vigência que começa em `competencia`. Desligar FECHA a
 * vigência em aberto na competência ANTERIOR — é o que o pedido descreve:
 * "participou de janeiro a agosto, foi retirada em setembro" deixa agosto
 * dentro e setembro fora. Nada é apagado: o histórico de janeiro a agosto
 * continua no consolidado daqueles meses.
 *
 * Ligar de novo depois abre uma vigência NOVA em vez de reabrir a antiga. Com
 * uma vigência só, uma unidade que saiu em setembro e voltou em novembro
 * apareceria como pendente em setembro e outubro — meses em que ela não
 * participava.
 */
export async function definirParticipacao(
  user: SessionUser,
  input: { competencia: string; participantes: string[] },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDaParticipacao> {
  const competencia = input.competencia;
  if (!competenciaValida(competencia)) return { ok: false, reason: 'COMPETENCIA', ligadas: 0, desligadas: 0 };

  const alcance = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    select: { id: true, name: true },
  });
  const idsNoAlcance = new Set(alcance.map((u) => u.id));

  /* Escopo no servidor (regra nº 3): id de unidade fora do alcance não é
     ignorado em silêncio — a gravação inteira para, porque aceitar metade
     deixaria a tela mostrando um resultado que não foi o pedido. */
  const pedidos = [...new Set(input.participantes)];
  if (pedidos.some((id) => !idsNoAlcance.has(id))) {
    return { ok: false, reason: 'SEM_ACESSO', ligadas: 0, desligadas: 0 };
  }
  const querParticipar = new Set(pedidos);

  const vigencias = await prisma.ticketMediaParticipation.findMany({
    where: { unitId: { in: [...idsNoAlcance] } },
  });

  const ligar: string[] = [];
  const desligar: { id: string; unitId: string }[] = [];

  for (const u of alcance) {
    const minhas = vigencias.filter((v) => v.unitId === u.id);
    const valendo = minhas.find((v) => cobre(v, competencia));
    const quer = querParticipar.has(u.id);
    if (quer && !valendo) ligar.push(u.id);
    if (!quer && valendo) desligar.push({ id: valendo.id, unitId: u.id });
  }

  if (ligar.length === 0 && desligar.length === 0) {
    return { ok: true, reason: 'NADA_A_FAZER', ligadas: 0, desligadas: 0 };
  }

  const fim = competenciaAnterior(competencia);
  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    for (const unitId of ligar) {
      await tx.ticketMediaParticipation.create({
        data: { unitId, startsAt: competencia, createdById: user.id, createdByName: user.name },
      });
    }
    for (const d of desligar) {
      /* A vigência que COMEÇA na própria competência desligada não pode
         terminar no mês anterior ao próprio começo — isso gravaria um período
         invertido, que nenhuma consulta casaria. Ela é removida: nunca chegou
         a valer para competência alguma. */
      const v = vigencias.find((x) => x.id === d.id)!;
      if (v.startsAt >= competencia) {
        await tx.ticketMediaParticipation.delete({ where: { id: d.id } });
      } else {
        await tx.ticketMediaParticipation.update({
          where: { id: d.id },
          data: { endsAt: fim, closedById: user.id, closedByName: user.name, closedAt: agora },
        });
      }
    }
  });

  await audit({
    userId: user.id, action: 'TICKET_MEDIA_PARTICIPATION', module: 'TICKET_MEDIA',
    entity: 'ticket_media_participation', entityId: competencia,
    metadata: {
      competencia,
      ligadas: ligar.map((id) => alcance.find((u) => u.id === id)?.name ?? id),
      desligadas: desligar.map((d) => alcance.find((u) => u.id === d.unitId)?.name ?? d.unitId),
    },
    ...ctx,
  });

  return { ok: true, ligadas: ligar.length, desligadas: desligar.length };
}
