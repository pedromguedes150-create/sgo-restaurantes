import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Última contagem COMPLETA da unidade.
 *
 * A rotina da rede tem dois ritmos: o caixa confere uma faixa toda madrugada, e
 * a contagem completa acontece uma vez por semana (normalmente na segunda). A
 * parcial é a que roda todo dia — e é justamente por isso que a completa pode
 * passar semanas sem acontecer sem ninguém notar: a tela mostraria "contagem de
 * hoje registrada" todos os dias, o que é verdade, e ainda assim as comandas de
 * reserva estariam sem conferência há um mês.
 *
 * Uma contagem é completa quando não gravou escopo (`scopeNumbers` nulo). As
 * contagens anteriores a esta funcionalidade também são completas, porque antes
 * dela toda contagem cobria a sequência inteira.
 */

export interface FullCountInfo {
  /** Data operacional da última completa, 'YYYY-MM-DD'. */
  date: string | null;
  /** Dias decorridos até a data operacional de hoje. */
  days: number | null;
  /** Passou do ritmo semanal — a supervisão precisa saber. */
  overdue: boolean;
  /** Nunca houve contagem completa nesta unidade. */
  never: boolean;
}

/** Dias entre duas datas 'YYYY-MM-DD' (contagem por dia de calendário, sem fuso). */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/** Limite do ritmo semanal. 8 e não 7: a contagem de segunda a segunda dá 7. */
export const FULL_COUNT_LIMIT_DAYS = 8;

export async function getLastFullCount(unitId: string, operationalDate: string): Promise<FullCountInfo> {
  const last = await prisma.commandCount.findFirst({
    // Coluna JSON tem DOIS nulos (o do banco e o do JSON): o NULL do banco se
    // filtra com Prisma.DbNull, e a tipagem recusa o null puro de propósito.
    where: { unitId, scopeNumbers: { equals: Prisma.DbNull } },
    orderBy: { operationalDate: 'desc' },
    select: { operationalDate: true },
  });
  if (!last) return { date: null, days: null, overdue: true, never: true };

  const days = daysBetween(last.operationalDate, operationalDate);
  return {
    date: last.operationalDate,
    days,
    overdue: days >= FULL_COUNT_LIMIT_DAYS,
    never: false,
  };
}
