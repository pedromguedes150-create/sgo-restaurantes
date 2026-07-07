import { BarChart3 } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getExecutiveOverview } from '@/lib/executive';
import { Card, CardContent } from '@/components/ui/card';
import { ExecutiveClient } from '@/components/executive/executive-client';

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

export default async function ExecutivoPage({ searchParams }: { searchParams: { mes?: string } }) {
  const user = (await getSessionUser())!;
  const months = lastMonths(12);
  const yearMonth = months.includes(searchParams.mes ?? '') ? (searchParams.mes as string) : months[0];
  const overview = await getExecutiveOverview(user, yearMonth);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><BarChart3 className="h-5 w-5 text-accent" /> Visão Executiva</h1>
        <p className="text-sm text-muted-foreground">A rede em uma tela: meta, uso do sistema, desperdício, absenteísmo, troco, manutenção e ocorrências — por unidade, no mês.</p>
      </div>
      <Card className="print:border-0 print:shadow-none">
        <CardContent className="pt-4">
          <ExecutiveClient rows={overview.rows} totals={overview.totals} yearMonth={yearMonth} months={months} />
        </CardContent>
      </Card>
    </div>
  );
}
