import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { romaneioPorSetor } from '@/lib/products/separacao';
import { rotuloDaQuantidade } from '@/lib/products/embalagem-pedido';
import { PrintButton } from '@/components/ui/print-button';

export const dynamic = 'force-dynamic';

const fmt = (d: Date) => new Date(d).toLocaleString('pt-BR');

/**
 * ROMANEIO POR SETOR — tudo que UM setor separa hoje, de todas as unidades.
 *
 * Duas leituras na mesma folha: o TOTAL por produto (é o que se pega no
 * estoque de uma vez: "tilápia — 13 kg") e, abaixo, a abertura por unidade
 * (é como se monta cada carga). A porta é a da fila: o separador imprime o do
 * setor dele; ADMIN/CEO, qualquer um.
 */
export default async function RomaneioPorSetorPage({ params }: { params: { sectorId: string } }) {
  const user = (await getSessionUser())!;
  const r = await romaneioPorSetor(user, params.sectorId);
  if (!r) notFound();

  return (
    <div className="sgo-print mx-auto max-w-3xl space-y-4 bg-surface p-2 text-ink-900 print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/modulos/separacao" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
          <ArrowLeft className="h-4 w-4" /> Voltar para a fila
        </Link>
        <PrintButton />
      </div>

      <div className="border-b-2 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-ink-900">Romaneio por Setor — SGO Beija Flor</p>
        <h1 className="text-2xl font-bold text-ink-900">{r.setorNome}</h1>
        <p className="text-sm text-ink-500">
          Gerado em {fmt(r.geradoEm)} · {r.pedidos.length} pedido(s) aberto(s) · {r.totalSeparados} de {r.totalItens} itens separados
        </p>
      </div>

      {r.pedidos.length === 0 ? (
        <p className="text-sm text-ink-500">Nenhum pedido aberto com itens deste setor.</p>
      ) : (
        <>
          <section className="space-y-1 break-inside-avoid">
            <h2 className="border-b border-line pb-1 text-base font-semibold text-ink-900">Total a separar</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-500">
                  <th className="py-1">Produto</th>
                  <th className="w-20 py-1 text-right">Unidades</th>
                  <th className="w-28 py-1 text-right">Pedido</th>
                  <th className="w-28 py-1 text-right">Separado</th>
                  <th className="w-16 py-1 text-center">Conferi</th>
                </tr>
              </thead>
              <tbody>
                {r.totais.map((t) => (
                  <tr key={`${t.name}|${t.packUnit}`} className="border-t border-line align-top">
                    <td className="py-1">{t.name}</td>
                    <td className="py-1 text-right tabular-nums text-ink-500">{t.unidades}</td>
                    <td className="py-1 text-right font-medium tabular-nums">{rotuloDaQuantidade(t.qtyRequested, t.packUnit, t.measure)}</td>
                    <td className="py-1 text-right tabular-nums">{t.qtySeparated > 0 ? rotuloDaQuantidade(t.qtySeparated, t.packUnit, t.measure) : '—'}</td>
                    <td className="py-1 text-center">☐</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* A embalagem PEDIDA é parte da linha: "2 fardos" e "6 unidades" do
                mesmo produto são duas linhas, porque o SGO não converte um no
                outro — somar fardos com unidades daria um número sem sentido. */}
          </section>

          {r.pedidos.map((p) => (
            <section key={p.requestId} className="space-y-1 break-inside-avoid">
              <h2 className="border-b border-line pb-1 text-base font-semibold text-ink-900">
                {p.unitName} <span className="text-sm font-normal text-ink-500">· {p.etiqueta} · {p.statusLabel}</span>
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-500">
                    <th className="py-1">Produto</th>
                    <th className="w-28 py-1 text-right">Pedido</th>
                    <th className="w-28 py-1 text-right">Separado</th>
                    <th className="w-16 py-1 text-center">Conferi</th>
                  </tr>
                </thead>
                <tbody>
                  {p.itens.map((i) => (
                    <tr key={i.itemId} className="border-t border-line align-top">
                      <td className="py-1">{i.name}</td>
                      <td className="py-1 text-right tabular-nums">{rotuloDaQuantidade(i.qtyRequested, i.packUnit, i.measure)}</td>
                      <td className="py-1 text-right font-medium tabular-nums">{i.qtySeparated === null ? '—' : rotuloDaQuantidade(i.qtySeparated, i.packUnit, i.measure)}</td>
                      <td className="py-1 text-center">☐</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}

      <p className="break-inside-avoid border-t border-line pt-2 text-center sgo-type-11 font-semibold uppercase tracking-wide text-ink-500">
        Documento interno de controle operacional — sem valor fiscal
      </p>
    </div>
  );
}
