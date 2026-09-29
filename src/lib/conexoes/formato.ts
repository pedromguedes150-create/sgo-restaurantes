/**
 * CONEXÕES COM OUTROS SISTEMAS — a parte PURA (v1.131.0).
 *
 * Sem import de servidor: a tela de Integrações é componente cliente e lê daqui.
 *
 * Separação que dá nome às coisas:
 *   - `ApiClient` (api-global/*) = quem consome a API Global DESTE SGO;
 *   - Conexão externa (conexoes/*) = API de OUTRO sistema que este SGO consome.
 * As duas moram na mesma central administrativa, mas são espelhos: numa a
 * credencial é nossa e fica em hash; na outra a credencial é deles e precisa
 * ser recuperável (cifrada) para sair no header de cada chamada.
 */

export type TipoDeAuth = 'API_KEY_HEADER' | 'BEARER';

export const HEADER_PADRAO = 'x-api-key';

export const AUTH_OPCOES: { value: TipoDeAuth; label: string; hint: string }[] = [
  { value: 'API_KEY_HEADER', label: 'Chave no header', hint: 'ex.: x-api-key: <chave> — o padrão do SGO RH' },
  { value: 'BEARER', label: 'Bearer token', hint: 'Authorization: Bearer <token>' },
];

export const AUTH_TEXTO: Record<TipoDeAuth, string> = { API_KEY_HEADER: 'header', BEARER: 'Bearer' };

/** Descrição curta da autenticação para a tabela: "header x-api-key" / "Bearer". */
export function descreverAuth(authType: TipoDeAuth, authHeader: string): string {
  return authType === 'BEARER' ? 'Authorization: Bearer' : `header ${authHeader}`;
}

/** Sem barra no fim; sem espaços nas pontas. A URL é comparada e concatenada, então precisa ser canônica. */
export function normalizarUrlBase(u: string): string {
  return String(u ?? '').trim().replace(/\/+$/, '');
}

/**
 * URL base aceitável: https, ou http só para endereço local (desenvolvimento).
 * Sem query nem fragmento — o caminho da chamada é que carrega isso.
 */
export function urlBaseValida(u: string): boolean {
  const s = normalizarUrlBase(u);
  if (!s || s.length > 300) return false;
  let url: URL;
  try { url = new URL(s); } catch { return false; }
  if (url.search || url.hash) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return false;
}

/** Nome de header: só o que a RFC aceita. Evita cabeçalho quebrado (e injeção de linha). */
export function headerValido(h: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(String(h ?? '').trim());
}

/**
 * Caminho relativo à base, curto, sem subir diretório e sem `//` (um caminho
 * que começa com duas barras vira outra origem em qualquer resolvedor de URL).
 * A mesma régua do ping da v2 do RH.
 */
export function caminhoValido(p: string): boolean {
  return /^\/[A-Za-z0-9_\-/.]{0,200}(\?[A-Za-z0-9_\-=&%.]{0,300})?$/.test(p) && !p.includes('..') && !p.includes('//');
}

/** Como a credencial aparece depois de guardada: nunca mais que os 4 últimos. */
export function mascararCredencial(last4: string): string {
  return `••••••••${last4}`;
}

export type SituacaoDaConexao = 'ATIVA' | 'DESATIVADA';
export const SITUACAO_TEXTO: Record<SituacaoDaConexao, string> = { ATIVA: 'Ativa', DESATIVADA: 'Desativada' };

export interface ResultadoResumido {
  lastOk: boolean | null;
  lastStatus: number | null;
  lastResult: string | null;
  lastUsedAt: string | Date | null;
}

/** "Nunca usada" · "OK (200)" · "Falha (401): Não autorizado". */
export function textoDoResultado(r: ResultadoResumido): string {
  if (r.lastOk == null) return 'Nunca usada';
  const st = r.lastStatus != null ? ` (${r.lastStatus})` : '';
  if (r.lastOk) return `OK${st}`;
  return `Falha${st}${r.lastResult ? `: ${r.lastResult}` : ''}`;
}

export function tomDoResultado(r: ResultadoResumido): 'success' | 'critical' | 'neutral' {
  if (r.lastOk == null) return 'neutral';
  return r.lastOk ? 'success' : 'critical';
}

/** Mensagem de erro curta e sem segredo: corta em 300 e nunca ecoa o header. */
export function encurtarErro(msg: string): string {
  return String(msg ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
}
