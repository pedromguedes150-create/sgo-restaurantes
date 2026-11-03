import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { CHAVE_DO_TOKEN, mascararToken, origemDoToken, rhSaidaToken } from './config';
import { ENDPOINTS } from './regras';
import { postRh, RhSaidaTransporteError } from './transporte';

/**
 * TOKEN DO RH PELA TELA (v1.182.2). O Admin cola o token que o RH passou e o
 * SGO guarda em `app_settings` (a mesma tabela dos demais ajustes). O valor
 * nunca vai para a Auditoria nem para a tela inteiro — só mascarado.
 *
 * Por que no banco e não só no `.env`: quem opera o SGO no dia a dia não tem
 * acesso ao servidor; sem isto, um token novo do RH exigia alguém com SSH e
 * um reinício. O `.env` continua valendo e, se existir, vence.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoDoToken = { ok: true; mascarado: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID'; message?: string };

const PODE = (role: string) => role === 'ADMIN' || role === 'CEO';
export const TOKEN_MIN = 16;

export async function definirTokenDoRh(user: SessionUser, token: string, ctx: Ctx = {}): Promise<ResultadoDoToken> {
  if (!PODE(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const t = String(token ?? '').trim();
  if (t.length < TOKEN_MIN || /\s/.test(t)) return { ok: false, reason: 'INVALID', message: `Cole o token inteiro (mínimo ${TOKEN_MIN} caracteres, sem espaços).` };
  await prisma.appSetting.upsert({ where: { key: CHAVE_DO_TOKEN }, create: { key: CHAVE_DO_TOKEN, value: t }, update: { value: t } });
  await audit({ userId: user.id, action: 'RH_WEBHOOK_TOKEN_SET', module: 'CONFIG', metadata: { token: mascararToken(t) }, ...ctx });
  return { ok: true, mascarado: mascararToken(t) };
}

export async function removerTokenDoRh(user: SessionUser, ctx: Ctx = {}): Promise<ResultadoDoToken> {
  if (!PODE(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.appSetting.deleteMany({ where: { key: CHAVE_DO_TOKEN } });
  await audit({ userId: user.id, action: 'RH_WEBHOOK_TOKEN_REMOVED', module: 'CONFIG', ...ctx });
  return { ok: true, mascarado: '—' };
}

export interface TesteDoToken {
  /** O RH aceitou a autenticação (respondeu algo que não é 401). */
  aceito: boolean;
  http: number | null;
  mensagem: string;
  origem: Awaited<ReturnType<typeof origemDoToken>>;
}

/**
 * Testa o token em vigor SEM criar nada no RH: manda um corpo vazio ao
 * endpoint de atestados — 401 = token recusado; 400/422 ("Required") = o RH
 * leu a autenticação e reclamou só dos campos, que é o esperado.
 */
export async function testarTokenDoRh(): Promise<TesteDoToken> {
  const origem = await origemDoToken();
  if (!(await rhSaidaToken())) return { aceito: false, http: null, mensagem: 'Nenhum token configurado.', origem };
  try {
    const r = await postRh(ENDPOINTS.ATESTADO, {});
    if (r.status === 401 || r.status === 403) return { aceito: false, http: r.status, mensagem: 'O RH recusou o token. Confira se é o token da integração de SAÍDA do SGO (não a chave da API v2).', origem };
    if (r.status >= 500) return { aceito: false, http: r.status, mensagem: 'O RH está fora do ar no momento; tente de novo em alguns minutos.', origem };
    return { aceito: true, http: r.status, mensagem: 'Token aceito pelo RH. Os envios pendentes vão sair na próxima rodada (ou em "Processar fila agora").', origem };
  } catch (e) {
    return { aceito: false, http: null, mensagem: e instanceof RhSaidaTransporteError ? e.message : 'Falha ao chamar o RH.', origem };
  }
}
