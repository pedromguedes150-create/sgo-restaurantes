import Link from 'next/link';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';
import { ArrowLeft, Download } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canViewAudit, getAuditForExport, getAuditModules } from '@/lib/audit-query';
import { Card, CardContent } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';

export const dynamic = 'force-dynamic';

const PERIODS = [7, 30, 90];

export default async function AuditoriaRelatorioPage({ searchParams }: { searchParams: { module?: string; days?: string } }) {
  const user = (await getSessionUser())!;
  if (!canViewAudit(user)) return <p className="text-sm text-ink-500">Acesso restrito ao Administrador e à Diretoria.</p>;

  const mod = searchParams.module || undefined;
  const days = PERIODS.includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const [rows, modules] = await Promise.all([getAuditForExport({ module: mod, days, take: 2000 }), getAuditModules()]);
  const exportHref = `/api/audit/export?days=${days}${mod ? `&module=${mod}` : ''}`;
  const q = (d: number, m?: string) => `/auditoria/relatorio?days=${d}${m ? `&module=${m}` : ''}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/auditoria" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> Auditoria</Link>
        <div className="flex gap-2">
          <a href={exportHref} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-sunken"><Download className="h-4 w-4" /> CSV</a>
          <PrintButton label="PDF" />
        </div>
      </div>

      {/* Dois controles, não uma fileira só com "·" no meio: período e módulo
          são escolhas independentes, e num trilho único a pílula eleita
          apareceria duas vezes — o que num segmented control significaria
          duas seleções no mesmo grupo. */}
      <div className="space-y-2 print:hidden">
        <SegmentedNav
          aria-label="Período do relatório"
          size="sm"
          value={String(days)}
          options={PERIODS.map((d) => ({ value: String(d), label: `${d} dias`, href: q(d, mod) }))}
        />
        <SegmentedNav
          aria-label="Módulo do relatório"
          size="sm"
          value={mod ?? ''}
          options={[{ value: '', label: 'Todos', href: q(days) }, ...modules.map((m) => ({ value: m, label: m, href: q(days, m) }))]}
        />
      </div>

      <div>
        <h1 className="text-xl font-bold text-ink-900">Relatório de Auditoria</h1>
        <p className="text-sm text-ink-500">Últimos {days} dias{module ? ` · módulo ${module}` : ' · todos os módulos'} · {rows.length} registro(s)</p>
      </div>

      <Card className="break-inside-avoid">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-sunken/40 text-left sgo-type-11 font-semibold text-ink-500">
                <th className="px-3 py-2">Data/hora</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Módulo</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Unidade</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-ink-500">Nenhum registro no período.</td></tr>}
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{r.createdAt.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-1.5 font-medium">{r.action}</td>
                  <td className="px-3 py-1.5">{r.module || '—'}</td>
                  <td className="px-3 py-1.5">{r.user}</td>
                  <td className="px-3 py-1.5">{r.unit || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-ink-500 print:hidden">O CSV inclui também entidade, ID e IP de cada registro.</p>
    </div>
  );
}
