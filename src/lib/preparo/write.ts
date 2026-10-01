import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma, PrepStandardStatus } from '@prisma/client';
import {
  normalizarDados, diferencas, MENSAGEM_INVALIDO,
  CAMPO_FOTO, CAMPO_SITUACAO, CAMPO_CRIACAO,
  type DadosDaFicha, type Mudanca,
} from '@/lib/preparo/tipos';
import { itemDoBanco, podeGerirFichas } from '@/lib/preparo/query';

/**
 * PADRONIZAÇÃO DE PREPARO — gravação. SÓ o Administrador, conferido AQUI
 * (a matriz na rota é a primeira porta; esta é a que vale para quem chegar
 * por fora da tela). Nada é excluído: ficha sai de cena como INATIVA.
 *
 * Toda mudança vira linha de `PrepStandardChange` (campo, antes, depois) +
 * uma entrada na Auditoria — é um PADRÃO OPERACIONAL, precisa de rastro.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

export type EscritaReason = 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'CODIGO_EXISTE' | 'STATE';
export type EscritaResult =
  | { ok: true; id: string; mudancas?: number }
  | { ok: false; reason: EscritaReason; message: string; campo?: string; existente?: { id: string; name: string; code: string } };

const MSG: Record<Exclude<EscritaReason, 'INVALID'>, string> = {
  FORBIDDEN: 'Apenas o Administrador altera fichas de preparo.',
  NOT_FOUND: 'Ficha não encontrada.',
  CODIGO_EXISTE: 'Já existe uma ficha ativa para este código.',
  STATE: 'A ficha já está nesta situação.',
};

async function fichaAtivaComCodigo(code: string, exceto?: string) {
  return prisma.prepStandard.findFirst({
    where: { code, status: 'ACTIVE', ...(exceto ? { id: { not: exceto } } : {}) },
    select: { id: true, name: true, code: true },
  });
}

function linhasDoHistorico(standardId: string, user: SessionUser, mudancas: Mudanca[]): Prisma.PrepStandardChangeCreateManyInput[] {
  return mudancas.map((m) => ({ standardId, userId: user.id, userName: user.name, field: m.field, oldValue: m.oldValue, newValue: m.newValue }));
}

function itensParaCriar(standardId: string, dados: DadosDaFicha): Prisma.PrepStandardItemCreateManyInput[] {
  return dados.items.map((it, i) => ({
    standardId, ingredientName: it.ingredientName, quantity: it.quantity, unit: it.unit, weightGrams: it.weightGrams, notes: it.notes, sortOrder: i,
  }));
}

export interface CriarFichaInput {
  dados: unknown;
  imagePath?: string | null;
  sourceFilePath?: string | null;
  /**
   * O que fazer quando já existe ficha ATIVA com o mesmo código:
   * - ausente → recusa com CODIGO_EXISTE e devolve a existente (a tela pergunta);
   * - 'NOVA' → cria a nova e INATIVA a antiga (decisão do Pedro, 01/10/2026),
   *   com o motivo no histórico das duas. "Atualizar a existente" é a rota de
   *   edição, não esta.
   */
  codigoRepetido?: 'NOVA';
}

export async function createPrepStandard(user: SessionUser, input: CriarFichaInput, ctx: Ctx = {}): Promise<EscritaResult> {
  if (!podeGerirFichas(user)) return { ok: false, reason: 'FORBIDDEN', message: MSG.FORBIDDEN };
  const n = normalizarDados(input.dados);
  if (!n.ok) return { ok: false, reason: 'INVALID', message: MENSAGEM_INVALIDO[n.motivo], campo: n.campo };
  const { dados } = n;

  const existente = await fichaAtivaComCodigo(dados.code);
  if (existente && input.codigoRepetido !== 'NOVA') {
    return { ok: false, reason: 'CODIGO_EXISTE', message: MSG.CODIGO_EXISTE, existente };
  }

  const id = await prisma.$transaction(async (tx) => {
    const criada = await tx.prepStandard.create({
      data: {
        name: dados.name, code: dados.code, category: dados.category,
        preparationMethod: dados.preparationMethod, generalNotes: dados.generalNotes,
        imagePath: input.imagePath || null, sourceFilePath: input.sourceFilePath || null,
        createdById: user.id, createdByName: user.name,
      },
    });
    await tx.prepStandardItem.createMany({ data: itensParaCriar(criada.id, dados) });
    const linhas: Mudanca[] = [{ field: CAMPO_CRIACAO, oldValue: null, newValue: input.sourceFilePath ? 'Importada de arquivo' : 'Cadastrada manualmente' }];
    if (input.imagePath) linhas.push({ field: CAMPO_FOTO, oldValue: null, newValue: input.imagePath });
    if (existente) {
      await tx.prepStandard.update({ where: { id: existente.id }, data: { status: 'INACTIVE', updatedById: user.id, updatedByName: user.name } });
      await tx.prepStandardChange.create({
        data: { standardId: existente.id, userId: user.id, userName: user.name, field: CAMPO_SITUACAO, oldValue: 'Ativa', newValue: `Inativa — substituída pela ficha nova de mesmo código (${criada.id})` },
      });
      linhas.push({ field: CAMPO_SITUACAO, oldValue: null, newValue: `Substitui a ficha anterior de mesmo código (${existente.id}), que foi inativada` });
    }
    await tx.prepStandardChange.createMany({ data: linhasDoHistorico(criada.id, user, linhas) });
    return criada.id;
  });

  await audit({
    userId: user.id, action: 'PREP_STANDARD_CREATE', module: 'PREP_STANDARDS', entity: 'prep_standard', entityId: id,
    metadata: { name: dados.name, code: dados.code, itens: dados.items.length, importada: Boolean(input.sourceFilePath), substituiu: existente?.id ?? null }, ...ctx,
  });
  return { ok: true, id };
}

