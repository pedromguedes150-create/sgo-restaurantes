import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { HEADER_API_KEY, PREFIXO_DA_CHAVE, pareceChaveDoSgo, pedacosDaChave } from '@/lib/api-global/formato';

export * from '@/lib/api-global/formato';

type Ctx = { ip?: string | null; userAgent?: string | null };

/**
 * API GLOBAL DO SGO — chaves por sistema (v1.129.0).
 *
 * Cada sistema da empresa (RH, Financeiro, Estoque, Compras, BI…) recebe a SUA
 * chave. A chave completa existe uma única vez: na resposta da criação. No
 * banco fica o SHA-256 — o mesmo desenho do refresh token (`jwt.ts`): vazar o
 * banco não vaza as chaves. Comparar é buscar pelo hash; o `timingSafeEqual`
 * fecha a diferença de tempo entre "hash certo" e "hash errado".
 *
 * Em paralelo às integrações que já existem: o token do RH (RH_INBOUND_TOKEN,
 * `.env`) e os endpoints /api/integracoes continuam exatamente como estavam.
 */

const hashDaChave = (chave: string) => createHash('sha256').update(chave).digest('hex');

/** 36 bytes → 48 caracteres url-safe depois do prefixo. */
function gerarChave(): string {
  return `${PREFIXO_DA_CHAVE}${randomBytes(36).toString('base64url')}`;
}

const GERE_CHAVES: readonly string[] = ['ADMIN', 'CEO'];

export type CriarResultado =
  | { ok: true; id: string; chave: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID'; detail?: string };

/** Cria o sistema e devolve a chave COMPLETA — a única vez em que ela sai do servidor. */
export async function criarChave(user: SessionUser, input: { name: string; description?: string | null }, ctx: Ctx = {}): Promise<CriarResultado> {
  if (!GERE_CHAVES.includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const name = String(input.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return { ok: false, reason: 'INVALID', detail: 'Informe o nome do sistema (2 a 80 caracteres).' };
  const description = String(input.description ?? '').trim().slice(0, 300) || null;

  const chave = gerarChave();
  const client = await prisma.apiClient.create({
    data: { name, description, keyHash: hashDaChave(chave), ...pedacosDaChave(chave), createdById: user.id },
    select: { id: true, keyPrefix: true },
  });
  /* A auditoria guarda o prefixo, nunca a chave. */
  await audit({ userId: user.id, action: 'API_KEY_CREATE', module: 'INTEGRATIONS', entity: 'api_client', entityId: client.id, metadata: { name, keyPrefix: client.keyPrefix }, ...ctx });
  return { ok: true, id: client.id, chave };
}

export type AcaoNaChave = 'ativar' | 'desativar' | 'revogar';
export type AcaoResultado = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'STATE'; detail?: string };

/**
 * Desativar é reversível (pausa); revogar é definitivo — a chave morre e o
 * sistema precisa de outra. Revogada não volta a ativar.
 */
export async function alterarChave(user: SessionUser, id: string, acao: AcaoNaChave, ctx: Ctx = {}): Promise<AcaoResultado> {
  if (!GERE_CHAVES.includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.apiClient.findUnique({ where: { id }, select: { id: true, name: true, active: true, revokedAt: true, keyPrefix: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  if (c.revokedAt) return { ok: false, reason: 'STATE', detail: 'Chave revogada não volta: crie uma nova para este sistema.' };

  const data = acao === 'ativar' ? { active: true } : acao === 'desativar' ? { active: false } : { active: false, revokedAt: new Date() };
  await prisma.apiClient.update({ where: { id }, data });
  await audit({ userId: user.id, action: `API_KEY_${acao.toUpperCase()}`, module: 'INTEGRATIONS', entity: 'api_client', entityId: id, metadata: { name: c.name, keyPrefix: c.keyPrefix }, ...ctx });
  return { ok: true };
}

export async function listarSistemas() {
  return prisma.apiClient.findMany({
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, name: true, description: true, keyPrefix: true, keyLast4: true, active: true, revokedAt: true, lastUsedAt: true, createdAt: true, createdBy: { select: { name: true } }, _count: { select: { requests: true } } },
  });
}

export async function ultimasChamadas(take = 30) {
  return prisma.apiRequestLog.findMany({ orderBy: { createdAt: 'desc' }, take });
}

export type Autenticado = { ok: true; client: { id: string; name: string } } | { ok: false };

/**
 * Lê `X-API-Key`, confere formato, busca pelo hash e exige ativa e não
 * revogada. Devolve só id e nome — o handler nunca vê a chave.
 */
export async function autenticarApiKey(req: Request): Promise<Autenticado> {
  const apresentada = req.headers.get(HEADER_API_KEY) ?? req.headers.get(HEADER_API_KEY.toLowerCase());
  if (!pareceChaveDoSgo(apresentada)) return { ok: false };
  const hash = hashDaChave(apresentada!);
  const c = await prisma.apiClient.findUnique({ where: { keyHash: hash }, select: { id: true, name: true, active: true, revokedAt: true, keyHash: true } });
  if (!c || !c.active || c.revokedAt) return { ok: false };
  if (!timingSafeEqual(Buffer.from(c.keyHash), Buffer.from(hash))) return { ok: false };
  /* Último uso: sem esperar — a resposta não deve depender desta gravação. */
  prisma.apiClient.update({ where: { id: c.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { ok: true, client: { id: c.id, name: c.name } };
}

/** Registra a chamada: sistema, método, caminho, status, duração e IP. A chave, nunca. */
export async function registrarChamada(e: { clientId: string | null; clientName: string; method: string; path: string; status: number; durationMs: number; ip: string | null }) {
  await prisma.apiRequestLog.create({ data: e }).catch(() => {});
}
