import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';

/**
 * SUGESTÃO DE PEDIDO — a partir do histórico da própria unidade.
 *
 * Sem IA externa, de propósito: a informação útil já está no banco, e uma
 * chamada externa acrescentaria custo, latência e uma dependência que pode
 * cair no meio do turno.
 *
 * O que ela responde: *"o que esta unidade costuma pedir, e quanto?"*. Nunca
 * envia nada sozinha — o gerente escolhe, item a item ou de uma vez.
 */

export interface ProdutoSugerido {
  productId: string;
  name: string;
  category: string;
  measure: string;
  /** A quantidade sugerida: a MEDIANA dos últimos pedidos, não a média. */
  qtySugerida: number;
  /** As últimas quantidades, para o gerente conferir de onde veio o número. */
  ultimas: number[];
  /** Em quantos dos últimos pedidos ele apareceu. */
  vezes: number;
}

/**
 * A mediana, e não a média.
 *
 * Um pedido atípico (a festa de fim de ano, o mutirão) puxa a média para cima e
 * a sugestão passa a mandar pedir demais — todo mês. A mediana ignora o
 * extremo e continua dizendo o que é rotina.
 */
function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  const m = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
  return Math.round(m * 1000) / 1000;
}

export interface OpcoesDeSugestao {
  /** Quantos pedidos anteriores olhar. */
  pedidos?: number;
  /** Aparecer em menos que isto não é rotina — é exceção. */
  minimoDeVezes?: number;
  limite?: number;
}

/**
 * O que sugerir para o próximo pedido desta unidade.
 *
 * Regra do corte: o produto precisa ter aparecido em pelo menos DOIS dos
 * últimos pedidos. Um item pedido uma vez só não é rotina, e sugeri-lo faria a
 * lista encher de coisa que alguém pediu por engano meses atrás.
 */
export async function sugerirProdutos(
  user: SessionUser,
  unitId: string,
  opcoes: OpcoesDeSugestao = {},
): Promise<ProdutoSugerido[]> {
  if (!canAccessUnit(user, unitId)) return [];
  const { pedidos = 6, minimoDeVezes = 2, limite = 20 } = opcoes;

  const ultimos = await prisma.productRequest.findMany({
    where: { unitId, status: { not: 'CANCELADO' } },
    orderBy: { createdAt: 'desc' },
    take: pedidos,
    select: {
      requestItems: {
        select: { productId: true, name: true, category: true, measure: true, qtyRequested: true },
      },
    },
  });
  if (ultimos.length === 0) return [];

  const porProduto = new Map<string, { name: string; category: string; measure: string; qtds: number[] }>();
  for (const pedido of ultimos) {
    /* Um produto repetido DENTRO do mesmo pedido conta uma vez só: senão duas
       linhas do mesmo item inflariam a frequência e a mediana. */
    const noPedido = new Map<string, number>();
    for (const i of pedido.requestItems) {
      if (!i.productId) continue; // produto apagado: não dá para sugerir de novo
      noPedido.set(i.productId, (noPedido.get(i.productId) ?? 0) + Number(i.qtyRequested));
      const atual = porProduto.get(i.productId) ?? { name: i.name, category: i.category, measure: i.measure, qtds: [] };
      atual.name = i.name; atual.category = i.category; atual.measure = i.measure;
      porProduto.set(i.productId, atual);
    }
    for (const [productId, qtd] of noPedido) {
      porProduto.get(productId)!.qtds.push(qtd);
    }
  }

  /* Só produtos que ainda existem e estão ativos — sugerir o que foi desativado
     manda o gerente pedir algo que o CD não separa mais. */
  const ids = [...porProduto.keys()];
  const ativos = new Set(
    (await prisma.product.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } })).map((p) => p.id),
  );

  return [...porProduto.entries()]
    .filter(([id, d]) => ativos.has(id) && d.qtds.length >= minimoDeVezes)
    .map(([productId, d]) => ({
      productId,
      name: d.name, category: d.category, measure: d.measure,
      qtySugerida: mediana(d.qtds),
      /* Da mais recente para a mais antiga, que é como a pessoa lê. */
      ultimas: [...d.qtds].reverse(),
      vezes: d.qtds.length,
    }))
    .sort((a, b) => b.vezes - a.vezes || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, limite);
}

export { mediana as medianaParaTeste };
