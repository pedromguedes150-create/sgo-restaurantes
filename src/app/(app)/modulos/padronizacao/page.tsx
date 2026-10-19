import { Utensils, Sandwich } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listPrepStandards, listPrepCategories, podeGerirFichas } from '@/lib/preparo/query';
import { segmentoDaAba } from '@/lib/preparo/tipos';
import { LargeTitle } from '@/components/layout/page-chrome';
import { CatalogoClient } from '@/components/preparo/catalogo-client';

export const dynamic = 'force-dynamic';

/**
 * PADRONIZAÇÃO DE PREPARO — catálogo em DUAS ABAS (v1.172.0): LANCHONETE
 * (fichas de produto, as de sempre) e RESTAURANTE (guias de um grupo de
 * preparações, onde o arquivo enviado é o conteúdo). Todo perfil consulta; o
 * Admin ganha Importar/Nova e o filtro de situação. A guarda de rota já
 * decidiu quem entra (módulo PREP_STANDARDS); aqui só se calcula o que mostrar.
 */
export default async function PadronizacaoPage({ searchParams }: { searchParams: { status?: string; aba?: string } }) {
  const user = (await getSessionUser())!;
  const isAdmin = podeGerirFichas(user);
  const segment = segmentoDaAba(searchParams.aba);
  const status = isAdmin && (searchParams.status === 'INACTIVE' || searchParams.status === 'ALL') ? searchParams.status : 'ACTIVE';
  const [fichas, categorias] = await Promise.all([listPrepStandards(user, { status, segment }), listPrepCategories(segment)]);
  const linkAba = (aba: string) => `/modulos/padronizacao?aba=${aba}${status === 'ACTIVE' ? '' : `&status=${status}`}`;

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Padronização de Preparo"
        subtitle={segment === 'RESTAURANTE'
          ? 'Guias de preparação do restaurante: função do forno, temperatura, tempo e o arquivo com as preparações do grupo.'
          : 'Fichas dos produtos da lanchonete: ingredientes, quantidades, pesos, modo de preparo e a foto de como deve ficar.'}
        tabs={[
          { label: 'Lanchonete', icon: <Sandwich className="h-3.5 w-3.5" />, href: linkAba('lanchonete'), active: segment === 'LANCHONETE', testId: 'aba-lanchonete' },
          { label: 'Restaurante', icon: <Utensils className="h-3.5 w-3.5" />, href: linkAba('restaurante'), active: segment === 'RESTAURANTE', testId: 'aba-restaurante' },
        ]}
      />
      <CatalogoClient fichas={fichas} categorias={categorias} isAdmin={isAdmin} status={status} segment={segment} />
    </div>
  );
}
