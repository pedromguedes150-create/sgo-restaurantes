import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getOilDashboard, listOilCollections, janelaValida } from '@/lib/oil/query';
import { listSuppliers } from '@/lib/suppliers';
import { OilClient, type OilDash, type OilRow } from '@/components/oil/oil-client';

export const dynamic = 'force-dynamic';

export default async function OleoPage({ searchParams }: { searchParams: { dias?: string } }) {
  const user = (await getSessionUser())!;
  const canLaunch = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'].includes(user.role);
  /* O período vive na URL porque é ele que decide o que vem do banco — os
     filtros de unidade e responsável trabalham DENTRO do que veio. */
  const dias = janelaValida(searchParams.dias);

  const [units, suppliers, dash, rows] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listSuppliers({ activeOnly: true }),
    getOilDashboard(user),
    listOilCollections(user, { dias }),
  ]);

  const dashboard: OilDash = dash;
  const list: OilRow[] = rows.map((r) => ({
    id: r.id, date: r.operationalDate, unit: r.unit.name,
    supplier: r.supplier?.name ?? 'Sem fornecedor',
    /* Quem coletou: o fornecedor cadastrado, ou o nome digitado quando a
       empresa não está no cadastro. */
    collector: r.supplier?.name ?? r.collectorName ?? '',
    liters: Number(r.liters), price: Number(r.pricePerLiter), total: Number(r.totalValue),
    method: r.paymentMethod ?? '', observation: r.observation ?? '',
    by: r.createdBy?.name ?? '', at: r.createdAt.toISOString(),
    receipt: r.receiptPath ?? null,
    dateEdited: r.dateEdited, dateEditedByName: r.dateEditedByName,
  }));

  return (
    <div className="space-y-4">
      {/* O cabeçalho (título + abas) vive no cliente, no padrão do kit. */}
      <OilClient
        subtitulo={'Controle da coleta de óleo usado (recebemos por ela): litros, valor/litro, total e forma de recebimento.'}
        abas={await abasDoPerfil(user.role, 'OIL')}
        canLaunch={canLaunch}
        isAdmin={user.role === 'ADMIN'}
        canEditDate={user.role === 'ADMIN' || user.role === 'SUPERVISOR'}
        meuNome={user.name}
        dias={dias}
        units={units}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        dashboard={dashboard}
        rows={list}
      />
    </div>
  );
}
