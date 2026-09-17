import { MODULES } from '@/lib/permissions';
import { viewableNavHrefs } from '@/lib/permissions';
import { AREAS, type AreaMontada, type ItemDoMenu } from '@/lib/nav/areas';
import type { Role } from '@prisma/client';

/**
 * Monta o menu do perfil: as sete áreas, já com rótulo, endereço e SEM o que a
 * matriz de perfis fecha.
 *
 * Roda no servidor porque `MODULES` mora ao lado do Prisma. A tela recebe o
 * resultado pronto — componente cliente não alcança módulo de servidor (é o que
 * quebra o `next build`, e só ele).
 *
 * Área que ficou sem nenhum item some inteira: um botão "Administrativo" que
 * abre um menu vazio é pior do que a ausência do botão.
 */
export async function montarMenu(role: Role, recorte?: (href: string) => boolean): Promise<AreaMontada[]> {
  const viewable = new Set(await viewableNavHrefs(role));
  const porKey = new Map(MODULES.filter((m) => m.nav).map((m) => [m.key, m]));

  const areas: AreaMontada[] = [];
  for (const area of AREAS) {
    const colunas = area.colunas
      .map((c) => ({
        titulo: c.titulo,
        itens: c.keys.flatMap((k): ItemDoMenu[] => {
          const m = porKey.get(k);
          if (!m?.nav) return [];
          if (!viewable.has(m.nav)) return [];
          /* Recorte por UNIDADE (pizzaria) vem de fora: a matriz é por perfil e
             não tem essa dimensão. */
          if (recorte && !recorte(m.nav)) return [];
          return [{ key: m.key, label: m.label, href: m.nav }];
        }),
      }))
      .filter((c) => c.itens.length > 0);

    if (colunas.length === 0) continue;
    areas.push({ id: area.id, titulo: area.titulo, icone: area.icone, colunas, href: colunas[0].itens[0].href });
  }
  return areas;
}

/** Lista plana do menu — a base da busca global e dos favoritos. */
export function itensDoMenu(areas: AreaMontada[]): (ItemDoMenu & { area: string })[] {
  return areas.flatMap((a) => a.colunas.flatMap((c) => c.itens.map((i) => ({ ...i, area: a.titulo }))));
}
