import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { atualizarProduto, podeGerirCatalogo } from '@/lib/products/ficha';
import { sugerirSetoresPorIAEmLote } from '@/lib/ai/produto-setor';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PROPOSTAS DE SETOR POR IA — a IA sugere, o COORDENADOR aprova.
 *
 * O mutirão (`setor-em-lote.ts`) resolve o produto do CD SEM setor: propõe pela
 * regra + IA e o Admin aplica de uma vez. Aqui é o passo que o Pedro pediu por
 * cima disso: nada de setor sugerido por IA entra no cadastro sem um humano
 * conferir. A IA propõe, a proposta fica PENDENTE, e o Coordenador aprova,
 * edita (aprova com outro setor) ou rejeita — só na aprovação o setor é
 * aplicado de verdade.
 *
 * Por que persistir a proposta (e não decidir na hora, como o mutirão): a
 * geração e a revisão acontecem em momentos diferentes e por pessoas
 * diferentes. Quem seleciona os produtos e roda a IA não é necessariamente
 * quem confere; a fila precisa sobreviver ao fechamento da tela.
 *
 * Só produto de ORIGEM CD entra: Fábrica e local não passam pela esteira do CD
 * e não têm setor. Uma proposta ativa por produto (`@@unique(productId)`):
 * repropor sobrescreve a anterior.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Quantos produtos vão à IA por clique. Bounded pelas mesmas razões do mutirão:
 *  custo visível e sem estourar o tempo da rota. Ver `setor-em-lote.LOTE_IA`. */
export const LOTE_PROPOSTAS = 60;
/** Quantos itens por chamada de IA. Uma ida à rede resolve dezenas. */
const POR_CHAMADA = 20;

export type GerarResult =
  | {
      ok: true;
      configured: boolean;
      /** Propostas criadas ou atualizadas neste clique. */
      criadas: number;
      /** Produtos que a IA olhou mas não soube apontar (ficam sem proposta). */
      semSugestao: number;
      /** Quantos dos selecionados ainda não foram processados — clique de novo. */
      restantes: number;
      error?: string;
    }
  | { ok: false; reason: 'FORBIDDEN' };

/**
 * Roda a IA nos produtos do CD selecionados e cria propostas PENDENTES.
 *
 * Processa até `LOTE_PROPOSTAS` por clique e devolve `restantes`; a tela avisa
 * e a pessoa clica de novo. A IA que responde NENHUM não vira proposta — sem
 * setor é melhor que setor errado, e uma proposta sem setor não teria o que
 * aprovar.
 */
export async function gerarPropostas(user: SessionUser, productIds: string[], ctx: Ctx = {}): Promise<GerarResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };

  const ids = [...new Set(productIds.filter(Boolean))];
  const daVez = ids.slice(0, LOTE_PROPOSTAS);
  const restantes = Math.max(0, ids.length - LOTE_PROPOSTAS);

  const [setores, alvos] = await Promise.all([
    prisma.cdSector.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.product.findMany({
      /* Só CD e ativo: propor setor do CD para produto de Fábrica não faz
         sentido, e a proposta ficaria impossível de aprovar. */
      where: { id: { in: daVez }, origin: 'CD', active: true },
      select: { id: true, name: true, category: true },
    }),
  ]);
  if (alvos.length === 0 || setores.length === 0) {
    return { ok: true, configured: true, criadas: 0, semSugestao: 0, restantes };
  }

  const sugestoes: { productId: string; sectorId: string; sectorName: string; motivo?: string }[] = [];
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
  if (!configured) return { ok: true, configured: false, criadas: 0, semSugestao: 0, restantes };

  const comSugestao = new Set(sugestoes.map((s) => s.productId));
  const semSugestao = alvos.filter((p) => !comSugestao.has(p.id)).length;

  /* Upsert: repropor um produto que já tinha proposta sobrescreve a anterior e
     a devolve para PENDING — a nova leitura da IA é a que vale. */
  let criadas = 0;
  for (const s of sugestoes) {
    await prisma.productSectorProposal.upsert({
      where: { productId: s.productId },
      create: {
        productId: s.productId, proposedSectorId: s.sectorId, proposedSectorName: s.sectorName,
        reason: s.motivo ?? null, status: 'PENDING', createdById: user.id, createdByName: user.name,
      },
      update: {
        proposedSectorId: s.sectorId, proposedSectorName: s.sectorName, reason: s.motivo ?? null,
        status: 'PENDING', createdById: user.id, createdByName: user.name, createdAt: new Date(),
        reviewedById: null, reviewedByName: null, reviewedAt: null, finalSectorId: null, finalSectorName: null,
      },
    });
    criadas++;
  }

  if (criadas > 0) {
    await audit({
      userId: user.id, action: 'PRODUCT_SECTOR_PROPOSAL_AI', module: 'PRODUCTS', entity: 'product',
      metadata: { propostas: criadas, semSugestao, analisados: alvos.length }, ...ctx,
    }).catch(() => {});
  }

  return { ok: true, configured: true, criadas, semSugestao, restantes, error };
}

export interface PropostaPendente {
  id: string;
  productId: string;
  productName: string;
  category: string;
  /** O setor que o produto tem HOJE (a proposta pode reclassificar). */
  setorAtualId: string | null;
  setorAtualNome: string | null;
  proposedSectorId: string | null;
  proposedSectorName: string | null;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
}

