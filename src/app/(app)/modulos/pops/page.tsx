import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listPopsForUser } from '@/lib/pops';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PopCreate } from '@/components/pops/pop-create';
import { BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PopsPage() {
  const user = (await getSessionUser())!;
  const pops = await listPopsForUser(user);
  const isAdmin = user.role === 'ADMIN';
  const units = isAdmin
    ? await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
    : [];

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><BookOpen className="h-5 w-5 text-accent" /> POPs</h1>
      {isAdmin && <PopCreate units={units} />}
      <div className="space-y-2">
        {pops.length === 0 && <p className="text-sm text-muted-foreground">Nenhum POP publicado.</p>}
        {pops.map((p) => (
          <Link key={p.id} href={`/modulos/pops/${p.id}`}>
            <Card className="transition-colors hover:border-accent">
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="font-semibold text-brand">{p.title} <span className="text-xs font-normal text-muted-foreground">v{p.version}</span></p>
                  <p className="text-xs text-muted-foreground">{[p.category, p.sector].filter(Boolean).join(' · ') || 'Geral'}</p>
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
