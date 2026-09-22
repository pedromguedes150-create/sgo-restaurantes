import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { sugerirSetorPorRegra, type SetorCadastrado } from '@/lib/stock/setor-sugerido';
import { sugerirSetoresPorIAEmLote } from '@/lib/ai/produto-setor';
import type { SessionUser } from '@/lib/auth/session';

/**
 * MUTIRÃO DO SETOR — os produtos do CD que ficaram sem setor.
 *
 * Produto de origem CD sem `cdSectorId` cai em "Sem setor cadastrado" e
 * NENHUM separador o enxerga: ele some da fila de todo mundo sem erro nenhum.
 * A importação por Excel escreve direto no Prisma, sem passar por
 * `upsertProduct`, então esse buraco se refaz a cada planilha nova — foi assim
 * que mil e duzentos produtos chegaram lá.
 *
 * Corrigir um a um, num modal por item, inviabiliza o mutirão. Aqui a lista
 * inteira vem com o setor já PROPOSTO e a pessoa confirma de uma vez.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: aplicar sozinho. A sugestão é sugestão, e o
 * Admin confirma — errar o setor em lote espalharia o engano por mil produtos
 * de uma vez, e o erro só apareceria na doca do CD.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Quantos produtos vão à IA por clique. Bounded de propósito: ver `sugerirComIA`. */
export const LOTE_IA = 60;
/** Quantos itens por chamada. Uma ida à rede resolve dezenas. */
const POR_CHAMADA = 20;

function podeCorrigir(user: SessionUser): boolean {
  return ['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role);
}

export interface ItemSemSetor {
  id: string;
  name: string;
  category: string;
  barcode: string | null;
  /** O setor que a REGRA propõe, quando propõe. */
  sugestaoId: string | null;
  sugestaoNome: string | null;
  /** O termo que a regra reconheceu — a pessoa confere em vez de confiar. */
  porque: string | null;
}

export interface QuadroSemSetor {
  setores: SetorCadastrado[];
  itens: ItemSemSetor[];
  /** Quantos a regra resolveu e quantos sobraram para a IA ou para a mão. */
  comSugestao: number;
  semSugestao: number;
}

/**
 * Os produtos do CD sem setor, cada um já com a proposta da REGRA.
 *
 * A regra roda em todos, sempre: é instantânea, não custa nada e não depende de
 * rede. A IA fica para um segundo passo explícito, só no que sobrou.
 */
export async function listarSemSetor(user: SessionUser): Promise<QuadroSemSetor> {
  const [setores, produtos] = await Promise.all([
    prisma.cdSector.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { origin: 'CD', cdSectorId: null, active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true, barcode: true },
    }),
  ]);

  const itens: ItemSemSetor[] = produtos.map((p) => {
    const s = sugerirSetorPorRegra(p.name, setores, p.category);
    return {
      id: p.id, name: p.name, category: p.category, barcode: p.barcode,
      sugestaoId: s?.sectorId ?? null, sugestaoNome: s?.sectorName ?? null, porque: s?.termo ?? null,
    };
  });

  return {
    setores, itens,
    comSugestao: itens.filter((i) => i.sugestaoId).length,
    semSugestao: itens.filter((i) => !i.sugestaoId).length,
  };
}

export interface ResultadoDaIA {
  configured: boolean;
  sugestoes: { productId: string; sectorId: string; sectorName: string }[];
  /** Quantos ainda sobraram depois deste clique. */
  restantes: number;
  error?: string;
}

/**
 * Passa a IA nos que a regra não reconheceu — até `LOTE_IA` por clique.
 *
 * O teto existe por duas razões, e nenhuma é técnica por acaso: mil e duzentos
 * produtos numa requisição só demorariam minutos e estourariam qualquer
 * paciência (e provavelmente o tempo limite da rota); e o custo da IA fica
 * VISÍVEL, em vez de um botão que gasta um valor que ninguém previu. A tela diz
 * quantos sobraram e a pessoa decide se clica de novo.
 */
