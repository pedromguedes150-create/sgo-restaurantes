import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { normalizarFuncao } from './aplicabilidade';

/**
 * Opções para o editor do POP escolher o PÚBLICO do treinamento.
 *
 * As FUNÇÕES saem do cadastro de colaboradores (o cargo que o RH envia) —
 * não há catálogo de cargos no SGO, e criar um seria uma segunda lista que
 * divergiria da do RH. Grafias diferentes do mesmo cargo colapsam numa
 * opção só (a primeira grafia vista vira o rótulo), casando com a regra de
 * atribuição, que também normaliza.
 *
 * Os COLABORADORES vêm com as unidades em que estão para o editor mostrar só
 * quem pertence às unidades escolhidas — vincular alguém de fora não geraria
 * treinamento nenhum (a reconciliação anda por unidade do POP).
 */
export interface OpcoesDePublico {
  funcoes: string[];
  colaboradores: { id: string; name: string; jobTitle: string | null; unitIds: string[]; unitNames: string[] }[];
}

export async function opcoesDePublico(user: SessionUser): Promise<OpcoesDePublico> {
  const colabs = await prisma.collaborator.findMany({
    where: { active: true, units: { some: { ...unitScopeWhere(user, 'unitId') } } },
    select: { id: true, name: true, jobTitle: true, units: { select: { unitId: true, unit: { select: { name: true } } } } },
    orderBy: { name: 'asc' },
  });

  const funcoesPorChave = new Map<string, string>();
  for (const c of colabs) {
    const chave = normalizarFuncao(c.jobTitle);
    if (chave && !funcoesPorChave.has(chave)) funcoesPorChave.set(chave, c.jobTitle!.trim());
  }
  const funcoes = [...funcoesPorChave.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return {
    funcoes,
    colaboradores: colabs.map((c) => ({
      id: c.id,
      name: c.name,
      jobTitle: c.jobTitle,
      unitIds: c.units.map((u) => u.unitId),
      unitNames: c.units.map((u) => u.unit.name),
    })),
  };
}
