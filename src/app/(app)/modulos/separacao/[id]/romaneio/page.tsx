import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getRomaneioDoCd } from '@/lib/products/separacao';
import { Romaneio } from '@/components/products/romaneio';

export const dynamic = 'force-dynamic';

/**
 * O romaneio pelo lado do CD — a folha que sai junto com a carga.
 *
 * A porta é a do SETOR, não a da unidade: o separador não tem unidade nenhuma
 * (o CD atende a rede toda), e carregar por `getPedido` dava 404 em cima de um
 * pedido que a pessoa tinha acabado de abrir. Ver `getRomaneioDoCd`.
 */
export default async function RomaneioDoCdPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const p = await getRomaneioDoCd(user, params.id);
  if (!p) notFound();
  return <Romaneio p={p} voltarHref={`/modulos/separacao/${p.id}`} />;
}