export async function updatePrepStandard(user: SessionUser, id: string, dadosBrutos: unknown, ctx: Ctx = {}): Promise<EscritaResult> {
  if (!podeGerirFichas(user)) return { ok: false, reason: 'FORBIDDEN', message: MSG.FORBIDDEN };
  const n = normalizarDados(dadosBrutos);
  if (!n.ok) return { ok: false, reason: 'INVALID', message: MENSAGEM_INVALIDO[n.motivo], campo: n.campo };
  const { dados } = n;

  const atual = await prisma.prepStandard.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND', message: MSG.NOT_FOUND };

  if (dados.code !== atual.code) {
    const outra = await fichaAtivaComCodigo(dados.code, id);
    if (outra) return { ok: false, reason: 'CODIGO_EXISTE', message: MSG.CODIGO_EXISTE, existente: outra };
  }

  const antes: DadosDaFicha = {
    name: atual.name, code: atual.code, category: atual.category,
    preparationMethod: atual.preparationMethod, generalNotes: atual.generalNotes,
    items: atual.items.map(itemDoBanco),
  };
  const mudancas = diferencas(antes, dados);
  if (mudancas.length === 0) return { ok: true, id, mudancas: 0 };

  await prisma.$transaction([
    prisma.prepStandard.update({
      where: { id },
      data: {
        name: dados.name, code: dados.code, category: dados.category,
        preparationMethod: dados.preparationMethod, generalNotes: dados.generalNotes,
        updatedById: user.id, updatedByName: user.name,
      },
    }),
    prisma.prepStandardItem.deleteMany({ where: { standardId: id } }),
    prisma.prepStandardItem.createMany({ data: itensParaCriar(id, dados) }),
    prisma.prepStandardChange.createMany({ data: linhasDoHistorico(id, user, mudancas) }),
  ]);

  await audit({
    userId: user.id, action: 'PREP_STANDARD_UPDATE', module: 'PREP_STANDARDS', entity: 'prep_standard', entityId: id,
    metadata: { name: dados.name, mudancas: mudancas.map((m) => ({ campo: m.field, de: m.oldValue, para: m.newValue })) }, ...ctx,
  });
  return { ok: true, id, mudancas: mudancas.length };
}

/**
 * Troca SÓ a foto. Nenhum outro campo é tocado — é o contrato que permite
 * substituir as fotos operacionais pelas profissionais sem reimportar nada.
 * O arquivo antigo fica no volume (o histórico aponta para ele).
 */
export async function setPrepStandardPhoto(user: SessionUser, id: string, imagePath: string | null, ctx: Ctx = {}): Promise<EscritaResult> {
  if (!podeGerirFichas(user)) return { ok: false, reason: 'FORBIDDEN', message: MSG.FORBIDDEN };
  const atual = await prisma.prepStandard.findUnique({ where: { id }, select: { imagePath: true, name: true } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND', message: MSG.NOT_FOUND };
  if ((atual.imagePath ?? null) === (imagePath ?? null)) return { ok: true, id, mudancas: 0 };

  await prisma.$transaction([
    prisma.prepStandard.update({ where: { id }, data: { imagePath, updatedById: user.id, updatedByName: user.name } }),
    prisma.prepStandardChange.create({ data: { standardId: id, userId: user.id, userName: user.name, field: CAMPO_FOTO, oldValue: atual.imagePath, newValue: imagePath } }),
  ]);
  await audit({
    userId: user.id, action: imagePath ? 'PREP_STANDARD_PHOTO' : 'PREP_STANDARD_PHOTO_REMOVE', module: 'PREP_STANDARDS', entity: 'prep_standard', entityId: id,
    metadata: { name: atual.name, de: atual.imagePath, para: imagePath }, ...ctx,
  });
  return { ok: true, id, mudancas: 1 };
}

const ROTULO: Record<PrepStandardStatus, string> = { ACTIVE: 'Ativa', INACTIVE: 'Inativa' };

export async function setPrepStandardStatus(user: SessionUser, id: string, status: PrepStandardStatus, ctx: Ctx = {}): Promise<EscritaResult> {
  if (!podeGerirFichas(user)) return { ok: false, reason: 'FORBIDDEN', message: MSG.FORBIDDEN };
  if (status !== 'ACTIVE' && status !== 'INACTIVE') return { ok: false, reason: 'INVALID', message: 'Situação inválida.' };
  const atual = await prisma.prepStandard.findUnique({ where: { id }, select: { status: true, code: true, name: true } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND', message: MSG.NOT_FOUND };
  if (atual.status === status) return { ok: false, reason: 'STATE', message: MSG.STATE };
  if (status === 'ACTIVE') {
    const outra = await fichaAtivaComCodigo(atual.code, id);
    if (outra) return { ok: false, reason: 'CODIGO_EXISTE', message: 'Já há outra ficha ativa com este código; inative-a antes de reativar esta.', existente: outra };
  }

  await prisma.$transaction([
    prisma.prepStandard.update({ where: { id }, data: { status, updatedById: user.id, updatedByName: user.name } }),
    prisma.prepStandardChange.create({ data: { standardId: id, userId: user.id, userName: user.name, field: CAMPO_SITUACAO, oldValue: ROTULO[atual.status], newValue: ROTULO[status] } }),
  ]);
  await audit({
    userId: user.id, action: status === 'ACTIVE' ? 'PREP_STANDARD_ACTIVATE' : 'PREP_STANDARD_DEACTIVATE', module: 'PREP_STANDARDS', entity: 'prep_standard', entityId: id,
    metadata: { name: atual.name, code: atual.code }, ...ctx,
  });
  return { ok: true, id, mudancas: 1 };
}
