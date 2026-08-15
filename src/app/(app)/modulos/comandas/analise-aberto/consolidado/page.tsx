import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getNetworkLockConsolidation } from '@/lib/commands/open-analysis';
import { PrintButton } from '@/components/ui/print-button';
import { formatBRL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function fmt(iso: string | null): string { if (!iso) return '—'; if (iso.length <= 10) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; } const [dt] = iso.split('T'); const [y, m, d] = dt.split('-'); return `${d}/${m}/${y}`; }

/** Consolidado da rede p/ o ADMINISTRATIVO: comandas a TRAVAR por unidade e data (item 1 — 22/07). */
export default async function ConsolidadoPage() {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return <p className="text-sm text-ink-500">Restrito à Supervisão/Administração.</p>;
  const rows = await getNetworkLockConsolidation(user);
  const totalCmds = rows.reduce((s, r) => s + r.suspects.length, 0);
  const totalValue = rows.reduce((s, r) => s + r.suspectValue, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:max-w-none">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/modulos/comandas/analise-aberto" className="inline-flex items-center gap-1 text-sm font-semibold text-sgo-brand"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <PrintButton label="Imprimir / PDF" />
      </div>

      <div className="rounded-lg border p-4 print:border-0 print:p-0">
        <div className="mb-3 border-b pb-2">
          <h1 className="text-lg font-black text-sgo-brand">Comandas a travar — Consolidado da rede</h1>
          <p className="text-sm text-ink-500">Para o Administrativo · gerado {new Date().toLocaleString('pt-BR')} · baseado na análise mais recente de cada unidade</p>
          <p className="text-sm"><b>{totalCmds}</b> comanda(s) a travar em <b>{rows.length}</b> unidade(s) · valor total <b>{formatBRL(totalValue)}</b></p>
        </div>

        {rows.length === 0 && <p className="text-sm text-ink-500">Nenhuma análise com suspeitas. Suba os relatórios em cada unidade primeiro.</p>}

        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.unitId} className="break-inside-avoid">
              <p className="text-sm font-bold text-sgo-brand">{r.unitName} <span className="font-normal text-ink-500">· corte {fmt(r.cutDate)} · {r.suspects.length} comanda(s) · {formatBRL(r.suspectValue)}</span></p>
              <table className="mt-1 w-full border-collapse text-xs">
                <thead><tr className="border-b text-left text-ink-500"><th className="p-1">Comanda (travar)</th><th className="p-1">Aberta em</th><th className="p-1 text-center">Dias</th><th className="p-1 text-right">Valor</th></tr></thead>
                <tbody>
                  {r.suspects.map((s, i) => (
                    <tr key={i} className="border-b"><td className="p-1 font-mono font-semibold">{s.number}</td><td className="p-1">{fmt(s.openedAt)}</td><td className="p-1 text-center">{s.daysOpen}</td><td className="p-1 text-right">{formatBRL(s.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
