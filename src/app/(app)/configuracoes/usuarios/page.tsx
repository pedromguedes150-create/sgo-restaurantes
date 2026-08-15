import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { UsersAdmin } from '@/components/admin/users-admin';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function UsuariosAdminPage() {
  const user = (await getSessionUser())!;
  const isAdmin = user.role === 'ADMIN';
  const isViewer = user.role === 'SUPERVISOR' || user.role === 'CEO'; // 16/07: supervisão visualiza dados (CPF etc.)
  if (!isAdmin && !isViewer) return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  const [users, units] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, cpf: true, email: true, role: true, active: true, memberships: { select: { unitId: true } } } }),
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const usersRows = users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, unitIds: u.memberships.map((m) => m.unitId) }));

  if (!isAdmin) {
    // Visualização (Supervisor/CEO): dados completos, sem edição
    const { roleLabel } = await import('@/lib/roles');
    const unitBy = new Map(units.map((un) => [un.id, un.name]));
    const fmtCpf = (c: string | null) => (c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : '—');
    return (
      <div className="space-y-4">
        <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
        <LargeTitle title="Usuários (visualização)" subtitle="Dados preenchidos por cada usuário no Meu Perfil. Edição é restrita ao Administrador." />
        <Card><CardContent className="space-y-2 pt-4">
          {users.map((u) => (
            <div key={u.id} className="rounded-lg border bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-brand">{u.name}{!u.active && <span className="ml-1 text-xs text-danger">(inativo)</span>}</p>
                <span className="text-xs text-ink-500">{roleLabel(u.role)}</span>
              </div>
              <p className="text-xs text-ink-500">CPF {fmtCpf(u.cpf)} · {u.email}</p>
              <p className="text-xs text-ink-500">{u.memberships.map((m) => unitBy.get(m.unitId)).filter(Boolean).join(', ') || 'Sem unidade'}</p>
            </div>
          ))}
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Usuários" />
      <p className="text-sm text-ink-500">CPF e nome completo cada usuário preenche no próprio <Link href="/perfil" className="font-semibold text-brand">Meu Perfil</Link> (avatar no topo).</p>
      <Card><CardContent className="pt-4">
        <UsersAdmin users={usersRows} units={units} meId={user.id} />
      </CardContent></Card>
    </div>
  );
}
