import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { TIPOS_DE_DESPERDICIO, totaisDoDia, variacaoPct, type TotaisDoDia } from '@/lib/waste/tipos';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Painel consolidado de desperdício — a rede inteira num mês.
 *
 * Só faz sentido desde que a lista de tipos virou fechada (v1.80.0): antes,
 * cada unidade tinha as suas categorias e somar uma coluna entre unidades era
 * somar coisas diferentes com o mesmo nome.
 *
 * O consolidado responde três perguntas, nesta ordem: **quanto**, **onde** e
 * **para que lado está indo** — a última é a que o Alan pediu como "mostrando
 * onde teve aumento e diminuição", e é a única que exige o mês anterior.
 */

export interface LinhaDoConsolidado {
  unitId: string;
  unitName: string;
  /** Peso de cada um dos seis tipos no mês. */
  porCodigo: Record<string, number>;
  sobraLimpa: number;
  sobraProducao: number;
  geral: number;
  /** Total geral do mês ANTERIOR — a base da comparação. */
  anterior: number;
  /** null = sem base (mês anterior zerado). Ver `variacaoPct`. */
  variacao: number | null;
  /** Dias com lançamento no mês — sem isto, "caiu" pode ser só "deixaram de lançar". */
  diasComLancamento: number;
  diasDecorridos: number;
}

export interface ConsolidadoDeDesperdicio {
  year: number;
  month: number;
  linhas: LinhaDoConsolidado[];
  rede: TotaisDoDia & { anterior: number; variacao: number | null };
  /** Unidades que mais subiram e que mais caíram, já ordenadas. */
  subiram: LinhaDoConsolidado[];
  cairam: LinhaDoConsolidado[];
  /** Unidades sem nenhum lançamento no mês. */
  semLancamento: LinhaDoConsolidado[];
}

const dois = (n: number) => String(n).padStart(2, '0');

/** Primeiro dia do mês e primeiro do seguinte, em 'yyyy-mm-dd'. */
function faixaDoMes(year: number, month: number): { de: string; ate: string } {
  const prox = month === 12 ? { a: year + 1, m: 1 } : { a: year, m: month + 1 };
  return { de: `${year}-${dois(month)}-01`, ate: `${prox.a}-${dois(prox.m)}-01` };
}

function mesAnterior(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Quantos dias do mês já aconteceram (o mês corrente não tem 30 dias ainda). */
function diasDecorridosNoMes(year: number, month: number, hoje: Date): number {
  const noMes = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ehMesCorrente = hoje.getUTCFullYear() === year && hoje.getUTCMonth() + 1 === month;
  if (ehMesCorrente) return hoje.getUTCDate();
  const passou = year < hoje.getUTCFullYear() || (year === hoje.getUTCFullYear() && month < hoje.getUTCMonth() + 1);
  return passou ? noMes : 0;
}

/** Soma por código de categoria e conta os dias com lançamento, por unidade. */
async function somaDoMes(unitIds: string[], year: number, month: number) {
  const { de, ate } = faixaDoMes(year, month);
  const entries = await prisma.wasteEntry.findMany({
    where: { unitId: { in: unitIds }, operationalDate: { gte: de, lt: ate } },
    select: {
      unitId: true, operationalDate: true,
      items: { select: { kg: true, category: { select: { code: true } } } },
    },
  });

  const porUnidade: Record<string, { porCodigo: Record<string, number>; dias: Set<string> }> = {};
  for (const u of unitIds) porUnidade[u] = { porCodigo: {}, dias: new Set() };

  for (const e of entries) {
    const alvo = porUnidade[e.unitId];
    if (!alvo) continue;
    alvo.dias.add(e.operationalDate);
    for (const it of e.items) {
      const code = it.category.code;
      alvo.porCodigo[code] = (alvo.porCodigo[code] ?? 0) + Number(it.kg);
    }
  }
  return porUnidade;
}

export async function getConsolidadoDeDesperdicio(
  user: SessionUser,
  year: number,
  month: number,
  hoje: Date = new Date(),
): Promise<ConsolidadoDeDesperdicio> {
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const ids = units.map((u) => u.id);

  const ant = mesAnterior(year, month);
  const [atual, anterior] = await Promise.all([
    somaDoMes(ids, year, month),
    somaDoMes(ids, ant.year, ant.month),
  ]);

  const diasDecorridos = diasDecorridosNoMes(year, month, hoje);

  const linhas: LinhaDoConsolidado[] = units.map((u) => {
    const t = totaisDoDia(atual[u.id]?.porCodigo ?? {});
    const tAnt = totaisDoDia(anterior[u.id]?.porCodigo ?? {});
    return {
      unitId: u.id,
      unitName: u.name,
      porCodigo: t.porCodigo,
      sobraLimpa: t.sobraLimpa,
      sobraProducao: t.sobraProducao,
      geral: t.geral,
      anterior: tAnt.geral,
      variacao: variacaoPct(t.geral, tAnt.geral),
      diasComLancamento: atual[u.id]?.dias.size ?? 0,
      diasDecorridos,
    };
  });

  /* O total da rede é somado dos MESMOS seis códigos, não das linhas: assim
     `totaisDoDia` continua sendo o único lugar que sabe formar os grupos. */
  const brutoRede: Record<string, number> = {};
  const brutoRedeAnt: Record<string, number> = {};
  for (const t of TIPOS_DE_DESPERDICIO) {
    brutoRede[t.code] = linhas.reduce((acc, l) => acc + (l.porCodigo[t.code] ?? 0), 0);
    brutoRedeAnt[t.code] = Object.values(anterior).reduce((acc, u) => acc + (u.porCodigo[t.code] ?? 0), 0);
  }
  const rede = totaisDoDia(brutoRede);
  const redeAnt = totaisDoDia(brutoRedeAnt);

  /* Para o dashboard: só entra quem TEM base de comparação. Unidade que não
     lançou no mês passado apareceria como "subiu infinito" e roubaria o topo
     de quem realmente piorou. */
  const comBase = linhas.filter((l) => l.variacao !== null);
  const subiram = comBase.filter((l) => (l.variacao as number) > 0).sort((a, b) => (b.variacao as number) - (a.variacao as number));
  const cairam = comBase.filter((l) => (l.variacao as number) < 0).sort((a, b) => (a.variacao as number) - (b.variacao as number));

  return {
    year, month, linhas,
    rede: { ...rede, anterior: redeAnt.geral, variacao: variacaoPct(rede.geral, redeAnt.geral) },
    subiram,
    cairam,
    /* Zero quilo com zero lançamento não é "unidade exemplar": é ausência de
       dado, e precisa aparecer separada de quem lançou e teve pouco. */
    semLancamento: linhas.filter((l) => l.diasComLancamento === 0),
  };
}
