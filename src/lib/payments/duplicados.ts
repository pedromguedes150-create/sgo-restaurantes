import { normalizar } from '@/lib/products/busca';

/**
 * POSSÍVEIS DUPLICADOS de freelancer — puro.
 *
 * O caso real (01/10/2026): "Arthur Diogo" cadastrado duas vezes, um sem CPF e
 * outro completo, os dois com histórico de pagamento. Como o CPF é único no
 * banco, duplicado de verdade só nasce quando um dos cadastros está SEM CPF —
 * então a pista é o NOME (sem acento, sem caixa, sem espaço repetido). É só
 * sugestão: quem decide se são a mesma pessoa é o Admin, na mesclagem.
 */
export interface FreelancerParaDuplicados { id: string; name: string; active: boolean }

/** Ids que têm outro cadastro ATIVO com o mesmo nome normalizado. */
export function possiveisDuplicados<T extends FreelancerParaDuplicados>(lista: T[]): Set<string> {
  const porNome = new Map<string, T[]>();
  for (const f of lista) {
    if (!f.active) continue;
    const chave = normalizar(f.name);
    if (!chave) continue;
    porNome.set(chave, [...(porNome.get(chave) ?? []), f]);
  }
  const out = new Set<string>();
  for (const grupo of porNome.values()) if (grupo.length > 1) for (const f of grupo) out.add(f.id);
  return out;
}

/** Os candidatos a destino de uma mesclagem: todos menos o próprio, homônimos primeiro. */
export function candidatosADestino<T extends FreelancerParaDuplicados>(lista: T[], duplicadoId: string): T[] {
  const dup = lista.find((f) => f.id === duplicadoId);
  const chave = dup ? normalizar(dup.name) : '';
  return lista
    .filter((f) => f.id !== duplicadoId)
    .sort((a, b) => {
      const ha = chave && normalizar(a.name) === chave ? 0 : 1;
      const hb = chave && normalizar(b.name) === chave ? 0 : 1;
      return ha - hb || a.name.localeCompare(b.name, 'pt-BR');
    });
}
