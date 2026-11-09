import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { NOMENCLATURAS, normalizarNome, nomenclaturaPorNome, type Nomenclatura } from '@/lib/certificates/catalogo';
import { regraVigente, duracaoDaRegra, type RegraVigente } from '@/lib/certificates/regras-legais';
import type { SessionUser } from '@/lib/auth/session';

/**
 * CONFIGURAÇÃO POR NOMENCLATURA (v1.198.0, etapa C) — a "estrutura interna de
 * correspondência" da spec: grupo, nome no SGO, nome no sistema do RH, regra
 * aplicável (com versão e vigência) e se está ativa. O catálogo (os 25 nomes)
 * é código; aqui só o que o Admin ajusta. Nada disso cria código de tipo.
 */
export interface ConfigDaNomenclatura {
  nome: string;
  grupo: Nomenclatura['grupo'];
  tipo: Nomenclatura['tipo'];
  escala: Nomenclatura['escala'];
  comprovacao: string;
  regra: string;
  /** Regra legal vigente HOJE (versão/desde/base) — null sem regra de duração. */
  regraVigente: RegraVigente | null;
  /** Dias que valem hoje: a sobreposição do Admin, se houver, senão a regra. */
  diasVigentes: number | null;
  rhName: string | null;
  active: boolean;
  ruleDays: number | null;
  notes: string | null;
  updatedAt: string | null;
}

type Linha = { nomenclature: string; rhName: string | null; active: boolean; ruleDays: number | null; notes: string | null; updatedAt: Date };

/** Mapa nome → configuração gravada (só as que têm linha). */
export async function carregarConfigDasNomenclaturas(): Promise<Map<string, Linha>> {
  const rows = await prisma.certificateNomenclatureConfig.findMany();
  return new Map(rows.map((r) => [r.nomenclature, r]));
}

export function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** O catálogo inteiro com a configuração por cima — o que a tela do Admin mostra. */
export async function listarConfigDasNomenclaturas(): Promise<ConfigDaNomenclatura[]> {
  const cfg = await carregarConfigDasNomenclaturas();
  const hoje = hojeISO();
  return NOMENCLATURAS.map((n) => {
    const c = cfg.get(n.nome);
    return {
      nome: n.nome, grupo: n.grupo, tipo: n.tipo, escala: n.escala, comprovacao: n.comprovacao, regra: n.regra,
      regraVigente: regraVigente(n.nome, hoje),
      diasVigentes: duracaoDaRegra(n.nome, hoje, c?.ruleDays ?? null),
      rhName: c?.rhName ?? null, active: c?.active ?? true, ruleDays: c?.ruleDays ?? null, notes: c?.notes ?? null,
      updatedAt: c?.updatedAt ? c.updatedAt.toISOString() : null,
    };
  });
}

/** Só as nomenclaturas ATIVAS — a lista fechada que a IA recebe. */
export async function nomenclaturasAtivas(): Promise<Nomenclatura[]> {
  const cfg = await carregarConfigDasNomenclaturas();
  return NOMENCLATURAS.filter((n) => cfg.get(n.nome)?.active !== false);
}

/** Função "dias da regra" já com a sobreposição do Admin — para a IA e para os alertas. */
export function diasDaRegraCom(cfg: Map<string, Linha>): (nomenclatura: string, inicio: string | null | undefined) => number | null {
  return (nomenclatura, inicio) => duracaoDaRegra(nomenclatura, inicio, cfg.get(nomenclatura)?.ruleDays ?? null);
}

/** O nome que vai ao RH: o configurado, senão o do catálogo. */
export function nomeNoRh(nomenclatura: string, cfg: Map<string, Linha>): string {
  return cfg.get(nomenclatura)?.rhName?.trim() || nomenclatura;
}

/**
 * Casa um texto vindo do RH com uma nomenclatura: primeiro pelo nome que o RH
 * usa (`rhName`), depois pelo catálogo/sinônimos. Assim o RH pode responder com
 * a grafia DELE e o SGO entende.
 */
