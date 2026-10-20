import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { normalizarCargo } from '@/lib/people/avaliacao-calculo';
import { cargosDoRh } from '@/lib/people/avaliacao-modelos';
import { PCT_COZINHA_PADRAO, PCT_VENDEDOR_PADRAO } from './calculo';

/**
 * Configuração da Comissão (v1.175.0): os dois percentuais e as FUNÇÕES que
 * dividem a parte da cozinha. Percentual é dinheiro — só o Admin muda; as
 * funções são marcadas pelo Admin ou pelo Coordenador (pedido do Pedro:
 * "conforme a função que o Adm ou Coordenador marca antes").
 */

const SELLER_KEY = 'COMMISSION_SELLER_PCT';
const KITCHEN_KEY = 'COMMISSION_KITCHEN_PCT';
export const PODE_CONFIGURAR_FUNCOES = new Set(['ADMIN', 'CEO', 'COORDINATOR']);

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoConfig = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID'; message?: string };

async function lerPct(key: string, def: number): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  const n = s ? Number(s.value) : def;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : def;
}

export async function getPercentuais(): Promise<{ vendedor: number; cozinha: number }> {
  const [vendedor, cozinha] = await Promise.all([lerPct(SELLER_KEY, PCT_VENDEDOR_PADRAO), lerPct(KITCHEN_KEY, PCT_COZINHA_PADRAO)]);
  return { vendedor, cozinha };
}

export async function setPercentuais(user: SessionUser, input: { vendedor: number; cozinha: number }, ctx: Ctx = {}): Promise<ResultadoConfig> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const v = Number(input.vendedor); const c = Number(input.cozinha);
  if (![v, c].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) return { ok: false, reason: 'INVALID', message: 'Percentual entre 0 e 100.' };
  const antes = await getPercentuais();
  await prisma.$transaction([
    prisma.appSetting.upsert({ where: { key: SELLER_KEY }, create: { key: SELLER_KEY, value: String(v) }, update: { value: String(v) } }),
    prisma.appSetting.upsert({ where: { key: KITCHEN_KEY }, create: { key: KITCHEN_KEY, value: String(c) }, update: { value: String(c) } }),
  ]);
  await audit({ userId: user.id, action: 'COMMISSION_PCT_SET', module: 'CONFIG', metadata: { antes, depois: { vendedor: v, cozinha: c } }, ...ctx });
  return { ok: true };
}

export interface FuncaoDaCozinha { jobTitle: string; jobTitleKey: string; colaboradores: number; marcada: boolean }

/** Todos os cargos do RH (ativos), com a marca de quem divide a cozinha. */
export async function quadroDeFuncoes(): Promise<FuncaoDaCozinha[]> {
  const [cargos, marcadas] = await Promise.all([cargosDoRh(), prisma.commissionKitchenJobTitle.findMany()]);
  const chaves = new Set(marcadas.map((m) => m.jobTitleKey));
  const vistos = new Set<string>();
  const out: FuncaoDaCozinha[] = cargos.map((c) => { vistos.add(c.jobTitleKey); return { ...c, marcada: chaves.has(c.jobTitleKey) }; });
  /* Função marcada que já não tem ninguém ativo no RH continua na lista, para
     poder ser desmarcada — sumir calada deixaria uma regra invisível gravada. */
  for (const m of marcadas) if (!vistos.has(m.jobTitleKey)) out.push({ jobTitle: m.jobTitle, jobTitleKey: m.jobTitleKey, colaboradores: 0, marcada: true });
  return out;
}

/** Chaves (normalizadas) das funções que dividem a cozinha. */
export async function chavesDaCozinha(): Promise<Set<string>> {
  const rows = await prisma.commissionKitchenJobTitle.findMany({ select: { jobTitleKey: true } });
  return new Set(rows.map((r) => r.jobTitleKey));
}

/** Substitui o conjunto de funções da cozinha pelo informado (cargos como grafados no RH). */
export async function definirFuncoesDaCozinha(user: SessionUser, jobTitles: string[], ctx: Ctx = {}): Promise<ResultadoConfig> {
  if (!PODE_CONFIGURAR_FUNCOES.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const porChave = new Map<string, string>();
  for (const j of jobTitles) { const k = normalizarCargo(j); if (k) porChave.set(k, j.trim()); }
  const antes = (await prisma.commissionKitchenJobTitle.findMany()).map((m) => m.jobTitle);
  await prisma.$transaction([
    prisma.commissionKitchenJobTitle.deleteMany({}),
    prisma.commissionKitchenJobTitle.createMany({ data: [...porChave.entries()].map(([jobTitleKey, jobTitle]) => ({ jobTitleKey, jobTitle, createdByName: user.name })) }),
  ]);
  await audit({ userId: user.id, action: 'COMMISSION_KITCHEN_JOBS_SET', module: 'CONFIG', metadata: { antes, depois: [...porChave.values()] }, ...ctx });
  return { ok: true };
}
