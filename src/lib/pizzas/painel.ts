import { format, subDays } from 'date-fns';
import { prisma } from '@/lib/db/prisma';
import { CANAIS, nomeComercial, rotuloDoCanal, rotuloDoTamanho, TAMANHOS, type CanalPizza, type TamanhoPizza } from '@/lib/pizzas/tipos';

/** Uma célula do cruzamento canal × tamanho. */
export interface TamanhoNoPainel {
  size: TamanhoPizza;
  rotulo: string;
  /** "Gigante", "Grande", "Brotinho" — como a pizzaria chama. */
  comercial: string;
  total: number;
  porCanal: Record<CanalPizza, number>;
}

export interface CanalNoPainel {
  canal: CanalPizza;
  rotulo: string;
  total: number;
  /** Fatia entre os DOIS canais (não do total do período) — é uma comparação. */
  pct: number;
}

/** Painel do Controle de Pizzas: o período escolhido, somado de várias formas. */
export interface PainelDePizzas {
  de: string;
  ate: string;
  /** Pizzas do dia operacional corrente (independe do período filtrado). */
  hoje: number;
  total: number;
  porCanal: CanalNoPainel[];
  porTamanho: TamanhoNoPainel[];
  /**
   * Sabores dos fechamentos ANTIGOS. O formulário não pede mais sabor; isto só
   * aparece na tela enquanto houver histórico no período — um cartão
   * permanentemente vazio é pior que cartão nenhum.
   */
  porSabor: { flavorName: string; total: number }[];
  /** Histórico do mais recente para o mais antigo — só dias com fechamento. */
  dias: { operationalDate: string; total: number; teknisa: number; ifood: number }[];
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

/**
 * Soma o período por canal, tamanho e dia.
 *
 * DUAS FONTES, de propósito: as contagens por canal (fechamento novo) e as
 * linhas por sabor (fechamentos anteriores a esta mudança). Um fechamento tem
 * uma OU outra — a gravação apaga as linhas de sabor do dia que ela reescreve,
 * justamente para a mesma venda não ser contada duas vezes. Ler só as
 * contagens faria o histórico anterior desaparecer do painel de um dia para o
 * outro, sem ninguém ter apagado nada.
 */
export async function painelDePizzas(
  unitId: string,
  opcoes: { de: string; ate: string; hoje: string },
): Promise<PainelDePizzas> {
  const { de, ate, hoje } = opcoes;
  const doPeriodo = { closing: { unitId, operationalDate: { gte: de, lte: ate } } };

  const [contagens, legados] = await Promise.all([
    prisma.pizzaClosingCount.findMany({
      where: doPeriodo,
      select: { channel: true, size: true, quantity: true, closing: { select: { operationalDate: true } } },
    }),
    prisma.pizzaClosingItem.findMany({
      where: doPeriodo,
      select: { size: true, flavorName: true, quantity: true, closing: { select: { operationalDate: true } } },
    }),
  ]);

  const zeroPorCanal = (): Record<CanalPizza, number> => ({ TEKNISA: 0, IFOOD: 0 });

  const porTamanho = new Map<string, { total: number; porCanal: Record<CanalPizza, number> }>();
  const porCanal = zeroPorCanal();
  const porSabor = new Map<string, number>();
  const porDia = new Map<string, { total: number; teknisa: number; ifood: number }>();
  let total = 0;

  const noDia = (d: string) => {
    const atual = porDia.get(d) ?? { total: 0, teknisa: 0, ifood: 0 };
    porDia.set(d, atual);
    return atual;
  };
  const noTamanho = (s: string) => {
    const atual = porTamanho.get(s) ?? { total: 0, porCanal: zeroPorCanal() };
    porTamanho.set(s, atual);
    return atual;
  };

  for (const c of contagens) {
    if (c.quantity === 0) continue;
    total += c.quantity;
    porCanal[c.channel] += c.quantity;
    const t = noTamanho(c.size);
    t.total += c.quantity;
    t.porCanal[c.channel] += c.quantity;
    const d = noDia(c.closing.operationalDate);
    d.total += c.quantity;
    if (c.channel === 'TEKNISA') d.teknisa += c.quantity; else d.ifood += c.quantity;
  }

  for (const i of legados) {
    total += i.quantity;
    /* Venda antiga NÃO entra em canal nenhum: ela é anterior à separação, e
       jogá-la no Teknisa inventaria uma origem que ninguém registrou. Ela conta
       no total, no tamanho e no dia — que é o que de fato se sabe dela. */
    noTamanho(i.size).total += i.quantity;
    porSabor.set(i.flavorName, (porSabor.get(i.flavorName) ?? 0) + i.quantity);
    noDia(i.closing.operationalDate).total += i.quantity;
  }

  /* "Hoje" não pode sair dos laços acima: o filtro de período pode terminar
     ontem, e o cartão do dia continua tendo de mostrar o dia corrente. */
  const hojeNoPeriodo = hoje >= de && hoje <= ate;
  const totalHoje = hojeNoPeriodo ? (porDia.get(hoje)?.total ?? 0) : await somaDoDia(unitId, hoje);

  const diasComRegistro = porDia.size;
  const totalComCanal = porCanal.TEKNISA + porCanal.IFOOD;

  return {
    de,
    ate,
    hoje: totalHoje,
    total,
    /* A porcentagem é sobre o total DOS CANAIS, não sobre o total do período.
       O cartão compara Teknisa com iFood — e um período que ainda tenha
       fechamento antigo (sem canal) deixaria a barra 90% vazia, como se as
       duas somassem 10% da venda. Sem legado, as duas contas dão no mesmo. */
    porCanal: CANAIS.map((c) => ({
      canal: c.valor,
      rotulo: rotuloDoCanal(c.valor),
      total: porCanal[c.valor],
      pct: totalComCanal > 0 ? Math.round((porCanal[c.valor] / totalComCanal) * 1000) / 10 : 0,
    })),
    porTamanho: TAMANHOS.map((t) => {
      const linha = porTamanho.get(t.valor);
      return {
        size: t.valor,
        rotulo: rotuloDoTamanho(t.valor),
        comercial: nomeComercial(t.valor),
        total: linha?.total ?? 0,
        porCanal: linha?.porCanal ?? zeroPorCanal(),
      };
    }),
    porSabor: [...porSabor.entries()]
      .map(([flavorName, t]) => ({ flavorName, total: t }))
      .sort((a, b) => b.total - a.total || a.flavorName.localeCompare(b.flavorName, 'pt-BR')),
    dias: [...porDia.entries()]
      .map(([operationalDate, v]) => ({ operationalDate, ...v }))
      .sort((a, b) => b.operationalDate.localeCompare(a.operationalDate)),
    diasComRegistro,
    mediaDiaria: diasComRegistro > 0 ? Math.round((total / diasComRegistro) * 10) / 10 : 0,
  };
}

async function somaDoDia(unitId: string, operationalDate: string): Promise<number> {
  const onde = { closing: { unitId, operationalDate } };
  const [novo, legado] = await Promise.all([
    prisma.pizzaClosingCount.aggregate({ where: onde, _sum: { quantity: true } }),
    prisma.pizzaClosingItem.aggregate({ where: onde, _sum: { quantity: true } }),
  ]);
  return (novo._sum.quantity ?? 0) + (legado._sum.quantity ?? 0);
}
