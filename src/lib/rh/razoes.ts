import { prisma } from '@/lib/db/prisma';
import { rh, rhConfigured } from '@/lib/rh/client';
import { unwrapUnidades } from '@/lib/rh/normalize';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { catalogoDasRazoes, conferir, resolverVinculo, type Conferencia, type Criterio, type RazaoDoRh, type Resolucao } from '@/lib/rh/razoes-calculo';

/** Quem lê cada razão social hoje (principal ou adicional). */
interface VinculoAtual { unitId: string; unitName: string; rhName: string; tipo: 'PRINCIPAL' | 'ADICIONAL' }

/**
 * Razões sociais do RH por unidade — servidor (v1.166.0). A regra mora em
 * `razoes-calculo.ts` (pura); aqui só se busca o RH e o banco.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };

/** Todas as razões sociais que a sincronização desta unidade lê: a principal e as adicionais. */
export async function nomesNoRhDaUnidade(unit: { id: string; rhUnitName: string | null }): Promise<string[]> {
  if (!unit.rhUnitName) return [];
  const extras = await prisma.unitRhSource.findMany({ where: { unitId: unit.id }, orderBy: { createdAt: 'asc' }, select: { rhName: true } });
  return [unit.rhUnitName, ...extras.map((e) => e.rhName).filter((n) => n !== unit.rhUnitName)];
}

/** Unidade do SGO que lê esta razão social (principal ou adicional) — para o webhook do RH. */
export async function unidadeDaRazaoSocial(rhName: string): Promise<{ id: string } | null> {
  const principal = await prisma.unit.findFirst({ where: { rhUnitName: rhName }, select: { id: true } });
  if (principal) return principal;
  const extra = await prisma.unitRhSource.findUnique({ where: { rhName }, select: { unitId: true } });
  return extra ? { id: extra.unitId } : null;
}

/** Uma ida à lista de unidades e uma à lista geral (que traz o CNPJ de cada pessoa). */
export async function catalogoDoRh(): Promise<RazaoDoRh[]> {
  const [u, g] = await Promise.all([rh.unidades(), rh.colaboradores()]);
  const lista = (g as { data?: unknown })?.data;
  return catalogoDasRazoes(unwrapUnidades(u), Array.isArray(lista) ? (lista as { unidade?: string; unidade_cnpj?: string }[]) : []);
}

async function vinculosAtuais(): Promise<VinculoAtual[]> {
  const [units, extras] = await Promise.all([
    prisma.unit.findMany({ where: { rhUnitName: { not: null } }, select: { id: true, name: true, rhUnitName: true } }),
    prisma.unitRhSource.findMany({ select: { rhName: true, unit: { select: { id: true, name: true } } } }),
  ]);
  return [
    ...units.map((u) => ({ unitId: u.id, unitName: u.name, rhName: u.rhUnitName as string, tipo: 'PRINCIPAL' as const })),
    ...extras.map((e) => ({ unitId: e.unit.id, unitName: e.unit.name, rhName: e.rhName, tipo: 'ADICIONAL' as const })),
  ];
}

export type AdicionarResult =
  | { ok: true; rhName: string; criterio: Criterio; cnpj: string | null }
  | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_CONFIGURED' | 'SEM_PRINCIPAL' | 'JA_E_A_PRINCIPAL' | 'JA_VINCULADA' | 'RH_ERROR'; unidade?: string; message?: string }
  | Extract<Resolucao, { ok: false }>;

/**
 * Liga mais uma razão social do RH à unidade. Só ADMIN; o critério é
 * conferido CONTRA O RH no servidor (o que a tela manda nunca basta).
 */
