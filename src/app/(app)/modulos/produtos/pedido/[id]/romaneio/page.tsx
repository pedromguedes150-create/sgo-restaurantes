import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getPedido } from '@/lib/products/pedido';
import { Romaneio } from '@/components/products/romaneio';

export const dynamic = 'force-dynamic';

/** A MESMA folha, pelo lado de quem recebe — para conferir a carga na doca. */
export default async function RomaneioDaUnidadePage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const p = await getPedido(user, params.id);
  if (!p) notFound();
  return <Romaneio p={p} voltarHref={`/modulos/produtos/pedido/${p.id}`} />;
}
