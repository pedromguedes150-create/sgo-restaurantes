import Link from 'next/link';
import { ArrowLeft, BellRing } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { FormSelect, FormDatePicker } from '@/components/ui/ds/form-controls';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

function isoDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}
const fmtBR = (iso: string) => iso.split('-').reverse().join('/');

/** Relatório dos avisos automáticos ao RH (variações do Realizado da Escala). */
export default async function AvisosRhPage({ searchParams }: { searchParams: { de?: string; ate?: string; unit?: string } }) {
  const user = (await getSessionUser())!;
  const de = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.de ?? '') ? searchParams.de! : isoDaysAgo(30);
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.ate ?? '') ? searchParams.ate! : isoDaysAgo(0);

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const unitId = units.some((u) => u.id === searchParams.unit) ? searchParams.unit : undefined;
  const rows = await prisma.rhScheduleNotice.findMany({
    where: { date: { gte: de, lte: ate }, ...(unitId ? { unitId } : { unitId: { in: units.map((u) => u.id) } }) },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const unitBy = new Map(units.map((u) => [u.id, u.name]));

  // agrupado por colaborador para leitura rápida
  const byCollab = new Map<string, typeof rows>();
  for (const r of rows) { const arr = byCollab.get(r.collaboratorName) ?? []; arr.push(r); byCollab.set(r.collaboratorName, arr as typeof rows); }

  return (
    <div className="space-y-4">
      <Link href="/modulos/escala" className="inline-flex items-center gap-1 text-sm font-semibold text-accent print:hidden"><ArrowLeft className="h-4 w-4" /> Escala</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><BellRing className="h-5 w-5 text-accent" /> Avisos ao RH (Escala)</h1>
        <p className="text-sm text-muted-foreground">Toda variação lançada no Realizado (falta, atestado, férias…) gera um aviso automático. Quando a API do RH aceitar estes eventos, eles passam a ser enviados na hora.</p>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2 print:hidden" method="get">
        <FormDatePicker name="de" label="De" defaultValue={de} className="w-40" />
        <FormDatePicker name="ate" label="Até" defaultValue={ate} min={de} className="w-40" />
        {units.length > 1 && (
          <FormSelect
            name="unit" label="Unidade" defaultValue={unitId ?? ''} className="w-52"
            options={[{ value: '', label: 'Todas' }, ...units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]}
          />
        )}
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Filtrar</button>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} aviso(s) no período</span>
      </form>

      <Card>
        <CardContent className="pt-4">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aviso no período — lance variações na Escala (aba Realizado).</p>}
          <div className="space-y-3">
            {[...byCollab.entries()].map(([name, items]) => (
              <div key={name} className="rounded-lg border bg-card p-3">
                <p className="font-semibold text-brand">{name} <span className="text-xs font-normal text-muted-foreground">({items.length} aviso(s))</span></p>
                <div className="mt-1 space-y-0.5">
                  {items.map((r) => (
                    <p key={r.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{fmtBR(r.date)} · <strong>{r.status}</strong> · {unitBy.get(r.unitId) ?? '—'} · por {r.createdByName}</span>
                      <StatusBadge tone={r.sent ? 'success' : 'neutral'}>{r.sent ? 'Enviado ao RH' : 'Registrado'}</StatusBadge>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
