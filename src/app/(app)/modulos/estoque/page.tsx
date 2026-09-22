import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { canEditModule } from '@/lib/permissions';
import { getEstoqueDaUnidade } from '@/lib/stock/query';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { EstoqueClient } from '@/components/stock/estoque-client';

export const dynamic = 'force-dynamic';

export default async function EstoquePage() {
  const user = (await getSessionUser())!;

  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  /* O estoque é da PRATELEIRA, então a unidade não é opcional: uma lista com
     lotes de cinco unidades misturados não serviria para conferir nada. Com o
     seletor global em "Toda a Rede", cai na primeira do alcance. */
  const selecionada = getSelectedUnitId(units.map((u) => u.id)) ?? units[0]?.id ?? null;
  const estoque = selecionada
    ? await getEstoqueDaUnidade(user, { unitId: selecionada })
    : { hoje: '', linhas: [], pendencias: [], contagens: { total: 0, lotes: 0, vencidos: 0, criticos: 0, atencao: 0, proximos: 0 } };

  return (
    <div className="space-y-5">
      <div>
        <LargeTitle
          title="Estoque"
          subtitle="Bipe o produto, informe o que encontrou e siga. O saldo é o que você declara — o SGO cobra a validade por lote, não a saída do dia a dia."
        />
        <FamilyTabs active="/modulos/estoque" />
      </div>
      <Card><CardContent className="pt-4">
        <EstoqueClient
          podeLancar={await canEditModule(user.role, 'STOCK')}
          units={units}
          unitId={selecionada}
          estoque={estoque}
        />
      </CardContent></Card>
    </div>
  );
}
