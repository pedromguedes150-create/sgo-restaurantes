import { prisma } from '@/lib/db/prisma';
import { rhConfigured, RhApiError } from '@/lib/rh/client';
import { executarChamada } from '@/lib/conexoes/cliente';
import { decifrar } from '@/lib/conexoes/cripto';
import { unwrapColaboradores, type RhColaborador } from '@/lib/rh/normalize';
import { filtrarPorCnpj, filtrarPorRazaoSocial, normalizarCnpj, type Vinculo } from '@/lib/rh/vinculo';

export { RhApiError };

/**
 * TRANSPORTE DO RH PELA CENTRAL (v1.132.0).
 *
 * O sync, o diagnóstico e o sync diário passam a falar com o RH pela conexão
 * cadastrada em "Conexões com outros sistemas" — URL base, tipo de
 * autenticação, header e credencial decifrada no servidor. Cada chamada vira
 * uma linha em `external_request_logs`, como qualquer outra conexão.
 *
 * Qual conexão é "a do RH": a ativa marcada com `systemKey = 'RH'`. Enquanto
 * nenhuma estiver marcada, vale a ativa cuja base tem o MESMO host da
 * `RH_API_BASE_URL` (é o caso da conexão já cadastrada antes do campo existir).
 *
 * FALLBACK TEMPORÁRIO: sem conexão ativa, a configuração antiga do `.env`
 * continua valendo — e a chamada também é registrada, com o nome
 * "RH (fallback .env)", para o uso do fallback ficar visível na Central.
 */

export const RH_SYSTEM_KEY = 'RH';
export const NOME_DO_FALLBACK = 'RH (fallback .env)';

export type OrigemDoRh =
  | { origem: 'conexao'; id: string; nome: string; baseUrl: string; authType: 'API_KEY_HEADER' | 'BEARER'; authHeader: string; credentialEnc: string; marcada: boolean }
  | { origem: 'env'; baseUrl: string }
  | { origem: 'nenhuma' };

function hostDe(u: string): string | null {
  try { return new URL(u).hostname.toLowerCase(); } catch { return null; }
}

export async function resolverRh(): Promise<OrigemDoRh> {
  const sel = { id: true, name: true, baseUrl: true, authType: true, authHeader: true, credentialEnc: true } as const;
  const marcada = await prisma.externalConnection.findFirst({ where: { active: true, systemKey: RH_SYSTEM_KEY }, orderBy: { updatedAt: 'desc' }, select: sel });
  if (marcada) return { origem: 'conexao', ...marcada, nome: marcada.name, marcada: true };

  const baseEnv = process.env.RH_API_BASE_URL ?? 'https://gbf-rh.replit.app';
  const host = hostDe(baseEnv);
  if (host) {
    const ativas = await prisma.externalConnection.findMany({ where: { active: true }, orderBy: { updatedAt: 'desc' }, select: sel });
    const mesmaCasa = ativas.find((c) => hostDe(c.baseUrl) === host);
    if (mesmaCasa) return { origem: 'conexao', ...mesmaCasa, nome: mesmaCasa.name, marcada: false };
  }
  if (rhConfigured()) return { origem: 'env', baseUrl: baseEnv };
  return { origem: 'nenhuma' };
}

/** O RH pode ser consultado? Conexão ativa na Central OU chave antiga no .env. */
export async function rhDisponivel(): Promise<boolean> {
  return (await resolverRh()).origem !== 'nenhuma';
}

/**
 * GET no RH pelo caminho resolvido acima. Lança RhApiError como o cliente de
 * sempre — quem chama (sync, diagnóstico) não muda.
 */
