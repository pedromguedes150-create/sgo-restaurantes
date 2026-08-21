import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getOfficeChangeRequests, getSentChangeHistory } from '@/lib/cash-vault';
import { getDenominations, denomLabel } from '@/lib/cash-denominations';
import { LargeTitle } from '@/components/layout/page-chrome';
import { OfficeChangeClient } from '@/components/cash/office-change-client';

export const dynamic = 'force-dynamic';

/**
 * Escritório — fila de troco a enviar e relação do que já saiu.
 *
 * Do supervisor para cima. O CEO enxerga (leitura), como no resto do cofre.
 * A unidade não entra aqui: o gerente pede e confirma na tela dele.
 */
export default async function EscritorioTrocoPage({ searchParams }: { searchParams: { unidade?: string; de?: string; ate?: string } }) {
  const user = (await getSessionUser())!;
  const podeVer = user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'COORDINATOR' || user.role === 'CEO';
  if (!podeVer) notFound();

  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  const [fila, enviados] = await Promise.all([
    getOfficeChangeRequests(user),
    getSentChangeHistory(user, { unitId: searchParams.unidade, from: searchParams.de, to: searchParams.ate }),
  ]);

  /* As denominações variam por unidade: a tela precisa saber o rótulo de cada
     chave para não mostrar "0.50" cru na relação. */
  const rotulos: Record<string, Record<string, string>> = {};
  for (const u of units) {
    const cfg = await getDenominations(u.id);
    rotulos[u.id] = Object.fromEntries(cfg.denominations.map((d) => [d.key, denomLabel(d)]));
  }

  return (
    <div className="space-y-5">
      <LargeTitle title="Troco — escritório" subtitle="Fila de envio e relação do que já saiu para as unidades." />
      <OfficeChangeClient
        units={units}
        fila={fila}
        enviados={enviados}
        rotulos={rotulos}
        podeEnviar={user.role !== 'CEO'}
        filtro={{ unidade: searchParams.unidade ?? '', de: searchParams.de ?? '', ate: searchParams.ate ?? '' }}
      />
    </div>
  );
}
