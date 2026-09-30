import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { resolveUnitFilter } from '@/lib/scope/unit-filter';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { listExpenses, getExpenseSummary } from '@/lib/expenses/query';
import { PODE_LANCAR } from '@/lib/expenses/create';
import { podeDevolver } from '@/lib/expenses/refund';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { ExpensesClient } from '@/components/expenses/expenses-client';

export const dynamic = 'force-dynamic';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * DESPESAS — retiradas do COFRE da unidade.
 *
 * A tela obedece o seletor de unidade do cabeçalho: o gerente vê a sua; quem
 * enxerga a rede vê tudo, com a unidade em cada linha. O recorte de verdade é
 * o do servidor (`unitScopeWhere`), o filtro da URL só estreita.
 */
export default async function DespesasPage({ searchParams }: {
  searchParams: { start?: string; end?: string; categoria?: string; status?: string; unit?: string; unidade?: string };
}) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const idsAcessiveis = units.map((u) => u.id);
  const filtroUnidade = resolveUnitFilter(searchParams, idsAcessiveis, getSelectedUnitId(idsAcessiveis));

  const hoje = hojeNaOperacao();
  const start = DIA.test(searchParams.start ?? '') ? searchParams.start! : `${hoje.slice(0, 7)}-01`;
  const end = DIA.test(searchParams.end ?? '') ? searchParams.end! : hoje;
  const filtro = {
    unitIds: filtroUnidade.all ? undefined : filtroUnidade.ids,
    de: start, ate: end,
    categoria: searchParams.categoria, status: searchParams.status,
  };
  const [linhas, resumo] = await Promise.all([listExpenses(user, filtro), getExpenseSummary(user, filtro)]);

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Despesas"
        subtitle="Despesas pagas com dinheiro retirado do COFRE da unidade. O escritório registra a devolução quando recompõe o valor."
      />
      <Card>
        <CardContent className="pt-4">
          <ExpensesClient
            linhas={linhas.map((l) => ({
              ...l,
              createdAt: l.createdAt.toISOString(),
              refundedAt: l.refundedAt?.toISOString() ?? null,
            }))}
            resumo={resumo}
            units={units}
            unidadeSelecionada={filtroUnidade.all ? null : filtroUnidade.ids[0] ?? null}
            filtros={{ start, end, categoria: searchParams.categoria ?? '', status: searchParams.status ?? '' }}
            podeLancar={PODE_LANCAR.has(user.role)}
            podeDevolver={podeDevolver(user.role)}
            visaoRede={units.length > 1}
            hoje={hoje}
          />
        </CardContent>
      </Card>
    </div>
  );
}