export function nomenclaturaPeloNomeDoRh(texto: string | null | undefined, cfg: Map<string, Linha>): Nomenclatura | null {
  if (!texto) return null;
  const n = normalizarNome(texto);
  for (const [nome, c] of cfg) if (c.rhName && normalizarNome(c.rhName) === n) return nomenclaturaPorNome(nome);
  return nomenclaturaPorNome(texto);
}

export type ResultadoDaConfig = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID'; message?: string };
type Ctx = { ip?: string | null; userAgent?: string | null };
const PODE_CONFIGURAR = ['ADMIN', 'CEO'];

export async function atualizarConfigDaNomenclatura(
  user: SessionUser,
  nomenclatura: string,
  input: { rhName?: string | null; active?: boolean; ruleDays?: number | null; notes?: string | null },
  ctx: Ctx = {},
): Promise<ResultadoDaConfig> {
  if (!PODE_CONFIGURAR.includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const n = nomenclaturaPorNome(nomenclatura);
  if (!n) return { ok: false, reason: 'NOT_FOUND', message: 'Nomenclatura fora do catálogo.' };
  const rhName = input.rhName === undefined ? undefined : (input.rhName?.trim() || null);
  if (rhName && rhName.length > 120) return { ok: false, reason: 'INVALID', message: 'Nome no RH com mais de 120 caracteres.' };
  /* Dois nomes do SGO não podem apontar para o MESMO nome do RH — a correspondência viraria ambígua. */
  if (rhName) {
    const cfg = await carregarConfigDasNomenclaturas();
    for (const [outro, c] of cfg) if (outro !== n.nome && c.rhName && normalizarNome(c.rhName) === normalizarNome(rhName)) {
      return { ok: false, reason: 'INVALID', message: `"${rhName}" já é o nome no RH de "${outro}". Dois tipos do SGO não podem ter o mesmo nome no RH.` };
    }
    const colide = NOMENCLATURAS.find((x) => x.nome !== n.nome && normalizarNome(x.nome) === normalizarNome(rhName));
    if (colide) return { ok: false, reason: 'INVALID', message: `"${rhName}" é o nome de outra nomenclatura do SGO ("${colide.nome}").` };
  }
  let ruleDays: number | null | undefined = input.ruleDays;
  if (ruleDays !== undefined && ruleDays !== null) {
    if (!Number.isInteger(ruleDays) || ruleDays < 1 || ruleDays > 365) return { ok: false, reason: 'INVALID', message: 'Dias da regra: inteiro de 1 a 365, ou vazio para usar a tabela legal.' };
    if (n.tipo === 'HOURS' || (n.grupo !== 'LICENCA' && n.grupo !== 'COMPARECIMENTO')) return { ok: false, reason: 'INVALID', message: 'Só licenças e comparecimentos de dia inteiro têm regra de duração.' };
  }
  if (ruleDays === undefined) ruleDays = undefined;
  const notes = input.notes === undefined ? undefined : (input.notes?.trim().slice(0, 500) || null);

  const antes = await prisma.certificateNomenclatureConfig.findUnique({ where: { nomenclature: n.nome } });
  await prisma.certificateNomenclatureConfig.upsert({
    where: { nomenclature: n.nome },
    create: { nomenclature: n.nome, rhName: rhName ?? null, active: input.active ?? true, ruleDays: ruleDays ?? null, notes: notes ?? null, updatedById: user.id },
    update: { ...(rhName !== undefined ? { rhName } : {}), ...(input.active !== undefined ? { active: input.active } : {}), ...(ruleDays !== undefined ? { ruleDays } : {}), ...(notes !== undefined ? { notes } : {}), updatedById: user.id },
  });
  await audit({ userId: user.id, action: 'CERT_NOMENCLATURE_CONFIG', module: 'PEOPLE', entity: 'certificate_nomenclature_config', entityId: n.nome, metadata: { antes: antes ? { rhName: antes.rhName, active: antes.active, ruleDays: antes.ruleDays } : null, depois: { rhName: rhName ?? antes?.rhName ?? null, active: input.active ?? antes?.active ?? true, ruleDays: ruleDays ?? antes?.ruleDays ?? null } }, ...ctx });
  return { ok: true };
}