export async function adicionarRazaoSocial(user: SessionUser, unitId: string, criterio: Criterio, valor: string, ctx: Ctx = {}): Promise<AdicionarResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (criterio !== 'NOME' && criterio !== 'CNPJ') return { ok: false, reason: 'VAZIO' };
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, name: true, rhUnitName: true } });
  if (!unit) return { ok: false, reason: 'NOT_FOUND' };
  /* A adicional complementa a principal: unidade sem principal nem entra no
     sync automático (que filtra por rhUnitName), e a adicional ficaria inerte. */
  if (!unit.rhUnitName) return { ok: false, reason: 'SEM_PRINCIPAL' };
  if (!rhConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };

  let catalogo: RazaoDoRh[];
  try { catalogo = await catalogoDoRh(); } catch (e) { return { ok: false, reason: 'RH_ERROR', message: e instanceof Error ? e.message : String(e) }; }
  const r = resolverVinculo(criterio, valor, catalogo);
  if (!r.ok) return r;

  if (r.rhName === unit.rhUnitName) return { ok: false, reason: 'JA_E_A_PRINCIPAL' };
  const dono = (await vinculosAtuais()).find((v) => v.rhName === r.rhName);
  if (dono) return { ok: false, reason: 'JA_VINCULADA', unidade: dono.unitName };

  await prisma.unitRhSource.create({ data: { unitId, rhName: r.rhName, cnpj: r.cnpj, criterio: r.criterio, createdById: user.id, createdByName: user.name } });
  await audit({ userId: user.id, unitId, action: 'UNIT_RH_SOURCE_ADD', module: 'CONFIG', entity: 'unit', entityId: unitId, metadata: { rhName: r.rhName, criterio: r.criterio, cnpj: r.cnpj, informado: valor.trim() }, ...ctx });
  return { ok: true, rhName: r.rhName, criterio: r.criterio, cnpj: r.cnpj };
}

/**
 * Desliga uma razão social adicional. NÃO desvincula colaboradores que já
 * entraram por ela (a mesma regra da v1.138.0: ausência numa resposta não
 * decide nada sozinha) — quem precisar sair, sai pelo prédio na lista de Pessoas.
 */
export async function removerRazaoSocial(user: SessionUser, id: string, ctx: Ctx = {}): Promise<{ ok: true } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' }> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const s = await prisma.unitRhSource.findUnique({ where: { id } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.unitRhSource.delete({ where: { id } });
  await audit({ userId: user.id, unitId: s.unitId, action: 'UNIT_RH_SOURCE_REMOVE', module: 'CONFIG', entity: 'unit', entityId: s.unitId, metadata: { rhName: s.rhName, criterio: s.criterio, cnpj: s.cnpj }, ...ctx });
  return { ok: true };
}

export async function listarRazoesAdicionais(unitIds: string[]) {
  return prisma.unitRhSource.findMany({ where: { unitId: { in: unitIds } }, orderBy: { createdAt: 'asc' }, select: { id: true, unitId: true, rhName: true, cnpj: true, criterio: true, createdByName: true, createdAt: true } });
}

/**
 * Conferência POR UNIDADE do SGO (só leitura): cada unidade ativa, o "Nome no
 * RH" (principal e adicionais) existe idêntico? O CNPJ cadastrado na unidade
 * aponta para razão social que ninguém lê? As outras empresas do grupo (postos,
 * transportadora…) não entram — a conferência parte das unidades, não do RH.
 */
export async function conferenciaDasRazoes(user: SessionUser): Promise<{ ok: true; conferencia: Conferencia } | { ok: false; reason: 'FORBIDDEN' | 'NOT_CONFIGURED' | 'RH_ERROR'; message?: string }> {
  if (user.role !== 'ADMIN' && user.role !== 'CEO') return { ok: false, reason: 'FORBIDDEN' };
  if (!rhConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };
  let catalogo: RazaoDoRh[];
  try { catalogo = await catalogoDoRh(); } catch (e) { return { ok: false, reason: 'RH_ERROR', message: e instanceof Error ? e.message : String(e) }; }
  const unidades = await prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, rhUnitName: true, cnpj: true, rhSources: { select: { rhName: true }, orderBy: { createdAt: 'asc' } } } });
  return { ok: true, conferencia: conferir(catalogo, unidades.map((u) => ({ id: u.id, name: u.name, rhUnitName: u.rhUnitName, cnpj: u.cnpj, adicionais: u.rhSources.map((s) => s.rhName) }))) };
}
