import { prisma } from '@/lib/db/prisma';

/**
 * Configuração do envio SGO → GBF-RH, lida NA HORA (não na carga do módulo):
 * é o que permite a fila ficar inerte sem token e começar a esvaziar sozinha
 * assim que o token aparecer.
 *
 * Decisão do Pedro (14/10/2026): `RH_API_URL` é a variável principal e
 * `RH_API_BASE_URL` (a do sync de colaboradores) fica como compatibilidade —
 * com as duas, vale `RH_API_URL`.
 *
 * v1.182.2 — o TOKEN também pode vir da TELA (Configurações → APIs &
 * Integrações → Envios ao RH), gravado em `app_settings` pela chave
 * `RH_WEBHOOK_TOKEN`: o Admin que não tem acesso ao servidor consegue ligar o
 * envio sozinho, sem `.env` nem reinício. O `.env`, quando existe, VENCE o
 * banco (quem administra o servidor manda); a tela diz de onde o token veio.
 */
const BASE_PADRAO = 'https://gbf-rh.replit.app';
export const CHAVE_DO_TOKEN = 'RH_WEBHOOK_TOKEN';

export function rhSaidaBase(): string {
  const v = process.env.RH_API_URL?.trim() || process.env.RH_API_BASE_URL?.trim() || BASE_PADRAO;
  return v.replace(/\/+$/, '');
}

function tokenDoAmbiente(): string {
  return process.env.RH_WEBHOOK_TOKEN?.trim() ?? '';
}
async function tokenDoBanco(): Promise<string> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: CHAVE_DO_TOKEN } });
    return s?.value.trim() ?? '';
  } catch { return ''; }
}

/** O token em vigor: `.env` primeiro; senão o gravado pela tela; senão vazio. */
export async function rhSaidaToken(): Promise<string> {
  return tokenDoAmbiente() || (await tokenDoBanco());
}

export async function rhSaidaConfigurada(): Promise<boolean> {
  return Boolean(await rhSaidaToken());
}

export type OrigemDoToken = 'servidor' | 'tela' | 'nenhum';
/** Para a tela: de onde o token em vigor veio (nunca o token). */
export async function origemDoToken(): Promise<OrigemDoToken> {
  if (tokenDoAmbiente()) return 'servidor';
  if (await tokenDoBanco()) return 'tela';
  return 'nenhum';
}

/** Para a tela: de onde veio a base (nunca o token). */
export function origemDaBase(): 'RH_API_URL' | 'RH_API_BASE_URL' | 'padrão' {
  if (process.env.RH_API_URL?.trim()) return 'RH_API_URL';
  if (process.env.RH_API_BASE_URL?.trim()) return 'RH_API_BASE_URL';
  return 'padrão';
}

/** Máscara para exibição: 6 primeiros … 4 últimos. */
export function mascararToken(t: string): string {
  if (!t) return '—';
  if (t.length <= 12) return `${t.slice(0, 2)}…${t.slice(-2)}`;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}
