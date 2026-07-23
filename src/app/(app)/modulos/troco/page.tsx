import { Banknote } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getVaultOverview, getVaultAlerts, getOpenChangeRequests } from '@/lib/cash-vault';
import { isSupervisory } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { VaultClient } from '@/components/cash/vault-client';

export const dynamic = 'force-dynamic';

/**
 * Gestão de Troco v2 (16/07): cofre por unidade com saldo por denominação,
 * baldes com valor-alvo, reposição diária, troca com o escritório e registro
 * (com alerta) de retiradas proibidas. Substitui o modelo antigo de sessões.
 * 23/07: solicitação de troco à supervisão, troca direta no caixa (unidade sem
 * baldes) e histórico filtrável.
 */
export default async function TrocoPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>;
  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const sup = isSupervisory(user.role);
  const wide = sup || user.role === 'CEO';
  const [vault, alerts, openRequestsNetwork] = await Promise.all([
    getVaultOverview(user, selected.id),
    wide ? getVaultAlerts(user, ym) : Promise.resolve(null),
    wide ? getOpenChangeRequests(user) : Promise.resolve([]),
  ]);
  if (!vault) return <p className="text-sm text-muted-foreground">Sem acesso a esta unidade.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><Banknote className="h-5 w-5 text-accent" /> Gestão de Troco</h1>
        <p className="text-sm text-muted-foreground">Cofre da unidade por denominação: confira diariamente, reponha os baldes dos caixas com miúdos e troque as notas grandes com o escritório.</p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <VaultClient
            units={units}
            selectedUnitId={selected.id}
            vault={vault}
            alerts={alerts}
            openRequestsNetwork={openRequestsNetwork}
            canOperate={user.role !== 'FINANCE' && user.role !== 'CEO'}
            canManageBuckets={user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'COORDINATOR'}
            canResolve={sup}
          />
        </CardContent>
      </Card>
    </div>
  );
}
