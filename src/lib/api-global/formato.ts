/**
 * API GLOBAL DO SGO — a parte PURA (v1.129.0): formato da chave e máscara.
 * Sem import de servidor: a tela de Integrações é componente cliente e lê daqui.
 */

export const API_BASE_PATH = '/api/v1';
export const API_VERSION = 'v1';
export const HEADER_API_KEY = 'X-API-Key';

/** Prefixo fixo: reconhecível num log ou num .env de outro sistema — e nunca confundível com o token do RH. */
export const PREFIXO_DA_CHAVE = 'sgo_live_';

/** Quantos caracteres depois do prefixo ficam guardados para reconhecer a chave na tela. */
const RECONHECIVEL = 8;

export function pareceChaveDoSgo(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith(PREFIXO_DA_CHAVE) && v.length >= PREFIXO_DA_CHAVE.length + 32;
}

/** O que fica no banco e na tela: "sgo_live_ab12cd34" + últimos 4. */
export function pedacosDaChave(chave: string): { keyPrefix: string; keyLast4: string } {
  return { keyPrefix: chave.slice(0, PREFIXO_DA_CHAVE.length + RECONHECIVEL), keyLast4: chave.slice(-4) };
}

/** Como a chave aparece depois de criada: "sgo_live_ab12cd34…f9k2". */
export function mascarar(keyPrefix: string, keyLast4: string): string {
  return `${keyPrefix}…${keyLast4}`;
}

export type SituacaoDaChave = 'ATIVA' | 'DESATIVADA' | 'REVOGADA';

export function situacaoDaChave(c: { active: boolean; revokedAt: Date | string | null }): SituacaoDaChave {
  if (c.revokedAt) return 'REVOGADA';
  return c.active ? 'ATIVA' : 'DESATIVADA';
}

export const SITUACAO_TEXTO: Record<SituacaoDaChave, string> = { ATIVA: 'Ativa', DESATIVADA: 'Desativada', REVOGADA: 'Revogada' };
