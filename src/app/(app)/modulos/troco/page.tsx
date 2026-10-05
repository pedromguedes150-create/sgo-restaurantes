
import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';

import { permissaoDeRota } from '@/lib/permissions/links';

import { FamilyTabs } from '@/components/layout/family-tabs';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getVaultOverview, getVaultAlerts, getOpenChangeRequests } from '@/lib/cash-vault';
import { isSupervisory } from '@/lib/roles';
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
  const podeVer = await permissaoDeRota(user.role);
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;
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
  if (!vault) return <p className="text-sm text-ink-500">Sem acesso a esta unidade.</p>;

  return (
    <div className="space-y-4">
      {/* O cabeçalho (título, abas Cofre/Histórico, atalho do escritório) vive
      no cliente, no padrão do kit. O atalho segue só para quem envia. */}
      <VaultClient
        subtitulo={<>Cofre da unidade por denominação: confira diariamente, reponha os baldes dos caixas com miúdos e troque as notas grandes com o escritório.<span className="block"><FamilyTabs active="/modulos/troco" /></span></>}
        acoes={(user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'COORDINATOR' || user.role === 'CEO') && podeVer('/modulos/troco/escritorio') ? (
          <Link href="/modulos/troco/escritorio" className="sgo-btn"><Landmark className="h-3.5 w-3.5" /> Escritório — fila de envio e relação de enviados</Link>
            ) : undefined}
        abas={await abasDoPerfil(user.role, 'CASH')}
        units={units}
        selectedUnitId={selected.id}
        vault={vault}
        alerts={alerts}
        openRequestsNetwork={openRequestsNetwork}
        canOperate={user.role !== 'FINANCE' && user.role !== 'CEO'}
        canManageBuckets={user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'COORDINATOR'}
        canResolve={sup}
      />
    </div>
  );
}
