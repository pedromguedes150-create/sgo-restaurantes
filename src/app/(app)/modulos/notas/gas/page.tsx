import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listSuppliers } from '@/lib/suppliers';
import { getGasDashboard, listGasReceipts } from '@/lib/gas/query';
import { listGasContracts, getGasPurchasedInFilter } from '@/lib/gas/contracts';
import { isSupervisory } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { GasClient } from '@/components/gas/gas-client';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

/**
 * Análise de gás — rota própria, ainda DENTRO de Notas Recebidas.
 *
 * Antes era uma aba de Notas que abria um módulo inteiro (Dashboard, Histórico,
 * Contratos), e o resultado eram dois trilhos de abas empilhados: o de Notas em
 * cima e o do gás logo abaixo, com o mesmo desenho e sentidos diferentes.
 * Com rota própria, o trilho do gás passa a ser o único da tela.
 *
 * O gás continua pertencendo a Notas (decisão da v1.41.0): a aba "Análise de
 * gás" segue no trilho de Notas e traz para cá, e o link acima leva de volta —
 * sem sair do módulo.
 *
 * Efeito colateral que vale mais que o layout: a página de Notas parou de
 * carregar os dados de gás. Antes, TODA visita a `/modulos/notas` buscava
 * dashboard, contratos e 300 recebimentos de gás — inclusive de quem só queria
 * conferir uma nota e nunca abriu essa aba.
 */
export default async function AnaliseGasPage({
  searchParams,
}: {
  searchParams: { unidade?: string; fornecedor?: string; mes?: string };
}) {
  const user = (await getSessionUser())!;
  const fUnit = searchParams.unidade || undefined;
  const fSupplier = searchParams.fornecedor || undefined;
  const fMes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? '') ? searchParams.mes : undefined;

  const [units, suppliers, dashboard, receipts, contracts, purchased] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listSuppliers({ activeOnly: true }),
    getGasDashboard(user, { unitId: fUnit, supplierId: fSupplier, yearMonth: fMes }),
    listGasReceipts(user, { limit: 300 }),
    listGasContracts(user),
    getGasPurchasedInFilter(user, { unitId: fUnit, supplierId: fSupplier, yearMonth: fMes }),
  ]);

  return (
    <div className="space-y-5">
      <Link href="/modulos/notas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> Notas Recebidas
      </Link>
      <LargeTitle
        title="Análise de gás"
        subtitle="Preço por kg, histórico de recebimentos e andamento dos contratos. Os recebimentos entram pelo lançamento de nota, quando o fornecedor é de gás."
      />
      {/* De propósito SEM as abas de Notas aqui. Repeti-las nesta página
          empilharia dois trilhos outra vez — o defeito que esta rota existe
          para eliminar. O caminho de volta é o link acima; o único trilho da
          tela é o do próprio gás (Dashboard/Histórico/Contratos). */}
      <Card>
        <CardContent className="pt-4">
          <GasClient
            abas={await abasDoPerfil(user.role, 'GAS')}
            basePath="/modulos/notas/gas"
            canLaunch={false}
            isAdmin={user.role === 'ADMIN'}
            canEditDate={user.role === 'ADMIN' || user.role === 'SUPERVISOR'}
            canManageContracts={isSupervisory(user.role) || user.role === 'CEO'}
            units={units}
            suppliers={suppliers.filter((s) => s.isGas).map((s) => ({ id: s.id, name: s.name, cnpj: s.cnpj }))}
            dashboard={dashboard}
            purchased={purchased}
            filter={{ unitId: fUnit ?? '', supplierId: fSupplier ?? '', mes: fMes ?? '' }}
            receipts={receipts.map((r) => ({
              id: r.id, date: r.operationalDate, unit: r.unit.name, supplier: r.supplier?.name ?? 'Sem fornecedor',
              qty: Number(r.quantityKg), total: Number(r.totalValue), price: Number(r.pricePerKg), variation: r.variationPct, alerted: r.alerted,
              by: r.createdBy?.name ?? '', dateEdited: r.dateEdited, dateEditedByName: r.dateEditedByName,
            }))}
            contracts={contracts}
          />
        </CardContent>
      </Card>
    </div>
  );
}
