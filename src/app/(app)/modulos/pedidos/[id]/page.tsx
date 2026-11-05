import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canEditModule } from '@/lib/permissions';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { getPedido } from '@/lib/pedidos/pedidos';
import { pedidoEditavel, podeEnviar, rotuloDoDestino } from '@/lib/pedidos/regras';
import { PedidoImpresso } from '@/components/pedidos/pedido-impresso';

export const dynamic = 'force-dynamic';

/** Um pedido por setor (v1.185.0): o pedido inteiro, para conferir, imprimir (?imprimir=1), copiar como texto ou EDITAR (v1.188.0, enquanto nenhum setor entrou em separação). */
export default async function PedidoPage({ params, searchParams }: { params: { id: string }; searchParams: { imprimir?: string; enviado?: string; editado?: string } }) {
  const user = (await getSessionUser())!;
  const p = await getPedido(user, params.id);
  if (!p) notFound();
  const podeEditar = podeEnviar(user.role) && canAccessUnit(user, p.unitId) && (await canEditModule(user.role, 'ORDERS')) && pedidoEditavel(p.status);
  const aviso = searchParams.enviado === '1'
    ? <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success print:hidden" data-testid="aviso-enviado">Pedido nº {p.number} enviado{p.destinos.length ? ` para ${p.destinos.map(rotuloDoDestino).join(', ')}` : ''}. Os separadores dos setores envolvidos foram avisados. Você pode editar o pedido até o primeiro setor entrar em separação.</p>
    : searchParams.editado === '1'
      ? <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success print:hidden" data-testid="aviso-editado">Pedido nº {p.number} alterado. Os setores envolvidos foram avisados.</p>
      : undefined;

  return (
    <PedidoImpresso
      pedido={p}
      imprimir={searchParams.imprimir === '1'}
      voltarHref="/modulos/pedidos?aba=enviados"
      voltarLabel="Pedidos"
      pdfHref={`/modulos/pedidos/${p.id}?imprimir=1`}
      aviso={aviso}
      acoes={podeEditar ? <Link href={`/modulos/pedidos/${p.id}/editar`} className="sgo-btn sgo-btn--sm" data-testid="btn-editar"><Pencil className="h-4 w-4" /> Editar pedido</Link> : undefined}
    />
  );
}
