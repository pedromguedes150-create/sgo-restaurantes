import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';
import { PODE_APURAR } from './apuracao';
import { funcaoForaDaComissao } from './calculo';

/**
 * TABELA DE VÍNCULOS DA COMISSÃO (v1.178.0) — a camada de "apelidos" entre o
 * nome do Teknisa e o cadastro do RH. Nenhum cadastro original muda: o vínculo
 * mora em `CommissionSellerLink` (unidade + código do Teknisa → colaborador) e
 * a apuração o usa antes de qualquer comparação por nome. "Ignorar" mora em
 * `CommissionLinkDismissal` e só tira aquela sugestão do caminho.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoVinculo = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; message?: string };

export type SituacaoDoVinculo = 'VINCULADO' | 'INATIVO' | 'FORA_DA_UNIDADE' | 'FUNCAO_FORA';
export const ROTULO_SITUACAO: Record<SituacaoDoVinculo, string> = {
  VINCULADO: 'Vinculado', INATIVO: 'Colaborador inativo no RH', FORA_DA_UNIDADE: 'Não está mais nesta unidade', FUNCAO_FORA: 'Gerente/encarregado (fora da comissão)',
};

export interface LinhaDeVinculo {
  id: string; unitId: string; unidade: string; sellerCode: string; sellerName: string;
  collaboratorId: string; collaboratorName: string; jobTitle: string | null; situacao: SituacaoDoVinculo;
  createdByName: string; createdAt: Date;
}
export interface LinhaIgnorada { id: string; unitId: string; unidade: string; sellerCode: string; sellerName: string; collaboratorName: string; createdByName: string; createdAt: Date }

function codigoValido(c: unknown): string | null {
  const v = String(c ?? '').trim();
  return /^[0-9A-Za-z._-]{1,20}$/.test(v) ? v : null;
}

export async function listarVinculos(user: SessionUser, unitIds?: string[]): Promise<{ vinculos: LinhaDeVinculo[]; ignorados: LinhaIgnorada[] }> {
  const where: Prisma.CommissionSellerLinkWhereInput = { AND: [unitScopeWhere(user, 'unitId'), unitIds?.length ? { unitId: { in: unitIds } } : {}] };
  const [links, ignoradas] = await Promise.all([
    prisma.commissionSellerLink.findMany({ where, orderBy: [{ sellerName: 'asc' }] }),
    prisma.commissionLinkDismissal.findMany({ where: where as Prisma.CommissionLinkDismissalWhereInput, orderBy: [{ createdAt: 'desc' }], take: 200 }),
  ]);
  const colabIds = [...new Set([...links.map((l) => l.collaboratorId), ...ignoradas.map((d) => d.collaboratorId)])];
  const unitIdsUsados = [...new Set([...links.map((l) => l.unitId), ...ignoradas.map((d) => d.unitId)])];
  const [colabs, units] = await Promise.all([
    prisma.collaborator.findMany({ where: { id: { in: colabIds } }, select: { id: true, name: true, active: true, jobTitle: true, units: { select: { unitId: true } } } }),
    prisma.unit.findMany({ where: { id: { in: unitIdsUsados } }, select: { id: true, name: true } }),
  ]);
  const c = new Map(colabs.map((x) => [x.id, x]));
  const u = new Map(units.map((x) => [x.id, x.name]));
  const vinculos = links.map((l) => {
    const col = c.get(l.collaboratorId);
    const situacao: SituacaoDoVinculo = !col || !col.active ? 'INATIVO'
      : !col.units.some((x) => x.unitId === l.unitId) ? 'FORA_DA_UNIDADE'
        : funcaoForaDaComissao(col.jobTitle) ? 'FUNCAO_FORA' : 'VINCULADO';
    return {
      id: l.id, unitId: l.unitId, unidade: u.get(l.unitId) ?? '—', sellerCode: l.sellerCode, sellerName: l.sellerName,
      collaboratorId: l.collaboratorId, collaboratorName: col?.name ?? '(colaborador removido)', jobTitle: col?.jobTitle ?? null, situacao,
      createdByName: l.createdByName, createdAt: l.createdAt,
    };
  });
  const ignorados = ignoradas.map((d) => ({
    id: d.id, unitId: d.unitId, unidade: u.get(d.unitId) ?? '—', sellerCode: d.sellerCode, sellerName: d.sellerName,
    collaboratorName: c.get(d.collaboratorId)?.name ?? '(colaborador removido)', createdByName: d.createdByName, createdAt: d.createdAt,
  }));
  return { vinculos, ignorados };
}

/** Novo vínculo à mão (ou confirmação de uma sugestão): só colaborador ATIVO desta unidade. */
export async function criarVinculo(user: SessionUser, e: { unitId: string; sellerCode: unknown; sellerName: unknown; collaboratorId: string }, ctx: Ctx = {}): Promise<ResultadoVinculo> {
  if (!PODE_APURAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!e.unitId || !canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN', message: 'Unidade fora do seu acesso.' };
  const codigo = codigoValido(e.sellerCode);
  if (!codigo) return { ok: false, reason: 'INVALID', message: 'Informe o código do vendedor no Teknisa (o número antes do nome, ex.: 1036).' };
  const nome = String(e.sellerName ?? '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 120);
  if (nome.length < 2) return { ok: false, reason: 'INVALID', message: 'Informe o nome como aparece no Teknisa.' };
  const col = await prisma.collaborator.findFirst({ where: { id: e.collaboratorId, active: true, units: { some: { unitId: e.unitId } } }, select: { id: true, name: true } });
  if (!col) return { ok: false, reason: 'INVALID', message: 'O colaborador precisa estar ativo no RH desta unidade.' };
  const antes = await prisma.commissionSellerLink.findUnique({ where: { unitId_sellerCode: { unitId: e.unitId, sellerCode: codigo } } });
  await prisma.$transaction([
    prisma.commissionSellerLink.upsert({
      where: { unitId_sellerCode: { unitId: e.unitId, sellerCode: codigo } },
      create: { unitId: e.unitId, sellerCode: codigo, sellerName: nome, collaboratorId: col.id, createdByName: user.name },
      update: { sellerName: nome, collaboratorId: col.id, createdByName: user.name },
    }),
    /* confirmar um vínculo desfaz um "Ignorar" anterior para o mesmo par */
    prisma.commissionLinkDismissal.deleteMany({ where: { unitId: e.unitId, sellerCode: codigo, collaboratorId: col.id } }),
  ]);
  await audit({
    userId: user.id, unitId: e.unitId, action: antes ? 'COMMISSION_LINK_UPDATE' : 'COMMISSION_LINK_CREATE', module: 'PEOPLE', entity: 'commission_seller_link',
    metadata: { codigo, teknisa: nome, rh: col.name, antes: antes ? { collaboratorId: antes.collaboratorId, teknisa: antes.sellerName } : null }, ...ctx,
  });
  return { ok: true };
}

export async function removerVinculo(user: SessionUser, id: string, ctx: Ctx = {}): Promise<ResultadoVinculo> {
  if (!PODE_APURAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const l = await prisma.commissionSellerLink.findUnique({ where: { id } });
  if (!l) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, l.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.commissionSellerLink.delete({ where: { id } });
  await audit({ userId: user.id, unitId: l.unitId, action: 'COMMISSION_LINK_DELETE', module: 'PEOPLE', entity: 'commission_seller_link', entityId: id, metadata: { codigo: l.sellerCode, teknisa: l.sellerName, collaboratorId: l.collaboratorId }, ...ctx });
  return { ok: true };
}

/** "Ignorar" uma sugestão: aquele vendedor NÃO é aquele colaborador. */
export async function ignorarSugestao(user: SessionUser, e: { unitId: string; sellerCode: unknown; sellerName: unknown; collaboratorId: string }, ctx: Ctx = {}): Promise<ResultadoVinculo> {
  if (!PODE_APURAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!e.unitId || !canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const codigo = codigoValido(e.sellerCode);
  if (!codigo) return { ok: false, reason: 'INVALID', message: 'Vendedor sem código no Teknisa: a sugestão só some nesta prévia.' };
  if (!e.collaboratorId) return { ok: false, reason: 'INVALID' };
  const nome = String(e.sellerName ?? '').trim().toUpperCase().slice(0, 120);
  await prisma.commissionLinkDismissal.upsert({
    where: { unitId_sellerCode_collaboratorId: { unitId: e.unitId, sellerCode: codigo, collaboratorId: e.collaboratorId } },
    create: { unitId: e.unitId, sellerCode: codigo, sellerName: nome, collaboratorId: e.collaboratorId, createdByName: user.name },
    update: {},
  });
  await audit({ userId: user.id, unitId: e.unitId, action: 'COMMISSION_LINK_DISMISS', module: 'PEOPLE', entity: 'commission_link_dismissal', metadata: { codigo, teknisa: nome, collaboratorId: e.collaboratorId }, ...ctx });
  return { ok: true };
}

export async function desfazerIgnorar(user: SessionUser, id: string, ctx: Ctx = {}): Promise<ResultadoVinculo> {
  if (!PODE_APURAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const d = await prisma.commissionLinkDismissal.findUnique({ where: { id } });
  if (!d) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, d.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.commissionLinkDismissal.delete({ where: { id } });
  await audit({ userId: user.id, unitId: d.unitId, action: 'COMMISSION_LINK_UNDISMISS', module: 'PEOPLE', entity: 'commission_link_dismissal', entityId: id, metadata: { codigo: d.sellerCode, collaboratorId: d.collaboratorId }, ...ctx });
  return { ok: true };
}
