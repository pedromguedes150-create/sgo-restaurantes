import { getSessionUser } from '@/lib/auth/session';
import { listPrepStandards, listPrepCategories, podeGerirFichas } from '@/lib/preparo/query';
import { LargeTitle } from '@/components/layout/page-chrome';
import { CatalogoClient } from '@/components/preparo/catalogo-client';

export const dynamic = 'force-dynamic';

/**
 * PADRONIZAÇÃO DE PREPARO — catálogo. Todo perfil consulta; o Admin ganha
 * Importar/Nova ficha e o filtro de situação. A guarda de rota já decidiu
 * quem entra (módulo PREP_STANDARDS); aqui só se calcula o que mostrar.
 */
export default async function PadronizacaoPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = (await getSessionUser())!;
  const isAdmin = podeGerirFichas(user);
  const status = isAdmin && (searchParams.status === 'INACTIVE' || searchParams.status === 'ALL') ? searchParams.status : 'ACTIVE';
  const [fichas, categorias] = await Promise.all([listPrepStandards(user, { status }), listPrepCategories()]);

  return (
    <div className="space-y-4">
      <LargeTitle title="Padronização de Preparo" subtitle="Consulte os padrões de preparo dos produtos: ingredientes, quantidades, pesos, modo de preparo e a foto de como deve ficar." />
      <CatalogoClient fichas={fichas} categorias={categorias} isAdmin={isAdmin} status={status} />
    </div>
  );
}
