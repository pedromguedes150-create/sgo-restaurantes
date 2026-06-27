import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { getCertificatesReport, listCertificates } from '@/lib/certificates/query';
import { canSeeCid, certTypeLabel } from '@/lib/certificates/labels';
import { PrintButton } from '@/components/ui/print-button';
import { ArrowLeft, Download } from 'lucide-react';

export const dynamic = 'force-dynamic';

function currentYm(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fmt(s: string | null): string { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }

export default async function AtestadosRelatorioPage({ searchParams }: { searchParams: { mes?: string } }) {
  const user = (await getSessionUser())!;
  const ym = searchParams.mes && /^\d{4}-\d{2}$/.test(searchParams.mes) ? searchParams.mes : currentYm();
  const showCid = canSeeCid(user.role);

  const [report, rows] = await Promise.all([
    getCertificatesReport(user, ym),
    listCertificates(user, { from: report_from(ym), to: report_to(ym) }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 bg-white p-2 text-black print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/modulos/atestados?mes=${ym}`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <div className="flex gap-2">
          <a href={`/api/certificates/export?mes=${ym}`} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold text-accent"><Download className="h-4 w-4" /> Excel/CSV</a>
          <PrintButton />
        </div>
      </div>

      <div className="border-b-2 border-brand pb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-brand">Relatório de Atestados — SGO Beija Flor</p>
        <h1 className="text-2xl font-black text-brand">{ym}</h1>
        <p className="text-sm text-gray-600">{report.totals.count} atestado(s) · {report.totals.days} dia(s) perdido(s)</p>
      </div>

      {/* Por unidade */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Por unidade</p>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-gray-600"><th className="py-1">Unidade</th><th className="py-1 text-right">Atestados</th><th className="py-1 text-right">Dias</th><th className="py-1 text-right">Absenteísmo</th></tr></thead>
          <tbody>
            {report.byUnit.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-500">Sem atestados no mês.</td></tr>}
            {report.byUnit.map((u) => (
              <tr key={u.unitId} className="border-b border-gray-200"><td className="py-1">{u.unitName}</td><td className="py-1 text-right">{u.count}</td><td className="py-1 text-right">{u.days}</td><td className="py-1 text-right">{u.absenteeismPct}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detalhamento */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Detalhamento</p>
        <table className="w-full text-xs">
          <thead><tr className="border-b text-left text-gray-600"><th className="py-1">Colaborador</th><th className="py-1">Unidade</th><th className="py-1">Tipo</th><th className="py-1">Período</th><th className="py-1 text-right">Dias</th>{showCid && <th className="py-1">CID</th>}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={showCid ? 6 : 5} className="py-2 text-gray-500">—</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="py-1">{r.collaboratorName}</td>
                <td className="py-1">{r.unitName}</td>
                <td className="py-1">{certTypeLabel(r.type)}</td>
                <td className="py-1">{fmt(r.startDate)}{r.type !== 'HOURS' ? ` → ${fmt(r.endDate)}` : ''}</td>
                <td className="py-1 text-right">{r.type === 'HOURS' ? `${r.hours ?? '—'}h` : r.days}</td>
                {showCid && <td className="py-1">{r.cid ? `${r.cid}${r.cidDescription ? ` — ${r.cidDescription}` : ''}` : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="pt-4 text-center text-[10px] text-gray-400">Gerado pelo SGO Beija Flor{showCid ? '' : ' · CID omitido (dado sensível LGPD)'}</p>
    </div>
  );
}

function report_from(ym: string): string { return `${ym}-01`; }
function report_to(ym: string): string { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; }
