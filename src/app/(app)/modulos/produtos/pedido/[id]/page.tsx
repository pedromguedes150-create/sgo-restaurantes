import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Printer, Check, Circle } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getPedido, STATUS_SETOR_LABEL } from '@/lib/products/pedido';
import { motivoLabel } from '@/lib/products/separacao-motivos';
import { montarTimeline, divergenciaLabel, avaliacaoLabel } from '@/lib/products/entrega-tela';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { RecebimentoClient } from '@/components/products/recebimento-client';

export const dynamic = 'force-dynamic';

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('pt-BR') : null);

/**
 * O PEDIDO, do ponto de vista de quem pediu.
 *
 * A pergunta que traz o gerente aqui é "onde está meu pedido?" — por isso a
 * timeline vem primeiro, antes dos itens. E o que já chegou aparece com o que o
 * CD **separou** ao lado do que foi **pedido**: é a diferença entre os dois que
 * ele precisa ver, e não um número sozinho.
 */
export default async function PedidoDoGerentePage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const p = await getPedido(user, params.id);
  if (!p) notFound();

  const timeline = montarTimeline(p);
  const podeConferir = p.status === 'ENVIADO_UNIDADE';

  /* A conferência já gravada, para o pedido fechado mostrar o que foi apontado. */
  const apontados = p.status.startsWith('CONCLUIDO')
    ? await prisma.productRequestItem.findMany({
      where: { requestId: p.id, receiptIssue: { not: null } },
      select: { id: true, name: true, receiptIssue: true, receiptNote: true },
    })
    : [];
  const receipt = podeConferir || apontados.length > 0 || p.receivedAt
    ? await prisma.productRequest.findUnique({
      where: { id: p.id }, select: { receiptQuality: true, receiptPackaging: true, receiptNote: true },
    })
    : null;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/modulos/produtos" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" />Voltar para Pedidos
        </Link>
        <LargeTitle title={`Pedido nº ${p.number}`} />
        <p className="text-sm text-ink-500">{p.unitName} · {p.statusLabel}</p>
      </div>

      {/* ── A timeline ── */}
      <Card><CardContent className="space-y-3 pt-4">
        {timeline.map((e) => (
          <div key={e.chave} className="flex gap-3">
            <div className="pt-0.5">
              {e.feito
                ? <Check className="h-5 w-5 text-success" />
                : <Circle className="h-5 w-5 text-ink-400" />}
            </div>
            <div className={e.feito ? '' : 'opacity-60'}>
              <p className="text-sm font-medium text-ink-900">{e.titulo}</p>
              <p className="sgo-type-11 text-ink-500">
                {[e.quem, fmt(e.quando), e.detalhe].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        ))}
      </CardContent></Card>

      {p.cdNote && (
        <Card><CardContent className="py-3">
          <p className="text-xs font-medium text-ink-500">Observação do CD</p>
          <p className="text-sm text-ink-900">{p.cdNote}</p>
        </CardContent></Card>
      )}

      {podeConferir && (
        <RecebimentoClient
          requestId={p.id}
          itens={p.setores.flatMap((s) => s.itens).map((i) => ({
            id: i.id, name: i.name, measure: i.measure,
            qtyRequested: i.qtyRequested, qtySeparated: i.qtySeparated,
            missingLabel: motivoLabel(i.missingReason),
          }))}
        />
      )}

      {apontados.length > 0 && (
        <Card><CardContent className="pt-4">
          <p className="font-medium text-ink-900">Divergências apontadas no recebimento</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-700">
            {apontados.map((a) => (
              <li key={a.id}>
                <b>{a.name}</b> — {divergenciaLabel(a.receiptIssue)}
                {a.receiptNote ? ` · ${a.receiptNote}` : ''}
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}

      {p.receivedAt && receipt && (receipt.receiptQuality || receipt.receiptPackaging || receipt.receiptNote) && (
        <Card><CardContent className="pt-4 text-sm text-ink-700">
          {receipt.receiptQuality && <p>Qualidade dos produtos: <b>{avaliacaoLabel(receipt.receiptQuality)}</b></p>}
          {receipt.receiptPackaging && <p>Embalagem / transporte: <b>{avaliacaoLabel(receipt.receiptPackaging)}</b></p>}
          {receipt.receiptNote && <p className="mt-1">{receipt.receiptNote}</p>}
        </CardContent></Card>
      )}

      {/* ── Os itens, por setor do CD ── */}
      {p.setores.map((s) => (
        <Card key={s.cdSectorId ?? 'sem'}><CardContent className="pt-4">
          <p className="font-medium text-ink-900">
            {s.cdSectorName} <span className="text-sm font-normal text-ink-500">· {STATUS_SETOR_LABEL[s.status]}</span>
          </p>
          <ul className="mt-2 divide-y divide-line text-sm">
            {s.itens.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-2 py-2">
                <span className="min-w-0 text-ink-900">
                  <span className="block truncate">{i.name}</span>
                  {i.missingReason && (
                    <span className="sgo-type-11 text-ink-500">Falta no CD: {motivoLabel(i.missingReason)}</span>
                  )}
                </span>
                <span className="shrink-0 text-right text-ink-700">
                  <span className="block">Pedido: {i.qtyRequested} {i.measure}</span>
                  <span className={`block ${i.qtySeparated !== null && i.qtySeparated < i.qtyRequested ? 'text-warning' : 'text-ink-500'}`}>
                    {i.qtySeparated === null ? 'Não separado' : `Separado: ${i.qtySeparated} ${i.measure}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      ))}

      {p.sentAt && (
        <Link
          href={`/modulos/produtos/pedido/${p.id}/romaneio`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand"
        >
          <Printer className="h-4 w-4" />Imprimir o romaneio da carga
        </Link>
      )}
    </div>
  );
}
