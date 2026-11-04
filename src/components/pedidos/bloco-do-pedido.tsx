import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { agruparPorDestino, dataBR, ROTULO_STATUS, rotuloDoDestino, rotuloDosDestinos, TOM_STATUS } from '@/lib/pedidos/regras';
import type { PedidoDaTela, SecaoDoPedido } from '@/lib/pedidos/pedidos';

/**
 * Pedidos por setor (v1.185.0) — as peças de apresentação, sem estado: o
 * cabeçalho do pedido e um bloco por setor (nome, situação, as linhas). Quem
 * precisa de botão (a caixa de entrada) passa `acoes`.
 */

export function CabecalhoDoPedido({ pedido, mostrarUnidade = true }: { pedido: PedidoDaTela; mostrarUnidade?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2" data-testid="cabecalho-pedido">
      <div className="min-w-0">
        <p className="text-base font-semibold text-ink-900">Pedido nº {pedido.number}{mostrarUnidade ? ` · ${pedido.unitName}` : ''}{pedido.secoes.length ? ` → ${rotuloDosDestinos(pedido.secoes)}` : ''}</p>
        <p className="text-xs text-ink-500">Enviado {dataBR(pedido.sentAt)} por {pedido.createdByName}{pedido.attendedAt ? ` · atendido ${dataBR(pedido.attendedAt)}` : ''}</p>
        {pedido.note && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700"><b>Observação:</b> {pedido.note}</p>}
      </div>
      <StatusBadge tone={TOM_STATUS[pedido.status]} dot>{ROTULO_STATUS[pedido.status]}</StatusBadge>
    </div>
  );
}

export function BlocoDoSetor({ secao, acoes }: { secao: SecaoDoPedido; acoes?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface" data-testid="bloco-setor">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken px-3 py-2">
        <span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink-900">{secao.sectorName.toUpperCase()}</span><span className="sgo-tag" data-testid="destino-do-bloco">{rotuloDoDestino(secao.destination)}</span></span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={TOM_STATUS[secao.status]} dot>{ROTULO_STATUS[secao.status]}</StatusBadge>
          {acoes}
        </span>
      </div>
      <ol className="list-decimal space-y-0.5 px-8 py-2 text-sm text-ink-900">
        {secao.lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}
      </ol>
      {(secao.receivedByName || secao.attendedByName) && (
        <p className="border-t border-line px-3 py-1.5 text-xs text-ink-500">
          {secao.receivedByName && <>Recebido por {secao.receivedByName} em {dataBR(secao.receivedAt!)}</>}
          {secao.receivedByName && secao.attendedByName && ' · '}
          {secao.attendedByName && <>Atendido por {secao.attendedByName} em {dataBR(secao.attendedAt!)}</>}
        </p>
      )}
    </div>
  );
}

/** Os blocos agrupados por destino (Fábrica · CD · Almoxarifado), cada grupo com o seu título — v1.187.0. */
export function BlocosDoPedido({ pedido, acoesDaSecao }: { pedido: PedidoDaTela; acoesDaSecao?: (s: SecaoDoPedido) => ReactNode }) {
  const grupos = agruparPorDestino(pedido.secoes);
  if (grupos.length === 0) return <p className="rounded-lg border border-dashed border-line p-3 text-sm text-ink-500" data-testid="sem-blocos">Pedido sem itens por setor — só a observação.</p>;
  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <section key={g.destino} className="space-y-2" data-testid={`grupo-${g.destino}`}>
          {grupos.length > 1 && <h3 className="sgo-type-13 font-semibold text-brand">{g.rotulo.toUpperCase()}</h3>}
          {g.setores.map((s) => <BlocoDoSetor key={s.id} secao={s} acoes={acoesDaSecao?.(s)} />)}
        </section>
      ))}
    </div>
  );
}
