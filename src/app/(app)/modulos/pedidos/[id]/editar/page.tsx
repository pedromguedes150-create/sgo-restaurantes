import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canEditModule } from '@/lib/permissions';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { getPedido, setoresParaPedido } from '@/lib/pedidos/pedidos';
import { blocoEditavel, pedidoEditavel, podeEnviar } from '@/lib/pedidos/regras';
import { LargeTitle } from '@/components/layout/page-chrome';
import { NovoPedidoClient } from '@/components/pedidos/novo-pedido-client';

export const dynamic = 'force-dynamic';

/**
 * EDITAR um pedido por setor (v1.188.0, decisão do Pedro): o gerente altera o
 * que enviou enquanto o setor ainda não entrou em separação. Bloco em separação
 * ou atendido aparece travado; pedido inteiro atendido não se edita.
 */
export default async function EditarPedidoPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const p = await getPedido(user, params.id);
  if (!p) notFound();
  const pode = podeEnviar(user.role) && canAccessUnit(user, p.unitId) && (await canEditModule(user.role, 'ORDERS'));
  if (!pode) notFound();
  const setores = await setoresParaPedido();
  const textos = Object.fromEntries(p.secoes.filter((s) => s.sectorId).map((s) => [s.sectorId!, s.lines.join('\n')]));
  const travados = p.secoes.filter((s) => s.sectorId && !blocoEditavel(s.status)).map((s) => s.sectorId!);

  return (
    <div className="space-y-4">
      <Link href={`/modulos/pedidos/${p.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pedido nº {p.number}</Link>
      <LargeTitle title={`Editar pedido nº ${p.number}`} subtitle="Altere, acrescente ou retire itens dos setores que ainda estão como Enviado. Um setor que já entrou em separação (ou foi atendido) fica travado: o separador já está com a lista na mão." />
      {pedidoEditavel(p.status) ? (
        <NovoPedidoClient
          units={[{ id: p.unitId, name: p.unitName }]}
          setores={setores}
          unitPadrao={p.unitId}
          edicao={{ id: p.id, numero: p.number, textos, observacao: p.note ?? '', travados }}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-500" data-testid="pedido-fechado">Este pedido já foi atendido por todos os setores e não pode mais ser alterado.</p>
      )}
    </div>
  );
}
