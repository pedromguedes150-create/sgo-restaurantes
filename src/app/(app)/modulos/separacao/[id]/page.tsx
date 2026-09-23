import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getPedidoParaSeparar } from '@/lib/products/separacao';
import { numeroDoPedido } from '@/lib/products/numero-do-pedido';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SeparacaoClient } from '@/components/products/separacao-client';
import { EnvioClient } from '@/components/products/envio-client';

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

  /* O progresso do PEDIDO INTEIRO, não só do setor desta pessoa: a carga sai
     uma vez só, e quem terminou a parte dele precisa ver que está esperando
     outro setor. */
  const cru = (await prisma.productRequest.findUnique({
    where: { id: params.id },
    select: { status: true, sentByName: true, sentAt: true, checkedByName: true, checkedAt: true, requestItems: { select: { qtySeparated: true } } },
  }))!;
  /* CONFERIDO trava os itens (a conferência não pode ser invalidada em
     silêncio) mas ainda está no CD: o envio continua disponível. */
  const conferido = cru.status === 'CONFERIDO';
  const bloqueado = !['ENVIADO_CD', 'SEPARANDO', 'PRONTO_ENVIO'].includes(cru.status);
  const aindaNoCd = !bloqueado || conferido;
  const faltamNoPedido = cru.requestItems.filter((i) => i.qtySeparated === null).length;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/modulos/separacao" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" />Voltar para a fila
        </Link>
        <LargeTitle title={numeroDoPedido(pedido.number, pedido.createdAt)} />
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

      {conferido && (
        <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info">
          Carga conferida{cru.checkedByName ? ` por ${cru.checkedByName}` : ''}{cru.checkedAt ? ` em ${cru.checkedAt.toLocaleString('pt-BR')}` : ''} —
          a separação está travada; falta só confirmar a saída.
        </p>
      )}
      {bloqueado && !conferido && (
        <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info">
          Este pedido já saiu do CD{cru.sentByName ? ` (${cru.sentByName}, ${cru.sentAt?.toLocaleString('pt-BR')})` : ''} —
          a separação fica como registro e não pode mais ser alterada.
        </p>
      )}

      <Link
        href={`/modulos/separacao/${pedido.id}/romaneio`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand"
      >
        <Printer className="h-4 w-4" />Romaneio para imprimir
      </Link>

      <SeparacaoClient
        bloqueado={bloqueado}
        itens={pedido.itens.map((i) => ({
          id: i.id, name: i.name, category: i.category, measure: i.measure,
          qtyRequested: i.qtyRequested, qtySeparated: i.qtySeparated,
          missingLabel: i.missingLabel, separadoPor: i.separadoPor, faltando: i.faltando,
        }))}
      />

      {aindaNoCd && (
        <EnvioClient requestId={pedido.id} pronto={faltamNoPedido === 0} faltam={faltamNoPedido} status={cru.status} conferidoPor={cru.checkedByName} />
      )}
    </div>
  );
}
