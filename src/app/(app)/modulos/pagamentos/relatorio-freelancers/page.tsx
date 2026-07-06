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

export default async function RelatorioFreelancersPage({ searchParams }: { searchParams: { month?: string; unit?: string } }) {
  const user = (await getSessionUser())!;
  const canSee = user.role === 'FINANCE' || user.role === 'ADMIN' || user.role === 'CEO' || user.role === 'SUPERVISOR';
  if (!canSee) return <p className="text-sm text-muted-foreground">Relatório restrito a Financeiro/Supervisão/Admin.</p>;

  const months = lastMonths(12);
  const ym = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : months[0].value;

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const selectedUnit = searchParams.unit && units.some((u) => u.id === searchParams.unit) ? searchParams.unit : undefined;

  const data = await getFreelancerConsolidation(user, ym, selectedUnit);
  const label = months.find((m) => m.value === ym)?.label ?? ym;

  const exportHref = `/api/payments/freelancer-report?month=${ym}${selectedUnit ? `&unit=${selectedUnit}` : ''}`;

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/modulos/pagamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Pagamentos</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-brand">Consolidação de Freelancers — {label}</h1>
        <div className="flex gap-2 print:hidden">
          <a href={exportHref} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-accent"><Download className="h-4 w-4" /> Exportar (Excel)</a>
          <PrintButton />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Pagamentos de freelancers <strong>aprovados e pagos</strong> no mês — base para envio ao Financeiro.</p>

      {/* Filtros (listas suspensas) */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mês</p>
          <UnitSelectNav units={months.map((m) => ({ id: m.value, name: m.label }))} selected={ym} paramName="month" className="h-10 w-56 rounded-lg border-2 border-input bg-background px-3 text-sm font-medium" />
        </div>
        {units.length > 1 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unidade</p>
            <UnitSelectNav units={[{ id: '', name: 'Todas as unidades' }, ...units]} selected={selectedUnit ?? ''} paramName="unit" className="h-10 w-56 rounded-lg border-2 border-input bg-background px-3 text-sm font-medium" />
          </div>
        )}
      </div>

      {/* Total geral */}
      <Card>
        <CardContent className="flex items-center justify-between py-3">
          <span className="text-sm text-muted-foreground">{data.grandCount} pagamento(s) · {data.groups.length} freelancer(s)</span>
          <span className="text-lg font-black text-brand">{formatBRL(data.grandTotal)}</span>
        </CardContent>
      </Card>

      {data.groups.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento de freelancer aprovado/pago neste mês.</p>}

      {data.groups.map((g) => (
        <Card key={g.freelancerId}>
          <CardContent className="space-y-1.5 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-brand">{g.name}</p>
                <p className="text-xs text-muted-foreground">PIX: {g.pixKey || <span className="text-critical">não cadastrada</span>}</p>
              </div>
              <span className="text-right">
                <span className="block font-black text-brand">{formatBRL(g.total)}</span>
                <span className="text-xs text-muted-foreground">{g.count} pagto(s)</span>
              </span>
            </div>
            <div className="divide-y border-t pt-1">
              {g.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span className="text-muted-foreground">{l.date} · {l.unit} · {l.status}</span>
                  <span className="flex items-center gap-2">
                    {l.divergent && <span className="flex items-center gap-0.5 text-xs font-semibold text-medium"><AlertTriangle className="h-3 w-3" /> padrão {l.standardValue != null ? formatBRL(l.standardValue) : '—'}</span>}
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