export async function rhGetCentral<T = unknown>(path: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<T> {
  const r = await resolverRh();
  if (r.origem === 'nenhuma') throw new RhApiError('RH não configurado: cadastre a conexão na Central ou RH_API_KEY no .env', 401);

  const alvo = r.origem === 'conexao'
    ? { connectionId: r.id, connectionName: r.nome, baseUrl: r.baseUrl, authType: r.authType, authHeader: r.authHeader, credential: await decifrar(r.credentialEnc) }
    : { connectionId: null, connectionName: NOME_DO_FALLBACK, baseUrl: r.baseUrl.replace(/\/+$/, ''), authType: 'API_KEY_HEADER' as const, authHeader: 'x-api-key', credential: process.env.RH_API_KEY ?? '' };

  if (r.origem === 'env') console.warn(`[rh] usando o fallback do .env para ${path} — cadastre/ative a conexão do RH na Central`);

  const res = await executarChamada(alvo, { path, fetchImpl: opts.fetchImpl });
  if (!res.ok) throw new RhApiError(res.error ?? `Falha RH (${res.status ?? 'sem resposta'})`, res.status ?? 503);
  const data = res.data;
  if (data && typeof data === 'object' && 'success' in data && (data as { success?: unknown }).success === false) {
    throw new RhApiError(String((data as { error?: unknown }).error ?? 'Falha RH'), res.status ?? 502);
  }
  return data as T;
}

/** Os mesmos endpoints do cliente de sempre, agora pela Central. */
export interface RhApi {
  colaboradores: () => Promise<unknown>;
  unidades: () => Promise<unknown>;
  colaboradoresDaUnidade: (unidade: string) => Promise<unknown>;
}
/**
 * Segmento de URL à prova de razão social: `encodeURIComponent` deixa
 * `( ) ! ' *` sem codificar (RFC 2396); a validação de caminho da Central segue
 * a RFC 3986 e os recusa. Codifica esses também.
 */
export function codificarSegmento(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export const rh: RhApi = {
  colaboradores: () => rhGetCentral('/api/ext/colaboradores'),
  unidades: () => rhGetCentral('/api/ext/colaboradores/unidades'),
  /* Mantido por compatibilidade (rota real da v1); o sync e o diagnóstico NÃO
     o usam mais — filtram a lista completa no SGO (ver listaParaUnidade). */
  colaboradoresDaUnidade: (unidade: string) => rhGetCentral(`/api/ext/colaboradores/unidade/${codificarSegmento(unidade)}`),
};

export interface ListaDaUnidade {
  lista: RhColaborador[];
  vinculo: Vinculo;
  cnpj: string | null;
}

export type ResultadoDaLista = { ok: true } & ListaDaUnidade | { ok: false; reason: 'SEM_VINCULO' };

/**
 * A lista do RH para UMA unidade do SGO, pelo vínculo certo — os DOIS a partir
 * da lista completa (`/api/ext/colaboradores`, o endpoint que a conexão testou
 * com 200), filtrada no SGO:
 *   1. CNPJ — pelo `unidade_cnpj`;
 *   2. razão social — pelo `unidade`, comparando sem acento/caixa/espaços.
 * Nenhuma URL é montada com nome de empresa. Qualquer falha na consulta (4xx,
 * 5xx, timeout, formato inesperado) LANÇA — o sync aborta a unidade sem tocar
 * em ninguém; erro nunca vira "lista vazia".
 * `todos` é a lista completa já buscada (o sync de todas as unidades busca uma
 * vez e reaproveita). Empresas do RH sem unidade correspondente ficam de fora.
 */
export async function listaParaUnidade(
  u: { cnpj: string | null; rhUnitName: string | null },
  todos?: RhColaborador[],
  /* Injetável: quem chama passa o `rh` que importou — e os testes, o dublê. */
  api: RhApi = rh,
): Promise<ResultadoDaLista> {
  const cnpj = normalizarCnpj(u.cnpj);
  if (!cnpj && !u.rhUnitName) return { ok: false, reason: 'SEM_VINCULO' };
  const completa = todos ?? unwrapColaboradores(await api.colaboradores());
  if (cnpj) {
    const porCnpj = filtrarPorCnpj(completa, cnpj);
    if (porCnpj.length > 0 || !u.rhUnitName) return { ok: true, lista: porCnpj, vinculo: 'CNPJ', cnpj };
  }
  return { ok: true, lista: filtrarPorRazaoSocial(completa, u.rhUnitName!), vinculo: 'RAZAO_SOCIAL', cnpj };
}
