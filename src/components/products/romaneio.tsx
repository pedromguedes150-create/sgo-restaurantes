import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { PedidoDetalhado } from '@/lib/products/pedido';
import { STATUS_SETOR_LABEL } from '@/lib/products/pedido';
import { motivoLabel } from '@/lib/products/separacao-motivos';
import { PrintButton } from '@/components/ui/print-button';

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('pt-BR') : '—');

/**
 * O ROMANEIO — o papel que viaja com a carga.
 *
 * Existe porque o caminhão não leva o sistema junto. Quem recebe na unidade
 * confere a caixa contra esta folha, e por isso ela é agrupada **por setor do
 * CD**: é assim que a carga foi montada e é assim que ela chega empilhada.
 *
 * O que **faltou** vem impresso junto, com o motivo. Omitir a falta faria a
 * unidade procurar no caminhão um item que o CD já sabia que não tinha — e é
 * exatamente essa procura que gera o telefonema.
 *
 * A MESMA folha serve aos dois lados (o CD que despacha e a unidade que
 * recebe): duas versões do romaneio divergiriam com o tempo, e conferir carga
 * contra papéis diferentes é pior do que não conferir.
 */
export function Romaneio({ p, voltarHref }: { p: PedidoDetalhado; voltarHref: string }) {
  /* O que saiu incompleto, repetido no fim da folha: na doca ninguem relê as
     trinta linhas para achar as duas que faltaram. */
  const faltas = p.setores
    .flatMap((s) => s.itens)
    .filter((i) => i.qtySeparated !== null && i.qtySeparated < i.qtyRequested);

  return (
    <div className="sgo-print mx-auto max-w-3xl space-y-4 bg-surface p-2 text-ink-900 print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={voltarHref} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <PrintButton />
      </div>

      <div className="border-b-2 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-ink-900">Romaneio de Separação — SGO Beija Flor</p>
        <h1 className="text-2xl font-bold text-ink-900">Pedido nº {p.number} · {p.unitName}</h1>
        <p className="text-sm text-ink-500">
          Pedido por {p.createdByName} em {fmt(p.createdAt)} · {p.totalSeparados} de {p.totalItens} itens separados
        </p>
      </div>

      {p.note && (
        <p className="text-sm text-ink-700"><b>Observação da unidade:</b> {p.note}</p>
      )}
      {p.cdNote && (
        <p className="text-sm text-ink-700"><b>Observação do CD:</b> {p.cdNote}</p>
      )}

      {p.setores.map((s) => (
        <section key={s.cdSectorId ?? 'sem'} className="space-y-1 break-inside-avoid">
          <h2 className="border-b border-line pb-1 text-base font-semibold text-ink-900">
            {s.cdSectorName} <span className="text-sm font-normal text-ink-500">· {STATUS_SETOR_LABEL[s.status]}</span>
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="py-1">Produto</th>
                <th className="w-20 py-1 text-right">Pedido</th>
                <th className="w-20 py-1 text-right">Separado</th>
                <th className="w-16 py-1 text-center">Conferi</th>
              </tr>
            </thead>
            <tbody>
              {s.itens.map((i) => (
                <tr key={i.id} className="border-t border-line align-top">
                  <td className="py-1">
                    {i.name}
                    {i.missingReason && (
                      <span className="block sgo-type-11 text-ink-500">Falta: {motivoLabel(i.missingReason)}</span>
                    )}
                  </td>
                  <td className="py-1 text-right">{i.qtyRequested} {i.measure}</td>
                  <td className="py-1 text-right font-medium">
                    {i.qtySeparated === null ? '—' : `${i.qtySeparated} ${i.measure}`}
                  </td>
                  {/* Quadradinho para conferir na caneta, na doca — é assim que
                      a conferência acontece antes de alguém abrir o celular. */}
                  <td className="py-1 text-center">☐</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {faltas.length > 0 && (
        <section className="break-inside-avoid border-t-2 border-line pt-3">
          <h2 className="text-base font-semibold text-ink-900">Itens que saíram incompletos ({faltas.length})</h2>
          <ul className="mt-1 space-y-1 text-sm text-ink-700">
            {faltas.map((i) => (
              <li key={i.id}>
                <b>{i.name}</b> — separado {i.qtySeparated} de {i.qtyRequested} {i.measure}
                {i.missingReason ? ` · ${motivoLabel(i.missingReason)}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-8 break-inside-avoid pt-8 text-sm">
        <div className="border-t border-ink-400 pt-1 text-center text-ink-500">Conferente do CD</div>
        <div className="border-t border-ink-400 pt-1 text-center text-ink-500">Recebido na unidade</div>
      </div>
    </div>
  );
}
