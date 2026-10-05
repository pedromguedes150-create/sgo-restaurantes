import Link from 'next/link';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listPopsForUser } from '@/lib/pops';
import { STANDARD_SECTORS } from '@/lib/workforce';
import { opcoesDePublico } from '@/lib/treinamentos/publico';
import { permissaoDeRota } from '@/lib/permissions/links';
import { Group } from '@/components/ui/ds/group';
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
      {/* Cabeçalho do kit (Fase 4): família no subtítulo e os dois atalhos de
          Treinamentos como ações. */}
      <LargeTitle
        title="POPs"
        subtitle={<FamilyTabs active="/modulos/pops" />}
        actions={
          <>
            <Link href="/modulos/treinamentos" className="sgo-btn"><GraduationCap className="h-3.5 w-3.5" /> Treinamentos da unidade</Link>
            {veAcompanhamento && (
              <Link href="/modulos/treinamentos/acompanhamento" className="sgo-btn"><BarChart3 className="h-3.5 w-3.5" /> Treinamentos — Acompanhamento da rede</Link>
            )}
          </>
        }
      />
      {isAdmin && <PopEditor units={units} standardSectors={STANDARD_SECTORS} publico={publico} />}
      {/* A lista de POPs em painel sólido com uma linha por POP. */}
      <div className="space-y-2">
        {pops.length === 0 && <p className="text-sm text-ink-500">Nenhum POP publicado.</p>}
        <Group>
        {pops.map((p) => (
          <Link key={p.id} href={`/modulos/pops/${p.id}`} className="sgo-row min-h-12 outline-none focus-visible:shadow-sgo-focus" style={{ borderTop: 0 }}>
                <div className="sgo-row__main">
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
          </Link>
        ))}
        </Group>
      </div>
    </div>
  );
}
