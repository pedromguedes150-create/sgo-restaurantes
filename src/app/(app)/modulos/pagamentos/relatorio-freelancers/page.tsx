import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getFreelancerConsolidation } from '@/lib/payments/query';
import { Card, CardContent } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { formatBRL } from '@/lib/utils';
import { ArrowLeft, Download, AlertTriangle } from 'lucide-react';
import { FormDatePicker } from '@/components/ui/ds/form-controls';

export const dynamic = 'force-dynamic';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function lastMonths(n: number): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push({ value, label: `${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}` });
  }
  return out;
}

function mondayOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=dom
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7)); // volta até segunda
  return d.toISOString().slice(0, 10);
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function RelatorioFreelancersPage({ searchParams }: { searchParams: { month?: string; unit?: string; semana?: string } }) {
  const user = (await getSessionUser())!;
  const canSee = user.role === 'FINANCE' || user.role === 'ADMIN' || user.role === 'CEO' || user.role === 'SUPERVISOR';
  if (!canSee) return <p className="text-sm text-ink-500">Relatório restrito a Financeiro/Supervisão/Admin.</p>;

  const months = lastMonths(12);
  const ym = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : months[0].value;

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const selectedUnit = searchParams.unit && units.some((u) => u.id === searchParams.unit) ? searchParams.unit : undefined;

  // Fechamento SEMANAL (16/07): ?semana=<qualquer dia> → segunda→domingo daquela semana
  const weekMode = /^d{4}-d{2}-d{2}$/.test(searchParams.semana ?? '');
  const weekFrom = weekMode ? mondayOf(searchParams.semana!) : null;
  const weekTo = weekFrom ? addDaysISO(weekFrom, 6) : null;
  const data = await getFreelancerConsolidation(user, ym, selectedUnit, weekFrom && weekTo ? { from: weekFrom, to: weekTo } : undefined);
  const fmtBR = (iso: string) => iso.split('-').reverse().join('/');
  const label = weekFrom && weekTo ? `Semana ${fmtBR(weekFrom)} → ${fmtBR(weekTo)}` : (months.find((m) => m.value === ym)?.label ?? ym);

  const exportHref = `/api/payments/freelancer-report?month=${ym}${weekFrom ? `&semana=${weekFrom}` : ''}${selectedUnit ? `&unit=${selectedUnit}` : ''}`;

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/modulos/pagamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pagamentos</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-brand">Consolidação de Freelancers — {label}</h1>
        <div className="flex gap-2 print:hidden">
          <a href={exportHref} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand"><Download className="h-4 w-4" /> Exportar (Excel)</a>
          <PrintButton />
        </div>
      </div>
      <p className="text-sm text-ink-500">Pagamentos de freelancers <strong>aprovados e pagos</strong> no período — base para envio ao Financeiro. Fechamento semanal: segunda → domingo (pago na segunda), pelo dia do trabalho.</p>

      {/* Filtros (listas suspensas) */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Mês</p>
          <UnitSelectNav units={months.map((m) => ({ id: m.value, name: m.label }))} selected={ym} paramName="month" className="h-10 w-56 rounded-lg border-2 border-line-strong bg-surface px-3 text-sm font-medium" />
        </div>
        <form method="get" className="flex items-end gap-1.5">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Ou fechamento semanal</p>
            <FormDatePicker name="semana" aria-label="Início da semana" defaultValue={weekFrom ?? ''} className="w-44" />
            {selectedUnit && <input type="hidden" name="unit" value={selectedUnit} />}
          </div>
          <button type="submit" className="h-10 rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand">Ver semana</button>
          {weekFrom && <Link href={`/modulos/pagamentos/relatorio-freelancers?month=${ym}${selectedUnit ? `&unit=${selectedUnit}` : ''}`} className="h-10 rounded-lg border px-3 py-2 text-sm font-semibold">Voltar ao mês</Link>}
        </form>
        {units.length > 1 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Unidade</p>
            <UnitSelectNav units={[{ id: '', name: 'Todas as unidades' }, ...units]} selected={selectedUnit ?? ''} paramName="unit" className="h-10 w-56 rounded-lg border-2 border-line-strong bg-surface px-3 text-sm font-medium" />
          </div>
        )}
      </div>

      {/* Total geral */}
      <Card>
        <CardContent className="flex items-center justify-between py-3">
          <span className="text-sm text-ink-500">{data.grandCount} pagamento(s) · {data.groups.length} freelancer(s)</span>
          <span className="text-lg font-black text-brand">{formatBRL(data.grandTotal)}</span>
        </CardContent>
      </Card>

      {data.groups.length === 0 && <p className="text-sm text-ink-500">Nenhum pagamento de freelancer aprovado/pago neste mês.</p>}

      {data.groups.map((g) => (
        <Card key={g.freelancerId}>
          <CardContent className="space-y-1.5 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-brand">{g.name}</p>
                <p className="text-xs text-ink-500">PIX: {g.pixKey || <span className="text-danger">não cadastrada</span>}</p>
              </div>
              <span className="text-right">
                <span className="block font-black text-brand">{formatBRL(g.total)}</span>
                <span className="text-xs text-ink-500">{g.count} pagto(s)</span>
              </span>
            </div>
            <div className="divide-y border-t pt-1">
              {g.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span className="text-ink-500">{l.date} · {l.unit} · {l.status}</span>
                  <span className="flex items-center gap-2">
                    {l.divergent && <span className="flex items-center gap-0.5 text-xs font-semibold text-warning"><AlertTriangle className="h-3 w-3" /> padrão {l.standardValue != null ? formatBRL(l.standardValue) : '—'}</span>}
                    <span className="font-semibold">{formatBRL(l.amount)}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
