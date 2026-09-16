import { format, subDays } from 'date-fns';
import { prisma } from '@/lib/db/prisma';
import { rotuloDoTamanho, TAMANHOS, type TamanhoPizza } from '@/lib/pizzas/tipos';

/** Painel do Controle de Pizzas: o período escolhido, somado de várias formas. */
export interface PainelDePizzas {
  de: string;
  ate: string;
  /** Pizzas do dia operacional corrente (independe do período filtrado). */
  hoje: number;
  total: number;
  porTamanho: { size: TamanhoPizza; rotulo: string; total: number }[];
  porSabor: { flavorName: string; total: number }[];
  /** Histórico do mais recente para o mais antigo — só dias com fechamento. */
  dias: { operationalDate: string; total: number }[];
  diasComRegistro: number;
  /**
   * Média por dia LANÇADO, não por dia do calendário: um dia sem fechamento é
   * dado que falta, não venda zero, e dividir por ele afundaria a média.
   */
  mediaDiaria: number;
}

export const PERIODOS_EM_DIAS = [7, 30, 90] as const;
export type PeriodoEmDias = (typeof PERIODOS_EM_DIAS)[number];

export function ehPeriodo(v: unknown): v is PeriodoEmDias {
  return PERIODOS_EM_DIAS.includes(Number(v) as PeriodoEmDias);
}

/** Primeiro dia de uma janela que termina em `ate` (inclusive nas duas pontas). */
export function inicioDoPeriodo(ate: string, dias: number): string {
  return format(subDays(new Date(`${ate}T12:00:00`), dias - 1), 'yyyy-MM-dd');
}

export async function painelDePizzas(
  unitId: string,
  opcoes: { de: string; ate: string; hoje: string },
): Promise<PainelDePizzas> {
  const { de, ate, hoje } = opcoes;

  const itens = await prisma.pizzaClosingItem.findMany({
    where: { closing: { unitId, operationalDate: { gte: de, lte: ate } } },
    select: {
      size: true,
      flavorName: true,
      quantity: true,
      closing: { select: { operationalDate: true } },
    },
  });

  const porTamanho = new Map<string, number>();
  const porSabor = new Map<string, number>();
  const porDia = new Map<string, number>();
  let total = 0;

  for (const i of itens) {
    total += i.quantity;
    porTamanho.set(i.size, (porTamanho.get(i.size) ?? 0) + i.quantity);
    porSabor.set(i.flavorName, (porSabor.get(i.flavorName) ?? 0) + i.quantity);
    const d = i.closing.operationalDate;
    porDia.set(d, (porDia.get(d) ?? 0) + i.quantity);
  }

  /* "Hoje" não pode sair do laço acima: o filtro de período pode terminar
     ontem, e o cartão do dia continua tendo de mostrar o dia corrente. */
  const hojeNoPeriodo = hoje >= de && hoje <= ate;
  const totalHoje = hojeNoPeriodo
    ? (porDia.get(hoje) ?? 0)
    : await somaDoDia(unitId, hoje);

  const diasComRegistro = porDia.size;

  return {
    de,
    ate,
    hoje: totalHoje,
    total,
    porTamanho: TAMANHOS.map((t) => ({
      size: t.valor,
      rotulo: rotuloDoTamanho(t.valor),
      total: porTamanho.get(t.valor) ?? 0,
    })),
    porSabor: [...porSabor.entries()]
      .map(([flavorName, t]) => ({ flavorName, total: t }))
      .sort((a, b) => b.total - a.total || a.flavorName.localeCompare(b.flavorName, 'pt-BR')),
    dias: [...porDia.entries()]
      .map(([operationalDate, t]) => ({ operationalDate, total: t }))
      .sort((a, b) => b.operationalDate.localeCompare(a.operationalDate)),
    diasComRegistro,
    mediaDiaria: diasComRegistro > 0 ? Math.round((total / diasComRegistro) * 10) / 10 : 0,
  };
}

async function somaDoDia(unitId: string, operationalDate: string): Promise<number> {
  const r = await prisma.pizzaClosingItem.aggregate({
    where: { closing: { unitId, operationalDate } },
    _sum: { quantity: true },
  });
  return r._sum.quantity ?? 0;
}
