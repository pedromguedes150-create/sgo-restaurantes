import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { TODA_A_REDE } from '@/lib/scope/unit-context';
import { canEditModule } from '@/lib/permissions';
import { getEstoqueDaUnidade } from '@/lib/stock/query';
import { recebimentosPendentesDeEstoque } from '@/lib/stock/recebimento';
import { numeroDoPedido } from '@/lib/products/numero-do-pedido';
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
     seletor global em "Toda a Rede", cai na primeira do alcance.
     ⚠️ `getSelectedUnitId` devolve o marcador TODA_A_REDE (não um id) desde a
     v1.98.0 — tratá-lo como id consultava o estoque de uma unidade inexistente
     e a tela abria vazia, com o nome da unidade em branco. */
  const escolhida = getSelectedUnitId(units.map((u) => u.id));
  const selecionada = escolhida && escolhida !== TODA_A_REDE ? escolhida : units[0]?.id ?? null;
  const estoque = selecionada
    ? await getEstoqueDaUnidade(user, { unitId: selecionada })
    : { hoje: '', linhas: [], pendencias: [], contagens: { total: 0, lotes: 0, vencidos: 0, criticos: 0, atencao: 0, proximos: 0 } };
  const podeLancar = await canEditModule(user.role, 'STOCK');

  /* Destinos de transferência: TODA unidade ativa da rede, não só as do
     alcance — o gerente manda mercadoria para a unidade irmã, que não é dele. */
  const [todas, recebimentos] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    selecionada && podeLancar ? recebimentosPendentesDeEstoque(user, selecionada) : Promise.resolve([]),
  ]);
  const unidadesDestino = todas.filter((u) => u.id !== selecionada);

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
          podeLancar={podeLancar}
          units={units}
          unitId={selecionada}
          estoque={estoque}
          unidadesDestino={unidadesDestino}
          recebimentosPendentes={recebimentos.map((r) => ({
            requestId: r.requestId,
            rotulo: numeroDoPedido(r.number, r.createdAt),
            recebidoEm: r.recebidoEm.toLocaleDateString('pt-BR'),
            itensPendentes: r.itensPendentes,
          }))}
        />
      </CardContent></Card>
    </div>
  );
}
