import Link from 'next/link';
import { ArrowLeft, HandCoins } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listPayouts, getPayoutDashboard, listPayoutCollaborators } from '@/lib/people/payouts';
import { Card, CardContent } from '@/components/ui/card';
import { PayoutsClient } from '@/components/people/payouts-client';

export const dynamic = 'force-dynamic';

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default async function ComissoesPage({ searchParams }: { searchParams: { mes?: string } }) {
  const user = (await getSessionUser())!;
  const months = lastMonths(12);
  const yearMonth = months.includes(searchParams.mes ?? '') ? (searchParams.mes as string) : months[0];
  const canCreate = user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'CEO';

  const [rows, dash, collabs] = await Promise.all([
    listPayouts(user, yearMonth),
    getPayoutDashboard(user, yearMonth),
    canCreate ? listPayoutCollaborators(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-sgo-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-sgo-brand"><HandCoins className="h-5 w-5 text-sgo-brand" /> Comissões &amp; Mobilidade</h1>
        <p className="text-sm text-ink-500">Supervisão/Admin lançam os valores (comissão do Teknisa / mobilidade) por colaborador. Dashboard e histórico mensal.</p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <PayoutsClient
            rows={rows.map((r) => ({ id: r.id, collaboratorName: r.collaboratorName, unitName: r.unitName, type: r.type, amount: r.amount, note: r.note, createdByName: r.createdByName, createdAt: r.createdAt }))}
            dash={dash}
            collabs={collabs.map((c) => ({ id: c.id, name: c.name, jobTitle: c.jobTitle, units: c.units.map((u) => u.unit.name).join(', ') }))}
            yearMonth={yearMonth}
            months={months}
            canCreate={canCreate}
            isAdmin={user.role === 'ADMIN'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