export async function sugerirComIA(user: SessionUser, productIds: string[]): Promise<ResultadoDaIA | { ok: false; reason: 'FORBIDDEN' }> {
  if (!podeCorrigir(user)) return { ok: false, reason: 'FORBIDDEN' };

  const setores = await prisma.cdSector.findMany({ where: { active: true }, select: { id: true, name: true } });
  const alvos = await prisma.product.findMany({
    where: { id: { in: productIds.slice(0, LOTE_IA) }, origin: 'CD', cdSectorId: null, active: true },
    select: { id: true, name: true, category: true },
  });
  if (alvos.length === 0 || setores.length === 0) {
    return { configured: true, sugestoes: [], restantes: Math.max(0, productIds.length - LOTE_IA) };
  }

  const sugestoes: ResultadoDaIA['sugestoes'] = [];
  let configured = true;
  let error: string | undefined;

  for (let i = 0; i < alvos.length; i += POR_CHAMADA) {
    const fatia = alvos.slice(i, i + POR_CHAMADA);
    const r = await sugerirSetoresPorIAEmLote({
      produtos: fatia.map((p) => ({ id: p.id, nome: p.name, categoria: p.category })),
      setores,
    });
    configured = r.configured;
    /* Sem chave não adianta continuar: as próximas fatias dariam o mesmo. */
    if (!r.configured) break;
    if (r.error) error = r.error;
    sugestoes.push(...r.sugestoes);
  }

  return { configured, sugestoes, restantes: Math.max(0, productIds.length - LOTE_IA), error };
}

export type AplicarResult =
  | { ok: true; aplicados: number; ignorados: number }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

/**
 * Aplica os setores confirmados.
 *
 * Três conferências, e cada uma fecha um jeito de o lote estragar dado:
 *  - só produto de **origem CD** (um LOCAL ganharia setor sem ser pedível);
 *  - só produto que **ainda está sem setor** (não sobrescreve o que alguém já
 *    corrigiu à mão enquanto a tela estava aberta);
 *  - só setor **ativo** (a fila de um setor desativado não é lida por ninguém).
 *
 * O que não passa é ignorado e CONTADO — devolver "aplicados: 900" sem dizer
 * que 12 ficaram de fora esconderia justamente os que precisam de atenção.
 */
export async function aplicarSetores(
  user: SessionUser,
  pares: { productId: string; cdSectorId: string }[],
  ctx: Ctx = {},
): Promise<AplicarResult> {
  if (!podeCorrigir(user)) return { ok: false, reason: 'FORBIDDEN' };
  const limpos = pares.filter((p) => p.productId && p.cdSectorId);
  if (limpos.length === 0) return { ok: false, reason: 'INVALID' };

  const [setoresAtivos, alvos] = await Promise.all([
    prisma.cdSector.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.product.findMany({
      where: { id: { in: limpos.map((p) => p.productId) }, origin: 'CD', cdSectorId: null, active: true },
      select: { id: true },
    }),
  ]);
  const idsValidos = new Set(alvos.map((a) => a.id));
  const setorPorId = new Map(setoresAtivos.map((s) => [s.id, s.name]));

  const validos = limpos.filter((p) => idsValidos.has(p.productId) && setorPorId.has(p.cdSectorId));
  if (validos.length === 0) return { ok: true, aplicados: 0, ignorados: limpos.length };

  /* Um `updateMany` por setor, e não um update por produto: mil produtos são
     mil idas ao banco, e numa transação só isso segura a conexão por minutos. */
  const porSetor = new Map<string, string[]>();
  for (const p of validos) porSetor.set(p.cdSectorId, [...(porSetor.get(p.cdSectorId) ?? []), p.productId]);

  let aplicados = 0;
  for (const [sectorId, ids] of porSetor) {
    const r = await prisma.product.updateMany({
      where: { id: { in: ids }, origin: 'CD', cdSectorId: null },
      data: { cdSectorId: sectorId },
    });
    aplicados += r.count;
  }

  await audit({
    userId: user.id, action: 'PRODUCT_SECTOR_BULK', module: 'PRODUCTS', entity: 'product',
    metadata: {
      aplicados,
      ignorados: limpos.length - validos.length,
      /* Por setor, e não a lista de mil ids: a linha de auditoria precisa ser
         legível, e "para onde foi cada monte" é o que responde a pergunta. */
      porSetor: [...porSetor.entries()].map(([id, ids]) => ({ setor: setorPorId.get(id) ?? id, itens: ids.length })),
    },
    ...ctx,
  });

  return { ok: true, aplicados, ignorados: limpos.length - validos.length };
}
