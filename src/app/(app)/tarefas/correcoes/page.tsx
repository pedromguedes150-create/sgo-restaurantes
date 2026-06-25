import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getCorrectionsReport, type CorrectionItem } from '@/lib/tasks/corrections';
import { currentOperationalDate } from '@/lib/date/operational';
import { Card, CardContent } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CorrecoesPage({ searchParams }: { searchParams: { unit?: string; date?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true, timezone: true, cutoffHour: true } });
  const selectedUnit = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const today = selectedUnit ? currentOperationalDate({ timezone: selectedUnit.timezone, cutoffHour: selectedUnit.cutoffHour }) : new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? searchParams.date! : today;

  const report = selectedUnit ? await getCorrectionsReport(user, selectedUnit.id, date) : null;
  const linkFor = (p: Record<string, string>) => `/tarefas/correcoes?${new URLSearchParams({ unit: selectedUnit?.id ?? '', date, ...p }).toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/tarefas" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Tarefas</Link>
        <PrintButton label="Imprimir / PDF" />
      </div>
      <h1 className="text-xl font-bold text-brand">Relatório de correções do dia</h1>
      <p className="text-sm text-muted-foreground">Itens marcados como 🟡 Em correção e 🔴 A corrigir nos checklists. Escolha a data para ver o histórico.</p>

      <form className="flex flex-wrap items-center gap-2 print:hidden">
        {units.length > 1 && (
          <select name="unit" defaultValue={selectedUnit?.id} className="h-9 rounded-lg border-2 border-input bg-background px-2 text-sm">
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <input type="date" name="date" defaultValue={date} className="h-9 rounded-lg border-2 border-input bg-background px-2 text-sm" />
        <button className="rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-accent">Ver</button>
      </form>

      <p className="text-sm font-semibold text-brand">{selectedUnit?.name} · {date}</p>

      {!report || report.total === 0 ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">Nenhum item em correção ou a corrigir neste dia. 🎉</p>
      ) : (
        <>
          <Section title="🔴 A corrigir" items={report.aCorrigir} tone="critical" />
          <Section title="🟡 Em correção" items={report.emCorrecao} tone="medium" />
        </>
      )}

      <div className="flex flex-wrap gap-2 print:hidden">
        {[1, 2, 3, 7].map((d) => {
          const dt = new Date(`${date}T12:00:00`); dt.setDate(dt.getDate() - d);
          const s = dt.toISOString().slice(0, 10);
          return <Link key={d} href={linkFor({ date: s })} className="rounded-full border px-3 py-1.5 text-xs hover:border-accent">{s} (−{d}d)</Link>;
        })}
      </div>
    </div>
  );
}

function Section({ title, items, tone }: { title: string; items: CorrectionItem[]; tone: 'critical' | 'medium' }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-1.5 pt-4">
        <p className={`text-sm font-bold ${tone === 'critical' ? 'text-critical' : 'text-medium'}`}>{title} ({items.length})</p>
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border bg-card p-2.5 text-sm">
            <p className="font-medium text-brand">{it.text}</p>
            {it.note && <p className="text-xs text-muted-foreground">Obs.: {it.note}</p>}
            <p className="text-[11px] text-muted-foreground">{it.checklist}{it.by ? ` · ${it.by}` : ''}{it.time ? ` · ${it.time}` : ''}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
