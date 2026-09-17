import { getSessionUser } from '@/lib/auth/session';
import { viewableNavHrefs } from '@/lib/permissions';
import { montarMenu } from '@/lib/nav/menu';
import { recortarPizzas, temUnidadeComPizzaria } from '@/lib/pizzas/acesso';
import { LargeTitle } from '@/components/layout/page-chrome';
import { ModulesHub } from '@/components/layout/modules-hub';

export const dynamic = 'force-dynamic';

/**
 * Hub de módulos do CELULAR (a barra por áreas é só desktop).
 *
 * Recebe o MESMO menu montado do desktop — antes tinha a própria lista de doze
 * itens escrita à mão, e tudo o que não estava nela não existia para quem usa
 * o celular. O recorte da pizzaria é o mesmo (`src/lib/pizzas/acesso.ts`).
 */
export default async function ModulosPage() {
  const user = (await getSessionUser())!;
  const [porPerfil, temPizzaria] = await Promise.all([viewableNavHrefs(user.role), temUnidadeComPizzaria(user)]);
  const permitido = new Set(recortarPizzas(porPerfil, temPizzaria));
  const areas = await montarMenu(user.role, (href) => permitido.has(href));

  return (
    <div className="space-y-5">
      <LargeTitle title="Módulos" />
      <ModulesHub areas={areas} />
    </div>
  );
}
