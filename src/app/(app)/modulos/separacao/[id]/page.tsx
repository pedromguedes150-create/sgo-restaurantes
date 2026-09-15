import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getPedidoParaSeparar } from '@/lib/products/separacao';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SeparacaoClient } from '@/components/products/separacao-client';

export const dynamic = 'force-dynamic';

/**
 * UM pedido, do ponto de vista do separador — só os itens do setor dele.
 *
 * Um pedido já enviado à unidade vira histórico: a tela abre em leitura, porque
 * mudar o que foi separado depois da saída reescreveria o que a unidade recebeu.
 */
export default async function SeparacaoDoPedidoPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const pedido = await getPedidoParaSeparar(user, params.id);
  if (!pedido) notFound();

  const { status } = (await prisma.productRequest.findUnique({
    where: { id: params.id }, select: { status: true },
  }))!;
  const bloqueado = !['ENVIADO_CD', 'SEPARANDO', 'PRONTO_ENVIO'].includes(status);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/modulos/separacao" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" />Voltar para a fila
        </Link>
        <LargeTitle title={`Pedido nº ${pedido.number}`} />
        <p className="text-sm text-ink-500">
          {pedido.unitName} · {pedido.setorNome} · {pedido.separados} de {pedido.total} itens separados
        </p>
      </div>

      {pedido.note && (
        <Card><CardContent className="py-3">
          <p className="text-xs font-medium text-ink-500">Observação da unidade</p>
          <p className="text-sm text-ink-900">{pedido.note}</p>
        </CardContent></Card>
      )}

      {bloqueado && (
        <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info">
          Este pedido já saiu do CD — a separação fica como registro e não pode mais ser alterada.
        </p>
      )}

      <SeparacaoClient
        bloqueado={bloqueado}
        itens={pedido.itens.map((i) => ({
          id: i.id, name: i.name, category: i.category, measure: i.measure,
          qtyRequested: i.qtyRequested, qtySeparated: i.qtySeparated,
          missingLabel: i.missingLabel, separadoPor: i.separadoPor, faltando: i.faltando,
        }))}
      />
    </div>
  );
}
