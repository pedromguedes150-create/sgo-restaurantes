import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { UsersAdmin } from '@/components/admin/users-admin';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function UsuariosAdminPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-muted-foreground">Restrito ao Administrador.</p>;
  const [users, units] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, role: true, active: true, memberships: { select: { unitId: true } } } }),
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const usersRows = users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, unitIds: u.memberships.map((m) => m.unitId) }));

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-brand">Usuários</h1>
      <Card><CardContent className="pt-4">
        <UsersAdmin users={usersRows} units={units} meId={user.id} />
      </CardContent></Card>
    </div>
  );
}
