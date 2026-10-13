import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { AREAS, FORA_DO_MENU } from '@/lib/nav/areas';
import { MODULES } from '@/lib/permissions';
import { ENTIDADES, COMPUTADOS, TELAS_SEM_ENDPOINT } from '@/lib/api-global/registro';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/estrutura — a árvore do menu (v1.167.0), montada do MESMO
 * registro que desenha a navegação (`AREAS` × `MODULES`), nunca de uma lista
 * à parte. Sem recorte por perfil: a API vê o sistema inteiro. Cada tela diz
 * quais endpoints de dados a cobrem.
 */
export const GET = comApiKey(async () => {
  const porKey = new Map(MODULES.filter((m) => m.nav).map((m) => [m.key, m]));
  const endpointsDaTela = (key: string) => [
    ...ENTIDADES.filter((e) => e.telas.includes(key)).map((e) => `/api/v1/${e.slug}`),
    ...COMPUTADOS.filter((c) => (c.telas as readonly string[]).includes(key)).map((c) => `/api/v1/${c.slug}`),
  ];
  const arvore = AREAS.map((a) => ({
    label: a.titulo,
    filhos: a.colunas.flatMap((c) => c.keys.flatMap((k) => {
      const m = porKey.get(k);
      if (!m?.nav) return [];
      return [{ label: m.label, href: m.nav, grupo: c.titulo, chave: m.key, endpoints: endpointsDaTela(m.key), ...(TELAS_SEM_ENDPOINT[m.key] ? { semEndpoint: TELAS_SEM_ENDPOINT[m.key] } : {}) }];
    })),
  }));
  const foraDoMenu = Object.entries(FORA_DO_MENU).map(([k, motivo]) => { const m = porKey.get(k); return { label: m?.label ?? k, href: m?.nav ?? null, motivo, endpoints: endpointsDaTela(k) }; });
  return NextResponse.json({ sistema: 'SGO Beija Flor', arvore, foraDoMenu });
});
