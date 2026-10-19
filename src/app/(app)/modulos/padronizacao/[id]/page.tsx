import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getPrepStandard, getPrepHistory, listPrepCategories, podeGerirFichas, vizinhosDaFicha } from '@/lib/preparo/query';
import { LargeTitle } from '@/components/layout/page-chrome';
import { FichaClient } from '@/components/preparo/ficha-client';

export const dynamic = 'force-dynamic';

/** A ficha de um produto ou o guia do restaurante. Inativa só abre para o Admin (para os demais, 404). */
export default async function FichaDePreparoPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const ficha = await getPrepStandard(user, params.id);
  if (!ficha) notFound();
  const isAdmin = podeGerirFichas(user);
  const segment = ficha.segment ?? 'LANCHONETE';
  const [vizinhos, historico, categorias] = await Promise.all([
    vizinhosDaFicha(ficha.id, segment),
    isAdmin ? getPrepHistory(user, ficha.id) : Promise.resolve([]),
    isAdmin ? listPrepCategories(segment) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <LargeTitle title="Padronização de Preparo" subtitle={segment === 'RESTAURANTE' ? 'Restaurante · guia de preparações' : 'Lanchonete · ficha do produto'} />
      <FichaClient ficha={ficha} vizinhos={vizinhos} isAdmin={isAdmin} historico={historico} categorias={categorias} />
    </div>
  );
}
