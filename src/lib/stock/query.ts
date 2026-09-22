import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { descreverQuantidade, type TipoDeEmbalagem } from '@/lib/stock/embalagem';
import { faixaDaValidade, ordemDeUrgencia, precisaTratativa, type Faixa } from '@/lib/stock/validade';
import type { SessionUser } from '@/lib/auth/session';

/**
 * LEITURA DO ESTOQUE.
 *
 * A faixa de validade e o texto da embalagem são calculados AQUI, na leitura, a
 * partir do dia operacional da unidade — nunca lidos de coluna gravada. O dia
 * vira sozinho: um status guardado diria "vence em 7 dias" para sempre.
 */

export interface LinhaDeEstoque {
  lotId: string;
  unitId: string;
  unitName: string;
  productId: string;
  produto: string;
  categoria: string;
  lotCode: string | null;
  expiresAt: string | null;
  /** Saldo declarado, em unidades. */
  unidades: number;
  /** O mesmo saldo lido como o gerente conta: "5 fardos · 60 un". */
  quantidade: string;
  qtyReceived: number;
  status: string;
  faixa: Faixa | null;
  /** O alerta desta faixa ainda não foi respondido? */
  pendente: boolean;
  lastReviewAt: Date | null;
}

export interface EstoqueDaUnidade {
  hoje: string;
  linhas: LinhaDeEstoque[];
  /** Só as que pedem resposta do gerente agora — a fila de trabalho dele. */
  pendencias: LinhaDeEstoque[];
  contagens: { total: number; lotes: number; vencidos: number; criticos: number; atencao: number; proximos: number };
}

type LoteBruto = {
  id: string; unitId: string; productId: string; lotCode: string | null; expiresAt: string | null;
  qtyOnHand: unknown; qtyReceived: unknown; packType: string; unitsPerPack: number;
  status: string; lastReviewBand: string | null; lastReviewAt: Date | null;
  unit: { name: string };
  product: { name: string; category: string; alertDays: number };
};

function montar(l: LoteBruto, hoje: string): LinhaDeEstoque {
  const unidades = Number(l.qtyOnHand);
  const faixa = faixaDaValidade(l.expiresAt, hoje, l.product.alertDays);
  return {
    lotId: l.id, unitId: l.unitId, unitName: l.unit.name,
    productId: l.productId, produto: l.product.name, categoria: l.product.category,
    lotCode: l.lotCode, expiresAt: l.expiresAt,
    unidades,
    quantidade: descreverQuantidade(unidades, l.packType as TipoDeEmbalagem, l.unitsPerPack),
    qtyReceived: Number(l.qtyReceived),
    status: l.status,
    faixa,
    pendente: precisaTratativa(l, hoje, l.product.alertDays),
    lastReviewAt: l.lastReviewAt,
  };
}

const INCLUDE = {
  unit: { select: { name: true } },
  product: { select: { name: true, category: true, alertDays: true } },
} as const;

/**
 * O estoque em uso de uma unidade (ou da rede, conforme o escopo).
 *
 * Só lotes `OPEN`: encerrado não é estoque, é histórico. O dia vem do corte
 * OPERACIONAL da unidade — às 2h da manhã a unidade ainda está no dia anterior,
 * e usar o relógio do servidor faria o alerta virar antes da hora.
 */
export async function getEstoqueDaUnidade(user: SessionUser, opts: { unitId?: string } = {}): Promise<EstoqueDaUnidade> {
  const lotes = await prisma.stockLot.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}), status: 'OPEN' },
    include: INCLUDE,
  });

  /* O corte é por unidade. Com o filtro de uma só, é o dela; sem filtro, a
     primeira unidade do lote serve de referência e as demais recalculam. */
  const porUnidade = new Map<string, string>();
  const unidadesEnvolvidas = [...new Set(lotes.map((l) => l.unitId))];
  if (unidadesEnvolvidas.length) {
    const cfg = await prisma.unit.findMany({ where: { id: { in: unidadesEnvolvidas } }, select: { id: true, timezone: true, cutoffHour: true } });
    for (const u of cfg) porUnidade.set(u.id, currentOperationalDate({ timezone: u.timezone, cutoffHour: u.cutoffHour }));
  }
  const hojePadrao = currentOperationalDate({ timezone: 'America/Sao_Paulo', cutoffHour: 4 });

  const linhas = lotes
    .map((l) => montar(l as LoteBruto, porUnidade.get(l.unitId) ?? hojePadrao))
    .sort((a, b) => ordemDeUrgencia(a, b) || a.produto.localeCompare(b.produto, 'pt-BR'));

  const conta = (chave: string) => linhas.filter((l) => l.faixa?.chave === chave).length;
  return {
    hoje: hojePadrao,
    linhas,
    pendencias: linhas.filter((l) => l.pendente),
    contagens: {
      total: linhas.reduce((s, l) => s + l.unidades, 0),
      lotes: linhas.length,
      vencidos: conta('VENCIDO'),
      /* "Crítico" na tela junta o que vence hoje e o que vence em até 2 dias:
         são a mesma urgência para quem vai à prateleira agora. */
      criticos: conta('HOJE') + conta('CRITICO'),
      atencao: conta('ATENCAO'),
      proximos: conta('PROXIMO'),
    },
  };
}

/** Movimentos de um lote — quem declarou o quê, e quando. */
export async function getHistoricoDoLote(user: SessionUser, lotId: string) {
  const lote = await prisma.stockLot.findFirst({
    where: { id: lotId, ...unitScopeWhere(user, 'unitId') },
    include: { ...INCLUDE, movements: { orderBy: { createdAt: 'asc' } } },
  });
  if (!lote) return null;
  const hoje = currentOperationalDate({ timezone: 'America/Sao_Paulo', cutoffHour: 4 });
  return {
    linha: montar(lote as LoteBruto, hoje),
    movimentos: lote.movements.map((m) => ({
      id: m.id, tipo: m.type, qty: Number(m.qty), qtyAfter: Number(m.qtyAfter),
      note: m.note, por: m.createdByName, em: m.createdAt,
    })),
  };
}
