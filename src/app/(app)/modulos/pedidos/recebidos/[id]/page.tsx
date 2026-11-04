import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getPedido } from '@/lib/pedidos/pedidos';
import { PedidoImpresso } from '@/components/pedidos/pedido-impresso';

export const dynamic = 'force-dynamic';

/**
 * O pedido inteiro visto pela CAIXA DE ENTRADA (v1.188.0): o separador que tem
 * um bloco do seu setor abre, confere e imprime (?imprimir=1). A porta é a de
 * `getPedido` (unidade, ou separador com bloco do setor, ou Admin/CEO); a rota
 * vive sob /recebidos porque o separador não tem o módulo Pedidos (ORDERS).
 */
export default async function PedidoRecebidoPage({ params, searchParams }: { params: { id: string }; searchParams: { imprimir?: string } }) {
  const user = (await getSessionUser())!;
  const p = await getPedido(user, params.id);
  if (!p) notFound();
  return (
    <PedidoImpresso
      pedido={p}
      imprimir={searchParams.imprimir === '1'}
      voltarHref="/modulos/pedidos/recebidos"
      voltarLabel="Pedidos recebidos"
      pdfHref={`/modulos/pedidos/recebidos/${p.id}?imprimir=1`}
    />
  );
}
