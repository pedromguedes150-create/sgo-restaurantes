import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { mascararToken, type OrigemDoToken } from '@/lib/rh/saida/config';

/**
 * TOKEN DE ENTRADA DO RH PELA TELA (v1.183.0) — o segundo sentido da
 * integração. O RH chama o SGO (admissão, desligamento, período aquisitivo)
 * com `Authorization: Bearer <token>`; esse token precisa ser o MESMO nos dois
 * lados. Antes ele só vivia em `RH_INBOUND_TOKEN` no `.env` do servidor, e
 * quem opera o SGO não tem SSH — o mesmo beco da v1.182.2, agora no sentido
 * RH → SGO.
 *
 * v1.211.0 — A TELA VENCE O `.env` (só neste token, o de ENTRADA). O token do
 * servidor não pode ser lido por ninguém sem SSH; quando o RH perdeu o valor
 * (18/11/2026), não havia como recuperar nem trocar. Agora o Admin grava um
 * token novo pela tela e ele passa a valer no lugar do do servidor; remover o
 * da tela devolve o do servidor. O valor nunca vai inteiro para a Auditoria
 * nem volta para a tela (só mascarado). Não há "testar conexão": é o RH
 * que chama o SGO, e o teste é o próximo evento dele aparecer na lista de
 * recebidos (a tela diz isso).
 */
export const CHAVE_DO_TOKEN_DE_ENTRADA = 'RH_INBOUND_TOKEN';
export const TOKEN_MIN = 16;

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoDoTokenDeEntrada = { ok: true; mascarado: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID'; message?: string };

const PODE = (role: string) => role === 'ADMIN' || role === 'CEO';

function tokenDoAmbiente(): string {
  return process.env.RH_INBOUND_TOKEN?.trim() ?? '';
}
async function tokenDoBanco(): Promise<string> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: CHAVE_DO_TOKEN_DE_ENTRADA } });
    return s?.value.trim() ?? '';
  } catch { return ''; }
}

/** O token em vigor: o gravado pela TELA primeiro; senão o do `.env`; senão vazio. */
export async function tokenDeEntrada(): Promise<string> {
  return (await tokenDoBanco()) || tokenDoAmbiente();
}

/** Para a tela: de onde o token em vigor veio (nunca o token). */
export async function origemDoTokenDeEntrada(): Promise<OrigemDoToken> {
  if (await tokenDoBanco()) return 'tela';
  if (tokenDoAmbiente()) return 'servidor';
  return 'nenhum';
}

/** Existe um token no `.env`? É para onde a porta volta se o da tela for removido. */
export function haTokenDeEntradaNoServidor(): boolean {
  return tokenDoAmbiente() !== '';
}

/** Comparação em tempo constante: tokens de tamanhos diferentes nunca batem. */
function igual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * A porta dos webhooks do RH: `Authorization: Bearer <token>` ou `x-api-key`.
 * Sem token configurado (nem `.env`, nem tela) NINGUÉM entra.
 */
export async function inboundAutorizado(req: Request): Promise<boolean> {
  const token = await tokenDeEntrada();
  if (!token) return false;
  const h = req.headers.get('authorization') ?? '';
  const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  return igual(bearer, token) || igual(req.headers.get('x-api-key') ?? '', token);
}

export async function definirTokenDeEntrada(user: SessionUser, token: string, ctx: Ctx = {}): Promise<ResultadoDoTokenDeEntrada> {
  if (!PODE(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const t = String(token ?? '').trim();
  if (t.length < TOKEN_MIN || /\s/.test(t)) return { ok: false, reason: 'INVALID', message: `Cole o token inteiro (mínimo ${TOKEN_MIN} caracteres, sem espaços).` };
  await prisma.appSetting.upsert({ where: { key: CHAVE_DO_TOKEN_DE_ENTRADA }, create: { key: CHAVE_DO_TOKEN_DE_ENTRADA, value: t }, update: { value: t } });
  await audit({ userId: user.id, action: 'RH_INBOUND_TOKEN_SET', module: 'CONFIG', metadata: { token: mascararToken(t) }, ...ctx });
  return { ok: true, mascarado: mascararToken(t) };
}

export async function removerTokenDeEntrada(user: SessionUser, ctx: Ctx = {}): Promise<ResultadoDoTokenDeEntrada> {
  if (!PODE(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.appSetting.deleteMany({ where: { key: CHAVE_DO_TOKEN_DE_ENTRADA } });
  await audit({ userId: user.id, action: 'RH_INBOUND_TOKEN_REMOVED', module: 'CONFIG', ...ctx });
  return { ok: true, mascarado: '—' };
}
