import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import type { PrepStandardStatus } from '@prisma/client';
import type { DadosDaFicha, ItemDaFicha } from '@/lib/preparo/tipos';

/**
 * PADRONIZAÇÃO DE PREPARO — leitura.
 *
 * Todo perfil consulta; o que muda para quem não é Admin é que a ficha
 * INATIVA não existe para ele (nem na lista, nem pelo endereço direto).
 * Ficha não tem unidade: o padrão de preparo é da rede.
 */

export const podeGerirFichas = (user: Pick<SessionUser, 'role'>) => user.role === 'ADMIN';

export interface FichaResumo {
  id: string;
  name: string;
  code: string;
  category: string;
  imagePath: string | null;
  status: PrepStandardStatus;
  /** Para a busca por ingrediente na tela — a lista é pequena (dezenas), vai inteira. */
  ingredientes: string[];
  updatedAt: string;
}

export interface FichaCompleta extends DadosDaFicha {
  id: string;
  imagePath: string | null;
  status: PrepStandardStatus;
  sourceFilePath: string | null;
  createdByName: string;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export function itemDoBanco(i: { ingredientName: string; quantity: { toNumber(): number } | null; unit: string | null; weightGrams: { toNumber(): number } | null; notes: string | null }): ItemDaFicha {
  return { ingredientName: i.ingredientName, quantity: num(i.quantity), unit: i.unit, weightGrams: num(i.weightGrams), notes: i.notes };
}

const ORDEM = [{ category: 'asc' as const }, { name: 'asc' as const }, { id: 'asc' as const }];

export async function listPrepStandards(user: SessionUser, opts: { status?: 'ACTIVE' | 'INACTIVE' | 'ALL'; categoria?: string } = {}): Promise<FichaResumo[]> {
  const admin = podeGerirFichas(user);
  const status = admin ? (opts.status ?? 'ACTIVE') : 'ACTIVE';
  const rows = await prisma.prepStandard.findMany({
    where: {
      ...(status === 'ALL' ? {} : { status }),
      ...(opts.categoria ? { category: opts.categoria } : {}),
    },
    orderBy: ORDEM,
    select: {
      id: true, name: true, code: true, category: true, imagePath: true, status: true, updatedAt: true,
      items: { select: { ingredientName: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, code: r.code, category: r.category, imagePath: r.imagePath, status: r.status,
    ingredientes: r.items.map((i) => i.ingredientName), updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function listPrepCategories(): Promise<string[]> {
  const rows = await prisma.prepStandard.findMany({ where: { status: 'ACTIVE' }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } });
  return rows.map((r) => r.category);
}

export async function getPrepStandard(user: SessionUser, id: string): Promise<FichaCompleta | null> {
  const r = await prisma.prepStandard.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
  if (!r) return null;
  if (r.status !== 'ACTIVE' && !podeGerirFichas(user)) return null;
  return {
    id: r.id, name: r.name, code: r.code, category: r.category,
    preparationMethod: r.preparationMethod, generalNotes: r.generalNotes,
    items: r.items.map(itemDoBanco),
    imagePath: r.imagePath, status: r.status, sourceFilePath: r.sourceFilePath,
    createdByName: r.createdByName, updatedByName: r.updatedByName,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * Anterior/Próximo na MESMA ordem do catálogo (categoria, nome). Só entre as
 * ativas — é a navegação do supervisor passando ficha a ficha.
 */
export async function vizinhosDaFicha(id: string): Promise<{ prevId: string | null; nextId: string | null; posicao: number; total: number }> {
  const ids = (await prisma.prepStandard.findMany({ where: { status: 'ACTIVE' }, orderBy: ORDEM, select: { id: true } })).map((r) => r.id);
  const i = ids.indexOf(id);
  if (i === -1) return { prevId: null, nextId: null, posicao: 0, total: ids.length };
  return { prevId: ids[i - 1] ?? null, nextId: ids[i + 1] ?? null, posicao: i + 1, total: ids.length };
}

export interface LinhaDoHistorico { id: string; userName: string; field: string; oldValue: string | null; newValue: string | null; createdAt: string }

/** Só a área administrativa lê o histórico — a tela operacional não o mostra. */
export async function getPrepHistory(user: SessionUser, id: string): Promise<LinhaDoHistorico[]> {
  if (!podeGerirFichas(user)) return [];
  const rows = await prisma.prepStandardChange.findMany({ where: { standardId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
  return rows.map((r) => ({ id: r.id, userName: r.userName, field: r.field, oldValue: r.oldValue, newValue: r.newValue, createdAt: r.createdAt.toISOString() }));
}
