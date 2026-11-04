import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getPedido } from '@/lib/pedidos/pedidos';
import { textoDoPedido } from '@/lib/pedidos/regras';
import { AutoPrint } from '@/components/shared/auto-print';
import { PrintButton } from '@/components/ui/print-button';
import { CopiarTexto } from '@/components/pedidos/copiar-texto';
import { BlocosDoPedido, CabecalhoDoPedido } from '@/components/pedidos/bloco-do-pedido';

export const dynamic = 'force-dynamic';

/** Um pedido por setor (v1.185.0): o pedido inteiro, para conferir, imprimir (?imprimir=1) ou copiar como texto. */
export default async function PedidoPage({ params, searchParams }: { params: { id: string }; searchParams: { imprimir?: string; enviado?: string } }) {
  const user = (await getSessionUser())!;
  const p = await getPedido(user, params.id);
  if (!p) notFound();
  const texto = textoDoPedido({ number: p.number, unitName: p.unitName, destino: p.destino, sentAt: p.sentAt, createdByName: p.createdByName, note: p.note, blocos: p.secoes.map((s) => ({ sectorName: s.sectorName, lines: s.lines })) });

  return (
    <div className="sgo-print mx-auto max-w-4xl space-y-4 bg-surface p-4 text-ink-900 print:p-0">
      {searchParams.imprimir === '1' && <AutoPrint />}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/modulos/pedidos?aba=enviados" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pedidos</Link>
        <span className="flex gap-2">
          <CopiarTexto texto={texto} />
          <Link href={`/modulos/pedidos/${p.id}?imprimir=1`} target="_blank" className="sgo-btn sgo-btn--sm"><Printer className="h-4 w-4" /> PDF</Link>
          <PrintButton label="Imprimir" />
        </span>
      </div>
      {searchParams.enviado === '1' && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success print:hidden" data-testid="aviso-enviado">Pedido nº {p.number} enviado. Os separadores dos setores envolvidos foram avisados.</p>}
      <header className="border-b-4 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-brand">GRUPO BEIJA-FLOR · PEDIDO POR SETOR</p>
        <CabecalhoDoPedido pedido={p} />
      </header>
      <BlocosDoPedido pedido={p} />
    </div>
  );
}
