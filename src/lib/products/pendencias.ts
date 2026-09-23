import { prisma } from '@/lib/db/prisma';
import { paresDuplicados } from '@/lib/products/similaridade';

/**
 * PENDÊNCIAS DE CADASTRO — a fila do Administrador/Coordenador.
 *
 * Cinco perguntas que o catálogo de mil produtos não responde sozinho:
 * o que o gerente criou e ninguém validou; que códigos entraram pelo pedido
 * e ninguém revisou; quem do CD está sem setor; o que parece ser a mesma
 * coisa duas vezes; e que fardo/display não diz quantas unidades tem.
 *
 * Só LÊ e só conta: quem resolve é a ficha e o lote.
 */

export interface ProdutoPendente { id: string; name: string; origin: string; category: string; createdByName: string | null }
export interface CodigoNovo { code: string; productId: string; productName: string; createdByName: string | null; createdAt: string }
export interface Duplicidade { aId: string; aName: string; bId: string; bName: string; grau: number }

export interface PendenciasDeCadastro {
  novos: ProdutoPendente[];
  codigosNovos: CodigoNovo[];
  semSetor: number;
  duplicidades: Duplicidade[];
  embalagemIndefinida: ProdutoPendente[];
  /** Os ids que aparecem em alguma duplicidade — para a lista filtrar. */
  idsEmDuplicidade: string[];
  /** Os ids com código novo — idem. */
  idsComCodigoNovo: string[];
}

export async function pendenciasDeCadastro(): Promise<PendenciasDeCadastro> {
  const [novos, codigos, semSetor, ativos, embalagem] = await Promise.all([
    prisma.product.findMany({ where: { validation: 'PENDENTE', active: true }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, origin: true, category: true, createdByName: true } }),
    prisma.productBarcode.findMany({
      where: { reviewedAt: null }, orderBy: { createdAt: 'desc' }, take: 200,
      select: { code: true, productId: true, createdAt: true, createdById: true, product: { select: { name: true } } },
    }),
    prisma.product.count({ where: { origin: 'CD', cdSectorId: null, active: true } }),
    prisma.product.findMany({ where: { active: true, origin: { in: ['FABRICA', 'CD'] } }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { active: true, packType: { in: ['FARDO', 'DISPLAY'] }, OR: [{ packSize: null }, { packSize: { lte: 1 } }] }, select: { id: true, name: true, origin: true, category: true, createdByName: true } }),
  ]);
  const pares = paresDuplicados(ativos);
  const autores = [...new Set(codigos.map((c) => c.createdById).filter((x): x is string => Boolean(x)))];
  const usuarios = autores.length ? await prisma.user.findMany({ where: { id: { in: autores } }, select: { id: true, name: true } }) : [];
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name]));
  return {
    novos,
    codigosNovos: codigos.map((c) => ({ code: c.code, productId: c.productId, productName: c.product.name, createdByName: c.createdById ? nomePorId.get(c.createdById) ?? null : null, createdAt: c.createdAt.toISOString() })),
    semSetor,
    duplicidades: pares.map((p) => ({ aId: p.a.id, aName: p.a.name, bId: p.b.id, bName: p.b.name, grau: p.grau })),
    embalagemIndefinida: embalagem,
    idsEmDuplicidade: [...new Set(pares.flatMap((p) => [p.a.id, p.b.id]))],
    idsComCodigoNovo: [...new Set(codigos.map((c) => c.productId))],
  };
}