/** A fila do Coordenador: propostas PENDENTES, com o setor atual do produto. */
export async function listarPropostasPendentes(): Promise<PropostaPendente[]> {
  const props = await prisma.productSectorProposal.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { name: true, category: true, cdSectorId: true, cdSector: { select: { name: true } } } } },
  });
  return props.map((p) => ({
    id: p.id, productId: p.productId, productName: p.product.name, category: p.product.category,
    setorAtualId: p.product.cdSectorId, setorAtualNome: p.product.cdSector?.name ?? null,
    proposedSectorId: p.proposedSectorId, proposedSectorName: p.proposedSectorName,
    reason: p.reason, createdByName: p.createdByName, createdAt: p.createdAt.toISOString(),
  }));
}

export async function contarPropostasPendentes(): Promise<number> {
  return prisma.productSectorProposal.count({ where: { status: 'PENDING' } });
}

export type DecidirResult =
  | { ok: true; aplicado: boolean }
  | { ok: false; reason: 'FORBIDDEN' | 'NAO_ENCONTRADO' | 'JA_DECIDIDA' | 'SEM_SETOR' | 'INVALID'; message?: string };

/**
 * O Coordenador decide uma proposta.
 *  - `aprovar` sem `cdSectorId` → aplica o setor PROPOSTO;
 *  - `aprovar` com `cdSectorId` → o Coordenador editou: aplica o dele;
 *  - `!aprovar` → rejeita, e o produto fica como está.
 *
 * Aprovar aplica via `atualizarProduto`, que audita e propaga para os pedidos
 * abertos — o mesmo caminho de toda definição de setor, para não haver uma
 * segunda regra que envelhece sozinha.
 */
export async function decidirProposta(
  user: SessionUser,
  proposalId: string,
  opts: { aprovar: boolean; cdSectorId?: string | null },
  ctx: Ctx = {},
): Promise<DecidirResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };

  const prop = await prisma.productSectorProposal.findUnique({ where: { id: proposalId } });
  if (!prop) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (prop.status !== 'PENDING') return { ok: false, reason: 'JA_DECIDIDA', message: 'Esta proposta já foi decidida.' };

  if (!opts.aprovar) {
    await prisma.productSectorProposal.update({
      where: { id: proposalId },
      data: { status: 'REJECTED', reviewedById: user.id, reviewedByName: user.name, reviewedAt: new Date() },
    });
    await audit({
      userId: user.id, action: 'PRODUCT_SECTOR_PROPOSAL_REJECT', module: 'PRODUCTS', entity: 'product', entityId: prop.productId,
      metadata: { setorProposto: prop.proposedSectorName }, ...ctx,
    }).catch(() => {});
    return { ok: true, aplicado: false };
  }

  /* O que aprovar aplica: o setor editado pelo Coordenador vence o proposto. */
  const setorId = opts.cdSectorId !== undefined && opts.cdSectorId !== null && opts.cdSectorId !== ''
    ? opts.cdSectorId
    : prop.proposedSectorId;
  if (!setorId) return { ok: false, reason: 'SEM_SETOR', message: 'Escolha um setor antes de aprovar.' };

  const r = await atualizarProduto(user, prop.productId, { origin: 'CD', cdSectorId: setorId }, ctx);
  if (!r.ok) {
    /* Repassa a recusa da ficha (setor inativo, produto sumiu etc.) sem marcar
       a proposta como aprovada — senão ela sairia da fila sem ter aplicado. */
    return { ok: false, reason: r.reason === 'NAO_ENCONTRADO' ? 'NAO_ENCONTRADO' : 'INVALID', message: r.message };
  }

  const setorNome = (await prisma.cdSector.findUnique({ where: { id: setorId }, select: { name: true } }))?.name ?? null;
  await prisma.productSectorProposal.update({
    where: { id: proposalId },
    data: {
      status: 'APPROVED', reviewedById: user.id, reviewedByName: user.name, reviewedAt: new Date(),
      finalSectorId: setorId, finalSectorName: setorNome,
    },
  });
  await audit({
    userId: user.id, action: 'PRODUCT_SECTOR_PROPOSAL_APPROVE', module: 'PRODUCTS', entity: 'product', entityId: prop.productId,
    metadata: { setorProposto: prop.proposedSectorName, setorAplicado: setorNome, editado: setorId !== prop.proposedSectorId }, ...ctx,
  }).catch(() => {});
  return { ok: true, aplicado: true };
}

export type AprovarTodasResult =
  | { ok: true; aprovadas: number; ignoradas: number }
  | { ok: false; reason: 'FORBIDDEN' };

/**
 * Aprova todas as propostas pendentes com o setor que a IA propôs.
 *
 * Uma a uma, reusando `decidirProposta` — cada aprovação precisa aplicar o
 * setor e propagar, e um `updateMany` só mudaria o status sem tocar no produto.
 * Proposta sem setor proposto é IGNORADA e contada (não há o que aprovar).
 */
export async function aprovarTodasPendentes(user: SessionUser, ctx: Ctx = {}): Promise<AprovarTodasResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };
  const pendentes = await prisma.productSectorProposal.findMany({ where: { status: 'PENDING' }, select: { id: true } });
  let aprovadas = 0;
  let ignoradas = 0;
  for (const p of pendentes) {
    const r = await decidirProposta(user, p.id, { aprovar: true }, ctx);
    if (r.ok && r.aplicado) aprovadas++;
    else ignoradas++;
  }
  return { ok: true, aprovadas, ignoradas };
}
