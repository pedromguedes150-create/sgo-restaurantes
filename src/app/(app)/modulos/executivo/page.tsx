
import { getSessionUser } from '@/lib/auth/session';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { getExecutiveOverview } from '@/lib/executive';
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
      {/* O cabeçalho (título, PDF) e o filtro de mês vivem no cliente, no padrão do kit. */}
      <ExecutiveClient
        rows={overview.rows}
        totals={overview.totals}
        yearMonth={yearMonth}
        months={months}
        subtitulo={<>A rede em uma tela: meta, uso do sistema, desperdício, absenteísmo, troco, manutenção e ocorrências — por unidade, no mês.<span className="block"><FamilyTabs active="/modulos/executivo" /></span></>}
      />
    </div>
  );
}
