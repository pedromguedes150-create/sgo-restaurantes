import type { SessionUser } from '@/lib/auth/session';
import type { ClienteDaApi } from '@/lib/api-global/guarda';

/**
 * Os endpoints COMPUTADOS da API Global (metas, uso, diagnóstico do RH)
 * reusam as funções das telas, que recebem um `SessionUser`. A API não tem
 * usuário: o sistema consumidor vira uma sessão de LEITURA que enxerga a rede
 * inteira (as funções só leem; o id não aponta para usuário nenhum e nunca é
 * gravado por elas).
 */
export function sessaoDaApi(cliente: ClienteDaApi): SessionUser {
  return { id: `api:${cliente.id}`, name: `API Global — ${cliente.name}`, role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
}

const MES = /^\d{4}-\d{2}$/;

/** `?mes=AAAA-MM`, senão o mês atual em Brasília. */
export function mesDaUrl(url: URL): string {
  const v = url.searchParams.get('mes') ?? url.searchParams.get('month');
  if (v && MES.test(v)) return v;
  const agora = new Date(Date.now() - 3 * 3_600_000);
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
}
