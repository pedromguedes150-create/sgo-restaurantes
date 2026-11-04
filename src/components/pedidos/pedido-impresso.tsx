import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { textoDoPedido } from '@/lib/pedidos/regras';
import type { PedidoDaTela } from '@/lib/pedidos/pedidos';
import { AutoPrint } from '@/components/shared/auto-print';
import { PrintButton } from '@/components/ui/print-button';
import { CopiarTexto } from '@/components/pedidos/copiar-texto';
import { BlocosDoPedido, CabecalhoDoPedido } from '@/components/pedidos/bloco-do-pedido';

/**
 * O pedido inteiro, para conferir, imprimir (`imprimir`) ou copiar como texto
 * (v1.188.0: a mesma folha serve ao gerente em /modulos/pedidos/[id] e ao
 * separador em /modulos/pedidos/recebidos/[id] — a porta é a página, a folha é uma só).
 */
export function PedidoImpresso({ pedido, imprimir, voltarHref, voltarLabel, pdfHref, aviso, acoes }: {
  pedido: PedidoDaTela; imprimir: boolean; voltarHref: string; voltarLabel: string; pdfHref: string; aviso?: ReactNode; acoes?: ReactNode;
}) {
  const texto = textoDoPedido({ number: pedido.number, unitName: pedido.unitName, sentAt: pedido.sentAt, createdByName: pedido.createdByName, note: pedido.note, blocos: pedido.secoes.map((s) => ({ sectorName: s.sectorName, destination: s.destination, lines: s.lines })) });
  return (
    <div className="sgo-print mx-auto max-w-4xl space-y-4 bg-surface p-4 text-ink-900 print:p-0" data-testid="pedido-impresso">
      {imprimir && <AutoPrint />}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={voltarHref} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> {voltarLabel}</Link>
        <span className="flex flex-wrap gap-2">
          {acoes}
          <CopiarTexto texto={texto} />
          <Link href={pdfHref} target="_blank" className="sgo-btn sgo-btn--sm"><Printer className="h-4 w-4" /> PDF</Link>
          <PrintButton label="Imprimir" />
        </span>
      </div>
      {aviso}
      <header className="border-b-4 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-brand">GRUPO BEIJA-FLOR · PEDIDO POR SETOR</p>
        <CabecalhoDoPedido pedido={pedido} />
      </header>
      <BlocosDoPedido pedido={pedido} />
    </div>
  );
}
