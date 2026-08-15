import Link from 'next/link';
import { ArrowLeft, ArrowRightLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listRoleChanges } from '@/lib/people/role-change';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

const KIND = {
  FUNCTION: { label: 'Função', tone: 'medium' as const },
  SECTOR: { label: 'Setor', tone: 'neutral' as const },
};

export default async function MudancasPage() {
  const user = (await getSessionUser())!;
  const rows = await listRoleChanges(user);

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <div>
        <LargeTitle title="Mudanças de função/setor" />
        <p className="text-sm text-ink-500">
          Registro consolidado para informar o RH. Mudança de <strong>setor</strong> vale no SGO na hora (Mapa de Funções);
          mudança de <strong>função</strong> é solicitação — efetiva no RH e o cargo atualiza no próximo sync.
        </p>
      </div>
      <Card>
        <CardContent className="pt-4">
          {rows.length === 0 && <p className="text-sm text-ink-500">Nenhuma mudança registrada ainda. Edite função/setor no Mapa de Funções.</p>}
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-brand">{r.collaboratorName}</p>
                    <p className="text-sm">
                      <span className="text-ink-500">{r.fromValue || 'sem registro'}</span>
                      {' → '}
                      <span className="font-semibold">{r.toValue}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {r.unitName} · por {r.requestedByName} em {new Date(r.createdAt).toLocaleDateString('pt-BR')} às {new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <StatusBadge tone={KIND[r.kind].tone}>{KIND[r.kind].label}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
