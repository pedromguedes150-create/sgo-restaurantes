import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getPedido } from '@/lib/products/pedido';
import { Romaneio } from '@/components/products/romaneio';

export const dynamic = 'force-dynamic';

/** O romaneio pelo lado do CD — a folha que sai junto com a carga. */
export default async function RomaneioDoCdPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const p = await getPedido(user, params.id);
  if (!p) notFound();
  return <Romaneio p={p} voltarHref={`/modulos/separacao/${p.id}`} />;
}
