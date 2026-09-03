import Link from 'next/link';
import { ScanLine } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getScanContext } from '@/lib/commands/scan';
import { Card, CardContent } from '@/components/ui/card';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { ScanClient } from '@/components/commands/scan-client';

export const dynamic = 'force-dynamic';

export default async function ConferenciaPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const isCashier = user.role === 'CASHIER';

  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada ao seu usuário.</p>;

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const r = await getScanContext(user, selected.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink-900">
            <ScanLine className="h-5 w-5 text-brand" /> Conferência por leitor
          </h1>
          <p className="text-sm text-ink-500">
            {r.ok ? `${selected.name} — dia operacional ${r.ctx.operationalDate}` : selected.name}
          </p>
        </div>
        {!isCashier && (
          <Link href="/modulos/comandas" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand">
            ← Contagem manual
          </Link>
        )}
      </div>

      {units.length > 1 && <UnitSelectNav units={units} selected={selected.id} />}

      {!r.ok ? (
        <Card>
          <CardContent className="py-6 text-sm text-ink-500">
            {r.reason === 'NO_CONFIG'
              ? 'A sequência de comandas desta unidade ainda não foi configurada. Peça ao Administrador em Configurações → Comandas.'
              : 'Você não tem acesso a esta unidade.'}
          </CardContent>
        </Card>
      ) : (
        <ScanClient
          unitId={r.ctx.unitId}
          unitName={r.ctx.unitName}
          operationalDate={r.ctx.operationalDate}
          activeNumbers={r.ctx.activeNumbers}
          nightlyNumbers={r.ctx.nightlyNumbers}
          partial={r.ctx.partial}
          totalAtivas={r.ctx.totalAtivas}
          alreadyCounted={r.ctx.alreadyCounted}
          userName={user.name}
        />
      )}
    </div>
  );
}
