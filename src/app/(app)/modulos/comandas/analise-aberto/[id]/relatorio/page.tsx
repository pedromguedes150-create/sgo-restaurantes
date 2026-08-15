import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getOpenCommandAnalysis } from '@/lib/commands/open-analysis';
import { PrintButton } from '@/components/ui/print-button';
import { formatBRL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Suspect { number: string; openedAt: string | null; value: number; daysOpen: number; items: { name: string; qty: number }[] }
function fmt(iso: string | null): string { if (!iso) return '—'; if (iso.length <= 10) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; } const [dt, tm] = iso.split('T'); const [y, m, d] = dt.split('-'); return `${d}/${m}/${y} ${(tm ?? '').slice(0, 5)}`; }

/** Relatório A4 limpo para o setor de MONITORAMENTO (item 1 — 22/07). */
export default async function MonitoramentoRelatorioPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const a = await getOpenCommandAnalysis(user, params.id);
  if (!a) return <p className="text-sm text-ink-500">Análise não encontrada.</p>;
  const unit = await prisma.unit.findUnique({ where: { id: a.unitId }, select: { name: true, code: true } });
  const suspects = (a.suspects as unknown as Suspect[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:max-w-none">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/modulos/comandas/analise-aberto?unit=${a.unitId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-sgo-brand"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <PrintButton label="Imprimir / PDF" />
      </div>

      <div className="rounded-lg border p-4 print:border-0 print:p-0">
        <div className="mb-3 border-b pb-2">
          <h1 className="text-lg font-black text-sgo-brand">Comandas em aberto — Monitoramento</h1>
          <p className="text-sm text-ink-500">{unit?.name} ({unit?.code}) · corte {fmt(a.cutDate)} · gerado {new Date(a.createdAt).toLocaleString('pt-BR')}</p>
          <p className="text-sm">Suspeitas: <b>{a.suspectCount}</b> · valor total <b>{formatBRL(Number(a.suspectValue))}</b></p>
          <p className="mt-1 text-xs text-ink-500">Comandas abertas com valor e data de abertura anterior ao corte. Buscar as câmeras pela data/hora.</p>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead><tr className="border-b text-left"><th className="p-1.5">Comanda</th><th className="p-1.5">Aberta em</th><th className="p-1.5 text-center">Dias</th><th className="p-1.5 text-right">Valor</th><th className="p-1.5">Itens</th></tr></thead>
          <tbody>
            {suspects.map((s, i) => (
              <tr key={i} className="border-b align-top">
                <td className="p-1.5 font-mono font-semibold">{s.number}</td>
                <td className="whitespace-nowrap p-1.5">{fmt(s.openedAt)}</td>
                <td className="p-1.5 text-center font-bold">{s.daysOpen}</td>
                <td className="p-1.5 text-right font-semibold">{formatBRL(s.value)}</td>
                <td className="p-1.5">{(s.items ?? []).map((it) => `${it.qty}× ${it.name}`).join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
