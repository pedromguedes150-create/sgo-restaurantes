import { getSessionUser } from '@/lib/auth/session';
import { viewableNavHrefs } from '@/lib/permissions';
import { LargeTitle } from '@/components/layout/page-chrome';
import { ModulesHub } from '@/components/layout/modules-hub';

export const dynamic = 'force-dynamic';

/**
 * Hub de módulos do MOBILE (a sidebar é só desktop). Espelha a sidebar: mesmos
 * módulos, mesmos grupos e MESMO filtro de permissões (matriz de Perfis).
 *
 * A lista e a busca vivem em `ModulesHub`, que é client — filtrar ao digitar
 * precisa de estado. Daqui vão só os hrefs permitidos (texto puro): os ícones
 * são componentes React e não atravessam a fronteira servidor→cliente.
 */
export default async function ModulosPage() {
  const user = (await getSessionUser())!;
  const viewable = await viewableNavHrefs(user.role);

  return (
    <div className="space-y-5">
      <LargeTitle title="Módulos" />
      <ModulesHub viewable={viewable} />
    </div>
  );
}
