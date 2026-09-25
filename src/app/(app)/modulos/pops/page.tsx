import Link from 'next/link';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listPopsForUser } from '@/lib/pops';
import { STANDARD_SECTORS } from '@/lib/workforce';
import { opcoesDePublico } from '@/lib/treinamentos/publico';
import { permissaoDeRota } from '@/lib/permissions/links';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PopEditor } from '@/components/pops/pop-editor';
import { BarChart3, GraduationCap } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function PopsPage() {
  const user = (await getSessionUser())!;
  const pops = await listPopsForUser(user);
  const isAdmin = user.role === 'ADMIN';
  const units = isAdmin
    ? await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
    : [];
  const publico = isAdmin ? await opcoesDePublico(user) : { funcoes: [], colaboradores: [] };
  const podeAbrir = await permissaoDeRota(user.role);
  const veAcompanhamento = podeAbrir('/modulos/treinamentos/acompanhamento');

  return (
    <div className="space-y-4">
      <LargeTitle title="POPs" />
      <FamilyTabs active="/modulos/pops" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/modulos/treinamentos" className="flex items-center gap-2 rounded-lg border bg-surface px-4 py-3 text-sm font-semibold text-brand transition-colors hover:border-brand">
          <GraduationCap className="h-5 w-5 text-brand" /> Treinamentos da unidade
        </Link>
        {veAcompanhamento && (
          <Link href="/modulos/treinamentos/acompanhamento" className="flex items-center gap-2 rounded-lg border bg-surface px-4 py-3 text-sm font-semibold text-brand transition-colors hover:border-brand">
            <BarChart3 className="h-5 w-5 text-brand" /> Treinamentos — Acompanhamento da rede
          </Link>
        )}
      </div>
      {isAdmin && <PopEditor units={units} standardSectors={STANDARD_SECTORS} publico={publico} />}
      <div className="space-y-2">
        {pops.length === 0 && <p className="text-sm text-ink-500">Nenhum POP publicado.</p>}
        {pops.map((p) => (
          <Link key={p.id} href={`/modulos/pops/${p.id}`}>
            <Card className="transition-colors hover:border-brand">
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="font-semibold text-ink-900">{p.title} <span className="text-xs font-normal text-ink-500">v{p.version}</span></p>
                  <p className="text-xs text-ink-500">
                    {[
                      p.category,
                      p.modules.length > 0 ? `${p.modules.length} módulo(s): ${p.modules.map((m) => m.name).join(', ')}` : 'Sem módulos',
                      p.modules.some((m) => m.allPublic) ? 'com módulo geral' : null,
                      p.modules.some((m) => m.jobTitles.length || m._count.collaborators || m._count.sectors) ? 'direcionado por função' : null,
                      p.recurrence === 'MONTHLY' ? 'Mensal' : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <StatusBadge tone={p.confirmed ? 'success' : 'medium'}>{p.confirmed ? 'Lido' : 'Confirmar'}</StatusBadge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
