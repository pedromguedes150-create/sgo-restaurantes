/**
 * Configuração do envio SGO → GBF-RH, lida do ambiente NA HORA (não na carga do
 * módulo): é o que permite a fila ficar inerte sem token e começar a esvaziar
 * sozinha assim que o `.env` ganhar o token e o app reiniciar.
 *
 * Decisão do Pedro (14/10/2026): `RH_API_URL` é a variável principal e
 * `RH_API_BASE_URL` (a do sync de colaboradores) fica como compatibilidade —
 * com as duas, vale `RH_API_URL`.
 */
const BASE_PADRAO = 'https://gbf-rh.replit.app';

export function rhSaidaBase(): string {
  const v = process.env.RH_API_URL?.trim() || process.env.RH_API_BASE_URL?.trim() || BASE_PADRAO;
  return v.replace(/\/+$/, '');
}

export function rhSaidaToken(): string {
  return process.env.RH_WEBHOOK_TOKEN?.trim() ?? '';
}

export function rhSaidaConfigurada(): boolean {
  return Boolean(rhSaidaToken());
}

/** Para a tela: de onde veio a base (nunca o token). */
export function origemDaBase(): 'RH_API_URL' | 'RH_API_BASE_URL' | 'padrão' {
  if (process.env.RH_API_URL?.trim()) return 'RH_API_URL';
  if (process.env.RH_API_BASE_URL?.trim()) return 'RH_API_BASE_URL';
  return 'padrão';
}
